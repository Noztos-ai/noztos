import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET — get project info + safety checks for deletion
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const project = await prisma.project.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      repository: {
        select: {
          id: true,
          githubOwner: true,
          githubRepo: true,
          files: { where: { isModified: true }, select: { id: true } },
        },
      },
    },
  })

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const pendingTasks = await prisma.task.count({ where: { projectId: id, status: { in: ['pending', 'queue', 'progress'] } } })
  const uncommittedChanges = project.repository?.files?.length ?? 0

  return NextResponse.json({
    project: { id: project.id, name: project.name },
    repository: project.repository ? { owner: project.repository.githubOwner, repo: project.repository.githubRepo } : null,
    warnings: {
      uncommittedChanges,
      pendingTasks,
    },
  })
}

// DELETE — delete project (only removes from Bornastar, not GitHub)
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const project = await prisma.project.findFirst({
    where: { id, userId: access.userId },
    select: { id: true },
  })

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  // Cascade delete handles everything (repo files, tasks, chat messages, etc.)
  await prisma.project.delete({ where: { id } })

  return new NextResponse(null, { status: 204 })
}
