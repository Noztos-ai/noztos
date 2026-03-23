import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { encrypt } from '@/lib/crypto'
import { getSessionUserId } from '@/lib/session'

const STATE_COOKIE = 'auth_github_state'
const TOKEN_URL = 'https://github.com/login/oauth/access_token'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  if (error || !code) {
    return NextResponse.redirect(new URL('/?github_error=auth_failed', request.url))
  }

  // CSRF check
  const storedState = request.cookies.get(STATE_COOKIE)?.value
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL('/?github_error=state_mismatch', request.url))
  }

  // Must be logged in
  const sessionValue = request.cookies.get('session')?.value
  const userId = getSessionUserId(sessionValue)
  if (!userId) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  try {
    const clientId = process.env.GITHUB_CLIENT_ID!
    const clientSecret = process.env.GITHUB_CLIENT_SECRET!

    const tokenRes = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    const accessToken: string | undefined = tokenData.access_token

    if (!accessToken) {
      return NextResponse.redirect(new URL('/?github_error=auth_failed', request.url))
    }

    await prisma.user.update({
      where: { id: userId },
      data: { githubToken: encrypt(accessToken) },
    })

    const response = NextResponse.redirect(new URL('/', request.url))
    response.cookies.set(STATE_COOKIE, '', { maxAge: 0, path: '/' })
    return response
  } catch {
    return NextResponse.redirect(new URL('/?github_error=auth_failed', request.url))
  }
}
