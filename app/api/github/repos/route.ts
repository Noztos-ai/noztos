import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getSessionUserId } from '@/lib/session'
import { listUserRepos } from '@/lib/github'

export async function GET() {
  const cookieStore = await cookies()
  const userId = getSessionUserId(cookieStore.get('session')?.value)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubToken: true },
  })

  if (!user?.githubToken) {
    return NextResponse.json({ error: 'GitHub not connected' }, { status: 400 })
  }

  const repos = await listUserRepos(user.githubToken)
  return NextResponse.json({ repos })
}
