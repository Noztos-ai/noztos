import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'
import { pushChangesToGitHub } from '@/lib/github'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const auth = await verifyProjectAccess(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { commitMessage } = (await request.json()) as { commitMessage?: string }
  if (!commitMessage) {
    return NextResponse.json({ error: 'commitMessage is required' }, { status: 400 })
  }

  const repository = await prisma.repository.findUnique({ where: { projectId: id } })
  if (!repository) {
    return NextResponse.json({ error: 'No repository connected' }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    select: { githubToken: true },
  })
  if (!user?.githubToken) {
    return NextResponse.json({ error: 'GitHub not connected' }, { status: 400 })
  }

  try {
    const result = await pushChangesToGitHub(repository.id, user.githubToken, commitMessage)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Push failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
