import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'
import { invalidateWorktreeCache } from '@/lib/tools'
import { cleanupWorktreeOnDisk } from '@/lib/worktree'
import { killRun } from '@/lib/workflows/shared/process-registry'

interface RouteContext {
  params: Promise<{ id: string; worktreeId: string }>
}

// POST — permanently remove the worktree from the user's perspective.
//
//   - DB rows stay intact (status='deleted' + deletedAt) — preserves
//     the codename so generateWorktreeCodename never reissues it, and
//     keeps a dataset for ML training + audit trail.
//   - On-disk working dir + git branch get cleaned (best-effort) so
//     git refs don't accumulate over weeks of testing. Failures are
//     logged but don't roll back the DB flip — the user already chose
//     to throw the worktree away.
//   - Ports release so the range can be reused by new worktrees.
export async function POST(_request: NextRequest, context: RouteContext) {
  const { id, worktreeId } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const wt = await prisma.worktree.findUnique({
    where: { id: worktreeId },
    select: { projectId: true, worktreePath: true, branchName: true },
  })
  if (!wt || wt.projectId !== id) {
    return NextResponse.json({ error: 'Worktree not found' }, { status: 404 })
  }

  const sessionIds = (await prisma.chatSession.findMany({
    where: { worktreeId },
    select: { id: true },
  })).map((s) => s.id)

  // Cancel any in-flight workflow runs first — both the DB flag (so the
  // runner's next checkpoint exits) and SIGTERM the spawned child (so
  // file edits stop immediately). Without this, the runner keeps writing
  // to a directory we're about to wipe.
  if (sessionIds.length > 0) {
    const liveRuns = await prisma.workflowRun.findMany({
      where: { sessionId: { in: sessionIds }, status: { in: ['pending', 'running'] } },
      select: { id: true },
    })
    if (liveRuns.length > 0) {
      await prisma.workflowRun.updateMany({
        where: { id: { in: liveRuns.map((r) => r.id) } },
        data: { status: 'cancelled', completedAt: new Date(), errorReason: 'worktree deleted' },
      })
      let killedCount = 0
      for (const r of liveRuns) {
        if (killRun(r.id)) killedCount++
      }
      console.log(`[wt-delete-forever] cancelled_runs=${liveRuns.length} killed_children=${killedCount} worktreeId=${worktreeId.slice(0, 8)}`)
    }
  }

  // Flip every chat + its messages to 'deleted' with the same timestamp
  // so every query layer agrees "this worktree is gone". Stamping both
  // `status` and `deletedAt` keeps text-based and null-based checks
  // consistent across the codebase.
  const tStart = Date.now()
  const now = new Date()
  const [msgsRes] = await prisma.$transaction([
    prisma.chatMessage.updateMany({
      where: { sessionId: { in: sessionIds }, deletedAt: null },
      data: { deletedAt: now },
    }),
    prisma.chatSession.updateMany({
      where: { worktreeId },
      data: { status: 'deleted', deletedAt: now },
    }),
    prisma.worktree.update({
      where: { id: worktreeId },
      data: {
        status: 'deleted',
        deletedAt: now,
        // Release the port slot so new worktrees can reuse it; keep
        // branchName + worktreePath for admin restore.
        portBase: null,
      },
    }),
  ])

  // Drop the in-process resolver cache for every chat that lived in this worktree
  for (const sid of sessionIds) invalidateWorktreeCache(sid)

  // Disk + git cleanup — best-effort. The DB flip above already happened
  // and the user saw the UI react; if cleanup fails we log a warn so an
  // investigator can find the orphan, but we don't surface an error.
  await cleanupWorktreeOnDisk(id, wt.worktreePath, wt.branchName, 'delete-forever')
  console.log(`[wt-delete-forever] worktreeId=${worktreeId.slice(0, 8)} branch=${wt.branchName} sessions=${sessionIds.length} messages=${msgsRes.count} ms=${Date.now() - tStart}`)

  return NextResponse.json({ success: true })
}
