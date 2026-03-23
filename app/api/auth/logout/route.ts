import { NextResponse } from 'next/server'
import { clearSessionCookieArgs } from '@/lib/session'

export async function POST() {
  const response = NextResponse.json({ success: true })
  const clearArgs = clearSessionCookieArgs()
  response.cookies.set(clearArgs)
  return response
}
