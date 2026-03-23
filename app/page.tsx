import { cookies } from 'next/headers'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/db'
import { getGitHubUser } from '@/lib/github'
import { Header } from '@/components/Header'
import { ProjectList } from '@/components/ProjectList'
import type { BadgeState } from '@/components/ClaudeBadge'
import type { GitHubBadgeState } from '@/components/GitHubBadge'

export default async function Home() {
  const cookieStore = await cookies()
  const sessionValue = cookieStore.get('session')?.value
  const userId = getSessionUserId(sessionValue)

  let badgeState: BadgeState = 'no_key'
  let githubState: GitHubBadgeState = 'not_connected'
  let githubUsername = ''
  let projects: { id: string; name: string; createdAt: Date }[] = []
  let userName = ''

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        anthropicToken: true,
        githubToken: true,
        projects: {
          select: { id: true, name: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    })
    badgeState = user?.anthropicToken ? 'active' : 'no_key'
    projects = user?.projects ?? []
    userName = user?.name ?? ''

    if (user?.githubToken) {
      try {
        const ghUser = await getGitHubUser(user.githubToken)
        if (ghUser) {
          githubState = 'connected'
          githubUsername = ghUser.login
        }
      } catch {
        // Token expired or invalid
      }
    }
  }

  return (
    <div className="flex flex-col flex-1 bg-zinc-200 font-sans dark:bg-zinc-950">
      <Header
        claudeState={badgeState}
        githubState={githubState}
        githubUsername={githubUsername}
        userName={userName}
      />
      <main className="flex flex-1 w-full max-w-4xl mx-auto flex-col px-6 py-8">
        <ProjectList projects={projects} />
      </main>
    </div>
  )
}
