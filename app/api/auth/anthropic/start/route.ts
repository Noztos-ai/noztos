import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

// OAuth 2.0 authorization code flow — Step 1: redirect to Anthropic.
//
// Flow:
//   GET /api/auth/anthropic/start
//     → generate 64-char hex state, store in httpOnly cookie (10-min TTL)
//     → 302 to Anthropic authorization endpoint

const STATE_COOKIE = 'auth_state'
const STATE_TTL = 60 * 10 // 10 minutes
const ANTHROPIC_AUTH_URL = 'https://claude.ai/oauth/authorize'

export async function GET(request: Request) {
  const clientId = process.env.ANTHROPIC_CLIENT_ID
  const redirectUri = process.env.ANTHROPIC_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return new NextResponse('OAuth not configured: missing ANTHROPIC_CLIENT_ID or ANTHROPIC_REDIRECT_URI', {
      status: 500,
    })
  }

  const state = randomBytes(32).toString('hex') // 64-char hex

  const authUrl = new URL(ANTHROPIC_AUTH_URL)
  authUrl.searchParams.set('response_type', 'code')
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', 'org:create_api_key user:email user:profile')
  authUrl.searchParams.set('state', state)

  const response = NextResponse.redirect(authUrl.toString())
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: STATE_TTL,
  })

  return response
}
