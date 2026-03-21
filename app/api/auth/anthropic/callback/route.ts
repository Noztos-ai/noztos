import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { setSessionCookieArgs } from '@/lib/session'

// OAuth 2.0 authorization code flow — Step 2: exchange code for token.
//
// Flow:
//   GET /api/auth/anthropic/callback?code=...&state=...
//     → validate state against cookie (CSRF)
//     → POST to Anthropic token endpoint
//     → fetch user info (email)
//     → upsert user with encrypted token
//     → set session cookie
//     → redirect to /

const STATE_COOKIE = 'auth_state'
const TOKEN_URL = 'https://api.anthropic.com/v1/oauth/token'
const USERINFO_URL = 'https://api.anthropic.com/v1/oauth/userinfo'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }

  if (!code) {
    return NextResponse.redirect(new URL('/?error=missing_code', request.url))
  }

  // CSRF: validate state param against the httpOnly cookie set in /start
  const storedState = request.cookies.get(STATE_COOKIE)?.value
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/?error=state_mismatch', request.url))
  }

  try {
    const clientId = process.env.ANTHROPIC_CLIENT_ID!
    const clientSecret = process.env.ANTHROPIC_CLIENT_SECRET!
    const redirectUri = process.env.ANTHROPIC_REDIRECT_URI!

    // Exchange authorization code for access token
    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    })
    const tokenData = await tokenRes.json()
    const accessToken: string | undefined = tokenData.access_token

    if (!accessToken) {
      return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
    }

    // Fetch user profile to get email
    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const userData = await userRes.json()
    const email: string | undefined = userData.email

    if (!email) {
      return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
    }

    // Upsert user — new auth always replaces previous token
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, anthropicToken: encrypt(accessToken) },
      update: { anthropicToken: encrypt(accessToken) },
      select: { id: true },
    })

    // Set session cookie and clear state cookie
    const response = NextResponse.redirect(new URL('/', request.url))
    const sessionArgs = setSessionCookieArgs(user.id)
    response.cookies.set(sessionArgs)
    response.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/' })

    return response
  } catch {
    return NextResponse.redirect(new URL('/?error=auth_failed', request.url))
  }
}
