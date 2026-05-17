// Cloud Mirror — cleanup helper invoked when a worktree is removed.
//
// The user's mental model when deleting a worktree:
//   - chats + tasks survive (they're "knowledge" — past conversations,
//     completed work) → handled by the existing soft-delete on those
//     models (ChatSession.deletedAt, Task.deletedAt).
//   - the worktree ITSELF goes away → including its mirror state.
//     File entries, branch/commit pointer, unpushed commits, and any
//     live cloud sandbox are infra-level data, not knowledge — keeping
//     them around just inflates storage and leaves zombie sandboxes
//     billable on E2B.
//
// This helper performs that infra-level cleanup. Call from:
//   - /api/projects/[id]/worktrees/[wid]/delete-forever  (primary)
//   - /api/projects/[id]/worktrees/[wid]/trash           (when wired)
//   - any future "purge" / GC pathway

import { Sandbox } from 'e2b'
import { prisma } from '@/lib/db'
import { evictContextCache } from '@/lib/compute-router'
import { evictSandboxCache } from '@/lib/compute-e2b'

const E2B_API_KEY = process.env.E2B_API_KEY

export interface MirrorCleanupResult {
  fileEntriesDeleted: number
  unpushedDeleted: number
  mirrorDeleted: boolean
  blobsReleased: number  // GitObject rows decremented (not deleted; GC handles purge)
  sandboxesKilled: number
  sandboxSessionsDestroyed: number
}

export async function cleanupMirrorForWorktree(
  worktreeId: string,
): Promise<MirrorCleanupResult> {
  const result: MirrorCleanupResult = {
    fileEntriesDeleted: 0,
    unpushedDeleted: 0,
    mirrorDeleted: false,
    blobsReleased: 0,
    sandboxesKilled: 0,
    sandboxSessionsDestroyed: 0,
  }

  // 1. Read existing file entries first so we know which GitObject hashes
  //    to decrement. We use the count for the response; the (hash, count)
  //    pairs feed the refCount adjustments.
  const entries = await prisma.worktreeFileEntry.findMany({
    where: { worktreeId },
    select: { hash: true },
  })
  result.fileEntriesDeleted = entries.length
  // Group hashes → count, so a worktree with 5 paths to the same blob
  // decrements refCount by 5 in one update.
  const hashDelta = new Map<string, number>()
  for (const e of entries) hashDelta.set(e.hash, (hashDelta.get(e.hash) ?? 0) + 1)
  result.blobsReleased = hashDelta.size

  // 2. Hard-delete mirror rows in a single transaction. These don't
  //    represent knowledge — they're indices into encrypted blob storage.
  //    Knowledge (chats + tasks) is preserved by the calling endpoint.
  await prisma.$transaction(
    async (tx) => {
      const fe = await tx.worktreeFileEntry.deleteMany({ where: { worktreeId } })
      result.fileEntriesDeleted = fe.count
      const uc = await tx.unpushedCommit.deleteMany({ where: { worktreeId } })
      result.unpushedDeleted = uc.count
      const wm = await tx.worktreeMirror.deleteMany({ where: { worktreeId } })
      result.mirrorDeleted = wm.count > 0
      // Decrement each blob's refCount. When the count hits 0 the
      // nightly GC job (cleanup-blobs) will purge the row — we don't
      // delete here to avoid racing with concurrent uploads from other
      // worktrees that might just have looked up the hash.
      for (const [hash, delta] of hashDelta) {
        // userId pulled from the worktree → project → user chain. We
        // need it because GitObject's PK is (userId, hash).
        // findUnique avoided here — we just decrement; if the row
        // doesn't exist (impossible but defensive) the update silently
        // no-ops.
        const wt = await tx.worktree.findUnique({
          where: { id: worktreeId },
          select: { userId: true },
        })
        if (!wt) break
        await tx.gitObject.updateMany({
          where: { userId: wt.userId, hash },
          data: { refCount: { decrement: delta } },
        })
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  )

  // 3. Tear down any live cloud sandbox for this worktree. Without this
  //    we'd keep paying E2B for a sandbox no one can reach again.
  const sessions = await prisma.sandboxSession.findMany({
    where: {
      worktreeId,
      status: { in: ['provisioning', 'materializing', 'ready'] },
      destroyedAt: null,
    },
  })
  if (sessions.length > 0) {
    await prisma.sandboxSession.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { status: 'destroyed', destroyedAt: new Date(), errorReason: 'worktree deleted' },
    })
    result.sandboxSessionsDestroyed = sessions.length

    if (E2B_API_KEY) {
      for (const s of sessions) {
        if (!s.e2bSandboxId) continue
        try {
          const sandbox = await Sandbox.connect(s.e2bSandboxId, { apiKey: E2B_API_KEY })
          await sandbox.kill()
          result.sandboxesKilled++
        } catch (err) {
          console.warn(`[mirror-cleanup] kill sandbox=${s.e2bSandboxId.slice(0, 8)} failed:`, err)
        }
      }
    }
  }

  // 4. Drop in-memory caches so the routing flips immediately even if
  //    a stale event lingers somewhere.
  evictContextCache(worktreeId)
  evictSandboxCache(worktreeId)

  return result
}
