// GET /api/projects/[id]/worktrees/[worktreeId]/active-workflow
//
// Returns the in-flight WorkflowRun (if any) for this worktree so the
// delete/archive confirmation modal can warn the user before throwing
// the worktree away. Only one run can be active per session at a time;
// across sessions of the same worktree we return whichever is running.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; worktreeId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id, worktreeId } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const wt = await prisma.worktree.findUnique({
    where: { id: worktreeId },
    select: { projectId: true },
  })
  if (!wt || wt.projectId !== id) {
    return NextResponse.json({ error: 'Worktree not found' }, { status: 404 })
  }

  const sessionIds = (await prisma.chatSession.findMany({
    where: { worktreeId, deletedAt: null },
    select: { id: true },
  })).map((s) => s.id)

  if (sessionIds.length === 0) {
    return NextResponse.json({ activeRunId: null })
  }

  const run = await prisma.workflowRun.findFirst({
    where: { sessionId: { in: sessionIds }, status: { in: ['pending', 'running'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, workflowType: true, status: true, sessionId: true },
  })

  if (!run) return NextResponse.json({ activeRunId: null })

  return NextResponse.json({
    activeRunId: run.id,
    workflowType: run.workflowType,
    status: run.status,
    sessionId: run.sessionId,
  })
}
