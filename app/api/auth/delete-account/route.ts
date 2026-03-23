import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getSessionUserId } from '@/lib/session'
import { clearSessionCookieArgs } from '@/lib/session'
import { verifyPassword } from '@/lib/password'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const userId = getSessionUserId(cookieStore.get('session')?.value)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { password } = (await request.json()) as { password?: string }

  if (!password) {
    return NextResponse.json(
      { error: 'Password is required to delete your account' },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Verify password before deletion
  const valid = await verifyPassword(password, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Password is incorrect' }, { status: 401 })
  }

  // Delete user — cascade deletes all projects, tasks, etc.
  await prisma.user.delete({ where: { id: userId } })

  // Clear session
  const response = NextResponse.json({ success: true })
  response.cookies.set(clearSessionCookieArgs())
  return response
}
