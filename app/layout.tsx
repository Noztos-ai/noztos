import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Geist, Geist_Mono } from 'next/font/google'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/db'
import { AuthModalProvider } from '@/components/AuthModal'
import { SettingsModalProvider } from '@/components/SettingsModal'
import { GitHubModalProvider } from '@/components/GitHubModal'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Noztos',
  description: 'Cloud-failover dev environment for Claude Code',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const sessionValue = cookieStore.get('session')?.value
  const userId = getSessionUserId(sessionValue)

  let userName = ''
  let userEmail = ''
  let githubConnected = false

  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true, githubToken: true },
    })
    userName = user?.name ?? ''
    userEmail = user?.email ?? ''
    githubConnected = !!user?.githubToken
  }

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SettingsModalProvider userName={userName} userEmail={userEmail}>
          <GitHubModalProvider isConnected={githubConnected}>
            <AuthModalProvider initialOpen={false}>
              {children}
            </AuthModalProvider>
          </GitHubModalProvider>
        </SettingsModalProvider>
      </body>
    </html>
  )
}
