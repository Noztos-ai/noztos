import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'
import { syncRepoFiles } from '@/lib/github'

interface RouteParams {
  params: Promise<{ id: string }>
}

export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const auth = await verifyProjectAccess(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
    const result = await syncRepoFiles(
      repository.id,
      user.githubToken,
      repository.githubOwner,
      repository.githubRepo,
      repository.githubBranch
    )
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sync failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
