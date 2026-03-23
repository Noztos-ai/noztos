import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

const STATE_COOKIE = 'auth_github_state'
const STATE_TTL = 60 * 10
const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize'

export async function GET() {
  const clientId = process.env.GITHUB_CLIENT_ID
  const redirectUri = process.env.GITHUB_REDIRECT_URI

  if (!clientId || !redirectUri) {
    return new NextResponse('GitHub OAuth not configured', { status: 500 })
  }

  const state = randomBytes(32).toString('hex')

  const authUrl = new URL(GITHUB_AUTH_URL)
  authUrl.searchParams.set('client_id', clientId)
  authUrl.searchParams.set('redirect_uri', redirectUri)
  authUrl.searchParams.set('scope', 'repo')
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
