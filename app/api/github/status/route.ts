import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getGitHubUser } from '@/lib/github'

export async function GET() {
  const cookieStore = await cookies()
  const sessionValue = cookieStore.get('session')?.value
  const userId = getSessionUserId(sessionValue)
  if (!userId) return NextResponse.json({ connected: false })

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { githubToken: true },
  })

  if (!user?.githubToken) {
    return NextResponse.json({ connected: false })
  }

  try {
    const ghUser = await getGitHubUser(user.githubToken)
    if (ghUser) {
      return NextResponse.json({
        connected: true,
        username: ghUser.login,
        avatarUrl: ghUser.avatarUrl,
      })
    }
  } catch {}

  return NextResponse.json({ connected: false })
}
