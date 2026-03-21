import { createHmac, timingSafeEqual } from 'crypto'

// HMAC-SHA256 signed session cookie.
//
// Format: "<userId>|<hmacHex>"
//
// We use HMAC (not AES) because userId is not sensitive — we just need to
// verify it wasn't tampered with. No decrypt step needed.
//
// NODE_SECRET must be set in the environment.

const COOKIE_NAME = 'session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

function getSecret(): string {
  const secret = process.env.NODE_SECRET
  if (!secret) {
    throw new Error(
      'NODE_SECRET environment variable is not set. ' +
        'Set it in .env.local or your hosting environment.'
    )
  }
  return secret
}

function sign(userId: string): string {
  return createHmac('sha256', getSecret()).update(userId).digest('hex')
}

/**
 * Given a cookie value, returns the userId if the HMAC is valid, or null if
 * the value is missing, malformed, or tampered.
 */
export function getSessionUserId(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null

  const sep = cookieValue.lastIndexOf('|')
  if (sep === -1) return null

  const userId = cookieValue.slice(0, sep)
  const hmac = cookieValue.slice(sep + 1)
  const expected = sign(userId)

  try {
    const hmacBuf = Buffer.from(hmac, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (hmacBuf.length !== expectedBuf.length) return null
    return timingSafeEqual(hmacBuf, expectedBuf) ? userId : null
  } catch {
    return null
  }
}

/**
 * Returns the cookie arguments for setting a session cookie.
 * Pass the result directly to response.cookies.set().
 */
export function setSessionCookieArgs(userId: string) {
  return {
    name: COOKIE_NAME,
    value: `${userId}|${sign(userId)}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  }
}

/**
 * Returns the cookie arguments for clearing the session cookie.
 */
export function clearSessionCookieArgs() {
  return {
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 0,
  }
}

export { COOKIE_NAME }
