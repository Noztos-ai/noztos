// GET /api/projects/[id]/chat-sessions/[sessionId]/active-workflow
//
// Returns the in-flight WorkflowRun (if any) tied to this chat session so
// the delete-chat confirmation modal can warn the user before discarding
// it. Mirrors the worktree-level endpoint but scoped to a single session.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; sessionId: string }>
}

export async function GET(_request: NextRequest, context: RouteContext) {
  const { id, sessionId } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const session = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    select: { projectId: true },
  })
  if (!session || session.projectId !== id) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const run = await prisma.workflowRun.findFirst({
    where: { sessionId, status: { in: ['pending', 'running'] } },
    orderBy: { createdAt: 'desc' },
    select: { id: true, workflowType: true, status: true },
  })

  if (!run) return NextResponse.json({ activeRunId: null })

  return NextResponse.json({
    activeRunId: run.id,
    workflowType: run.workflowType,
    status: run.status,
  })
}
