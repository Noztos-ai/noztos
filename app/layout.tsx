import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { Geist, Geist_Mono } from 'next/font/google'
import { getSessionUserId } from '@/lib/session'
import { AuthModalProvider } from '@/components/AuthModal'
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
  title: 'Bornastar',
  description: 'AI-powered companies with teams of AI employees',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const cookieStore = await cookies()
  const sessionValue = cookieStore.get('session')?.value
  const hasSession = !!getSessionUserId(sessionValue)

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthModalProvider initialOpen={!hasSession}>
          {children}
        </AuthModalProvider>
      </body>
    </html>
  )
}
