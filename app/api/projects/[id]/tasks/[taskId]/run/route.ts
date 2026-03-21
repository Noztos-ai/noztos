import { NextRequest, NextResponse } from 'next/server'
import { verifyProjectAccess } from '@/lib/auth'
import { startPipeline } from '@/lib/pipeline'
import { prisma } from '@/lib/db'

interface RouteContext {
  params: Promise<{ id: string; taskId: string }>
}

// POST /api/projects/[id]/tasks/[taskId]/run — trigger pipeline execution
export async function POST(_request: NextRequest, context: RouteContext) {
  const { id, taskId } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Verify task belongs to this project
  const task = await prisma.task.findFirst({
    where: { id: taskId, projectId: id },
    select: { id: true, status: true },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const result = await startPipeline(taskId)

  if (result.status === 'error') {
    return NextResponse.json({ error: result.message }, { status: 400 })
  }

  return NextResponse.json(result)
}
