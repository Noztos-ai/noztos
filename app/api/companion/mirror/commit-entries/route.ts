// POST /api/companion/mirror/commit-entries
//
// Daemon commits a batch of file entry changes for one worktree. This is
// where WorktreeFileEntry rows get upserted and removed, and where the
// refCount on GitObject is maintained — both happen in one transaction
// so refCount stays consistent.
//
// Body: {
//   worktreeId: string
//   upserts: [{ path, hash, mode, status }]   // create or update entry
//   removedPaths: string[]                    // delete entry
// }
//
// Behavior:
//   For each upsert:
//     - if entry exists with same hash: no-op
//     - if entry exists with different hash: refCount-- on old, refCount++ on new, update row
//     - if entry doesn't exist: refCount++ on new hash, create row
//   For each removed path:
//     - if entry exists: refCount-- on hash, delete row
//     - if entry doesn't exist: no-op
//
// Reply: { ok: true, upserted: N, removed: N }

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

interface UpsertEntry {
  path: string
  hash: string
  mode: number
  status: 'tracked' | 'untracked' | 'modified'
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    worktreeId?: unknown
    upserts?: unknown
    removedPaths?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }

  if (typeof body.worktreeId !== 'string') {
    return NextResponse.json({ error: 'worktreeId required' }, { status: 400 })
  }
  const upsertsArr = Array.isArray(body.upserts) ? (body.upserts as UpsertEntry[]) : []
  const removedArr = Array.isArray(body.removedPaths)
    ? (body.removedPaths as string[]).filter((p) => typeof p === 'string')
    : []

  // Ownership check: worktree must belong to this user.
  const worktree = await prisma.worktree.findFirst({
    where: { id: body.worktreeId, userId: auth.userId },
    select: { id: true },
  })
  if (!worktree) {
    return NextResponse.json({ error: 'worktree not found' }, { status: 404 })
  }

  // Fetch existing entries to figure out diffs (no-op vs hash-change vs new).
  const allPaths = [
    ...upsertsArr.map((u) => u.path),
    ...removedArr,
  ]
  const existing = allPaths.length
    ? await prisma.worktreeFileEntry.findMany({
        where: { worktreeId: body.worktreeId, path: { in: allPaths } },
        select: { id: true, path: true, hash: true },
      })
    : []
  const existingByPath = new Map(existing.map((e) => [e.path, e]))

  // Build refCount deltas: { hash: int }
  const refDelta = new Map<string, number>()
  const bump = (h: string, n: number) =>
    refDelta.set(h, (refDelta.get(h) ?? 0) + n)

  let upserted = 0
  let removed = 0

  // First pass: validate input and compute refDelta. Actual writes
  // happen inside the interactive transaction below so refCount and
  // entry mutations land together.
  for (const u of upsertsArr) {
    if (
      typeof u.path !== 'string' ||
      typeof u.hash !== 'string' ||
      typeof u.mode !== 'number' ||
      typeof u.status !== 'string'
    ) {
      return NextResponse.json({ error: 'invalid upsert entry' }, { status: 400 })
    }
    const prev = existingByPath.get(u.path)
    if (prev?.hash === u.hash) {
      // hash unchanged — refCount stays, only syncedAt refreshes
      upserted++
      continue
    }
    if (prev) {
      bump(prev.hash, -1)
      bump(u.hash, 1)
    } else {
      bump(u.hash, 1)
    }
    upserted++
  }

  for (const p of removedArr) {
    const prev = existingByPath.get(p)
    if (!prev) continue
    bump(prev.hash, -1)
    removed++
  }

  // Apply refCount deltas. We do this BEFORE the entry writes so a partial
  // failure leaves refCount inflated (GC will reconcile) rather than
  // deflated (which would risk premature blob deletion).
  //
  // Timeout: initial sync of a fresh worktree can have hundreds of
  // updates in this single transaction (one refCount bump per blob +
  // one entry create/update per file). Default Prisma timeout is 5s
  // which is too tight; 60s gives plenty of headroom for any
  // realistic worktree. The array-form $transaction doesn't accept
  // a timeout — we use the interactive (function) form, awaiting each
  // op sequentially. Order is still refCount-first → entry-writes.
  await prisma.$transaction(
    async (tx) => {
      for (const [hash, delta] of refDelta) {
        await tx.gitObject.update({
          where: { userId_hash: { userId: auth.userId, hash } },
          data: { refCount: { increment: delta } },
        })
      }
      for (const u of upsertsArr) {
        const prev = existingByPath.get(u.path)
        if (prev?.hash === u.hash) {
          await tx.worktreeFileEntry.update({
            where: { worktreeId_path: { worktreeId: body.worktreeId as string, path: u.path } },
            data: { mode: u.mode, status: u.status, syncedAt: new Date() },
          })
        } else if (prev) {
          await tx.worktreeFileEntry.update({
            where: { worktreeId_path: { worktreeId: body.worktreeId as string, path: u.path } },
            data: { hash: u.hash, mode: u.mode, status: u.status, syncedAt: new Date() },
          })
        } else {
          await tx.worktreeFileEntry.create({
            data: {
              worktreeId: body.worktreeId as string,
              path: u.path,
              hash: u.hash,
              mode: u.mode,
              status: u.status,
            },
          })
        }
      }
      for (const p of removedArr) {
        const prev = existingByPath.get(p)
        if (!prev) continue
        await tx.worktreeFileEntry.delete({
          where: { worktreeId_path: { worktreeId: body.worktreeId as string, path: p } },
        })
      }
    },
    { timeout: 60_000, maxWait: 10_000 },
  )

  return NextResponse.json({ ok: true, upserted, removed })
}
