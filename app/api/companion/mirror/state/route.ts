// POST /api/companion/mirror/state
//
// Daemon updates the WorktreeMirror pointer: branch, commit, sync stats.
// Called after batches of commit-entries finish, or on heartbeat.
//
// Also creates the WorktreeMirror row lazily on first call for a worktree.
//
// Body: {
//   worktreeId: string,
//   currentBranch: string,
//   currentCommitSha: string,
//   treeRootHash?: string,
//   totalSizeBytes?: number,
//   fileCount?: number,
//   status?: 'warming' | 'ready'    // daemon flips to 'ready' after initial walk
// }
//
// Reply: { ok: true }

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: {
    worktreeId?: unknown
    currentBranch?: unknown
    currentCommitSha?: unknown
    treeRootHash?: unknown
    totalSizeBytes?: unknown
    fileCount?: unknown
    status?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }

  if (
    typeof body.worktreeId !== 'string' ||
    typeof body.currentBranch !== 'string' ||
    typeof body.currentCommitSha !== 'string'
  ) {
    return NextResponse.json(
      { error: 'worktreeId, currentBranch, currentCommitSha required' },
      { status: 400 }
    )
  }

  const worktree = await prisma.worktree.findFirst({
    where: { id: body.worktreeId, userId: auth.userId },
    select: { id: true },
  })
  if (!worktree) {
    return NextResponse.json({ error: 'worktree not found' }, { status: 404 })
  }

  const data = {
    currentBranch: body.currentBranch,
    currentCommitSha: body.currentCommitSha,
    treeRootHash: typeof body.treeRootHash === 'string' ? body.treeRootHash : undefined,
    totalSizeBytes:
      typeof body.totalSizeBytes === 'number' ? BigInt(body.totalSizeBytes) : undefined,
    fileCount: typeof body.fileCount === 'number' ? body.fileCount : undefined,
    status: typeof body.status === 'string' ? body.status : undefined,
    lastSyncAt: new Date(),
  }

  await prisma.worktreeMirror.upsert({
    where: { worktreeId: body.worktreeId },
    create: { worktreeId: body.worktreeId, ...data },
    update: data,
  })

  return NextResponse.json({ ok: true })
}
