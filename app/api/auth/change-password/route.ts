import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getSessionUserId } from '@/lib/session'
import { verifyPassword, hashPassword, validatePassword } from '@/lib/password'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const userId = getSessionUserId(cookieStore.get('session')?.value)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { currentPassword, newPassword } = (await request.json()) as {
    currentPassword?: string
    newPassword?: string
  }

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: 'Current password and new password are required' },
      { status: 400 }
    )
  }

  // Validate new password strength
  const passwordError = validatePassword(newPassword)
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { passwordHash: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  // Verify current password
  const valid = await verifyPassword(currentPassword, user.passwordHash)
  if (!valid) {
    return NextResponse.json({ error: 'Current password is incorrect' }, { status: 401 })
  }

  // Update password
  const newHash = await hashPassword(newPassword)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  })

  return NextResponse.json({ success: true })
}
