// POST /api/companion/mirror/unpushed
//
// Daemon syncs the list of unpushed commits for a worktree. The wire
// pattern is "reconcile": daemon sends the FULL current set, server
// inserts new ones and deletes stale ones, leaving only what's in the
// payload after the call.
//
// Patch content is base64-encoded raw bytes; server compresses + encrypts.
//
// Body: {
//   worktreeId: string,
//   commits: [
//     {
//       commitSha, parentSha, message, authorName, authorEmail,
//       authorDate (ISO 8601), patchBase64, orderIndex
//     }
//   ]
// }
//
// Reply: { ok: true, inserted: N, deleted: N }

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { compressAndEncrypt } from '@/lib/mirror/crypto'

interface UnpushedCommitInput {
  commitSha: string
  parentSha: string
  message: string
  authorName: string
  authorEmail: string
  authorDate: string
  patchBase64: string
  orderIndex: number
}

const MAX_PATCH_BYTES = 5 * 1024 * 1024 // 5 MB per patch — large enough for any reasonable commit

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { worktreeId?: unknown; commits?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }

  if (typeof body.worktreeId !== 'string' || !Array.isArray(body.commits)) {
    return NextResponse.json(
      { error: 'worktreeId and commits required' },
      { status: 400 }
    )
  }

  const commits = body.commits as UnpushedCommitInput[]
  for (const c of commits) {
    if (
      typeof c.commitSha !== 'string' ||
      typeof c.parentSha !== 'string' ||
      typeof c.message !== 'string' ||
      typeof c.authorName !== 'string' ||
      typeof c.authorEmail !== 'string' ||
      typeof c.authorDate !== 'string' ||
      typeof c.patchBase64 !== 'string' ||
      typeof c.orderIndex !== 'number'
    ) {
      return NextResponse.json({ error: 'invalid commit entry' }, { status: 400 })
    }
  }

  const worktree = await prisma.worktree.findFirst({
    where: { id: body.worktreeId, userId: auth.userId },
    select: { id: true },
  })
  if (!worktree) {
    return NextResponse.json({ error: 'worktree not found' }, { status: 404 })
  }

  const desiredSet = new Set(commits.map((c) => c.commitSha))
  const existing = await prisma.unpushedCommit.findMany({
    where: { worktreeId: body.worktreeId },
    select: { commitSha: true },
  })
  const existingSet = new Set(existing.map((e) => e.commitSha))

  const toInsert = commits.filter((c) => !existingSet.has(c.commitSha))
  const toDelete = existing
    .filter((e) => !desiredSet.has(e.commitSha))
    .map((e) => e.commitSha)

  // Validate + encrypt patches up front (outside the transaction to keep
  // it short). If any patch is too big, fail before any writes. We pair
  // each input commit with the encrypted bytes so the transaction below
  // can build create() calls inline (avoids a type-narrowing quirk where
  // Buffer→Uint8Array via an intermediate variable trips Prisma's input
  // type — direct Uint8Array.from(...) inside the create() call works).
  const prepared: Array<{ input: typeof toInsert[number]; encrypted: Buffer }> = []
  for (const c of toInsert) {
    const patch = Buffer.from(c.patchBase64, 'base64')
    if (patch.length > MAX_PATCH_BYTES) {
      return NextResponse.json(
        { error: `patch for ${c.commitSha} exceeds ${MAX_PATCH_BYTES}` },
        { status: 413 }
      )
    }
    const encrypted = await compressAndEncrypt(patch, auth.userId)
    prepared.push({ input: c, encrypted })
  }

  // Same rationale as commit-entries — array-form $transaction caps at
  // 5s; we use the interactive form so we can lift that to 60s. Many
  // patches × inserts can exceed the default on a worktree with a
  // long unpushed history.
  await prisma.$transaction(
    async (tx) => {
      if (toDelete.length) {
        await tx.unpushedCommit.deleteMany({
          where: { worktreeId: body.worktreeId as string, commitSha: { in: toDelete } },
        })
      }
      for (const { input: c, encrypted } of prepared) {
        await tx.unpushedCommit.create({
          data: {
            worktreeId: body.worktreeId as string,
            commitSha: c.commitSha,
            parentSha: c.parentSha,
            message: c.message,
            authorName: c.authorName,
            authorEmail: c.authorEmail,
            authorDate: new Date(c.authorDate),
            patchContent: Uint8Array.from(encrypted),
            orderIndex: c.orderIndex,
          },
        })
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  )

  return NextResponse.json({
    ok: true,
    inserted: toInsert.length,
    deleted: toDelete.length,
  })
}
