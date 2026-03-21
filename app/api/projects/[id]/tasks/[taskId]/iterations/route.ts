import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>
}

// GET /api/projects/[id]/tasks/[taskId]/iterations — list task iterations with skill logs
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id, taskId } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId: id },
    select: { id: true },
  })
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const iterations = await prisma.taskIteration.findMany({
    where: { taskId },
    include: {
      skillLogs: {
        select: {
          id: true,
          collaboratorName: true,
          inputReceived: true,
          conclusion: true,
          approved: true,
          rejectionReason: true,
          startedAt: true,
          finishedAt: true,
        },
        orderBy: { startedAt: 'asc' },
      },
    },
    orderBy: { iterationNumber: 'asc' },
  })

  return NextResponse.json(iterations)
}
