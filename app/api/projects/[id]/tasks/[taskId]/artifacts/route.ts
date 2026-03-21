import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>
}

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

  const [buildLogs, suggestions] = await Promise.all([
    prisma.taskBuildLog.findMany({
      where: { taskId },
      select: {
        id: true,
        filesTouched: true,
        linesAdded: true,
        linesRemoved: true,
        technicalDecisions: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.taskSuggestion.findMany({
      where: { taskId },
      select: {
        id: true,
        suggestionText: true,
        reason: true,
        accepted: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return NextResponse.json({ buildLogs, suggestions })
}
