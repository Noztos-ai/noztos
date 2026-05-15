// GET /api/projects/[id]/tasks — list tasks for the project.
//
// Creation lives on /tasks/from-chat (the only intended entry point in
// the new design); this route is read-only. Optional filters:
//   ?status=pending|scheduled|running|done|failed
//   ?worktreeId=<id>          — scope to a worktree (branch)
//   ?limit=N                  — cap result count
//
// Default order: createdAt DESC (newest first), so the TasksPanel can
// drop them straight into columns without re-sorting client-side.

import { NextRequest, NextResponse } from 'next/server'
import { TaskStatus } from '@/generated/prisma/enums'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

const VALID_STATUSES = new Set<TaskStatus>(['pending', 'scheduled', 'running', 'done', 'failed'])

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const statusParam = request.nextUrl.searchParams.get('status')
  const worktreeIdParam = request.nextUrl.searchParams.get('worktreeId')
  const limitParam = request.nextUrl.searchParams.get('limit')
  const take = limitParam ? Math.max(1, Math.min(200, parseInt(limitParam, 10) || 0)) : undefined

  // Filter out soft-deleted tasks — `deletedAt` is the user-facing
  // delete marker; we keep the row for audit but never list it.
  const where: { projectId: string; status?: TaskStatus; worktreeId?: string; deletedAt: null } = {
    projectId: id,
    deletedAt: null,
  }
  if (statusParam && VALID_STATUSES.has(statusParam as TaskStatus)) {
    where.status = statusParam as TaskStatus
  }
  if (worktreeIdParam) where.worktreeId = worktreeIdParam

  const rows = await prisma.task.findMany({
    where,
    ...(take ? { take } : {}),
    select: {
      id: true,
      name: true,
      instruction: true,
      status: true,
      worktreeId: true,
      executorKind: true,
      executorId: true,
      chatMode: true,
      scheduledAt: true,
      reviewedAt: true,
      sourceTaskId: true,
      createdAt: true,
      updatedAt: true,
      contextSource: true,
      worktree: { select: { branchName: true } },
      // The currently-running iteration, if any. Lets the side-area
      // running card pick up the workflowRunId (workflow tasks) or the
      // iterationId (skill tasks) to subscribe for live transcript
      // without a separate per-row /tasks/[id] fetch.
      iterations: {
        where: { status: 'running' },
        orderBy: { iterationNumber: 'desc' },
        take: 1,
        select: { id: true, executorKind: true, workflowRunId: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Flatten the worktree + currentIteration so the client sees them as
  // flat fields. currentIteration is null when the task isn't running.
  const tasks = rows.map(({ worktree, iterations, ...task }) => ({
    ...task,
    branchName: worktree?.branchName ?? null,
    currentIteration: iterations[0]
      ? {
          id: iterations[0].id,
          executorKind: iterations[0].executorKind,
          workflowRunId: iterations[0].workflowRunId,
        }
      : null,
  }))

  return NextResponse.json({ tasks })
}
