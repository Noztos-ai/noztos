import { notFound, redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getSessionUserId } from '@/lib/session'
import { ProjectDashboardClient } from '@/components/ProjectDashboardClient'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ProjectPage({ params }: PageProps) {
  const { id } = await params
  const cookieStore = await cookies()
  const sessionValue = cookieStore.get('session')?.value
  const userId = getSessionUserId(sessionValue)

  if (!userId) redirect('/login')

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, name: true, userId: true },
  })

  if (!project || project.userId !== userId) notFound()

  const [collaborators, teams, chatMessages, tasks] = await Promise.all([
    prisma.collaborator.findMany({
      where: { projectId: id, isActive: true },
      select: { id: true, name: true, description: true, phase: true, skillMd: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.team.findMany({
      where: { projectId: id },
      select: { id: true, name: true, collaboratorOrder: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.chatMessage.findMany({
      where: { projectId: id },
      select: { id: true, content: true, sender: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    }),
    prisma.task.findMany({
      where: { projectId: id },
      select: {
        id: true,
        name: true,
        status: true,
        pausedAtEmployee: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return (
    <ProjectDashboardClient
      project={project}
      collaborators={collaborators}
      teams={teams.map((t) => ({
        id: t.id,
        name: t.name,
        collaboratorOrder: t.collaboratorOrder as unknown as { collaboratorIds: string[] },
      }))}
      initialMessages={chatMessages.map((m) => ({
        id: m.id,
        content: m.content,
        sender: m.sender,
        createdAt: m.createdAt.toISOString(),
      }))}
      tasks={tasks}
    />
  )
}
