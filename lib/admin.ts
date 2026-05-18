// Admin gate. Reads the separate `admin-session` cookie (see
// lib/admin-session.ts) — NOT the regular user `session` cookie. The
// two systems are fully independent: a logged-in user is not an admin
// just by virtue of being logged in, and an admin doesn't need a user
// account at all.

import { cookies } from 'next/headers'
import { getAdminUsername, ADMIN_COOKIE_NAME } from '@/lib/admin-session'

export async function requireAdmin(): Promise<{ username: string } | null> {
  const cookieStore = await cookies()
  const username = getAdminUsername(cookieStore.get(ADMIN_COOKIE_NAME)?.value)
  if (!username) return null
  return { username }
}
