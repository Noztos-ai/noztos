// POST /api/admin/logout — clears the admin cookie.

import { NextResponse } from 'next/server'
import { clearAdminCookieArgs } from '@/lib/admin-session'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(clearAdminCookieArgs())
  return response
}
