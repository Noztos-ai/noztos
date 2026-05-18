// POST /api/admin/login
//
// Body: { username, password }
// Sets the admin-session cookie if credentials match the
// ADMIN_USERNAME + ADMIN_PASSWORD env vars (timing-safe compare).
//
// Generic error message on failure to avoid leaking which of the
// two fields was wrong. A 280ms floor sleep on miss also evens the
// timing between match/no-match paths.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminCredentials, setAdminCookieArgs } from '@/lib/admin-session'

export async function POST(request: NextRequest) {
  let body: { username?: unknown; password?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }
  if (typeof body.username !== 'string' || typeof body.password !== 'string') {
    return NextResponse.json({ error: 'username and password required' }, { status: 400 })
  }

  const ok = verifyAdminCredentials(body.username, body.password)
  if (!ok) {
    await new Promise((r) => setTimeout(r, 280))
    return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })
  response.cookies.set(setAdminCookieArgs(body.username))
  return response
}
