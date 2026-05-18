// Admin session — separate from user sessions.
//
// Why a parallel system instead of "user + role" on the same cookie:
//   - The admin login is a *hidden* operator panel. It must never live
//     on the same flow as the user-facing signup/login so a regular user
//     can't accidentally promote themselves by editing local state, and
//     so the user-side codepath has zero awareness of admin privileges.
//   - Admin credentials are env-var driven (ADMIN_USERNAME + ADMIN_PASSWORD)
//     so there's no DB row to compromise — even a full DB dump can't give
//     someone admin access without also exfiltrating the Railway env.
//
// Cookie shape: "<username>|<hmac>" with HMAC-SHA256 over the username
// using NODE_SECRET as the key. Same primitive as lib/session.ts but a
// distinct cookie name + different signed payload so the two don't
// cross-contaminate.

import { createHmac, timingSafeEqual } from 'crypto'

const COOKIE_NAME = 'admin-session'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7 // 7 days — admin sessions stay
                                        // shorter than user sessions
                                        // because an admin token has
                                        // wider blast radius.

function getSecret(): string {
  const secret = process.env.NODE_SECRET
  if (!secret) throw new Error('NODE_SECRET not set')
  return secret
}

function sign(username: string): string {
  return createHmac('sha256', getSecret()).update(`admin:${username}`).digest('hex')
}

export function getAdminUsername(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null
  const sep = cookieValue.lastIndexOf('|')
  if (sep === -1) return null
  const username = cookieValue.slice(0, sep)
  const hmac = cookieValue.slice(sep + 1)
  const expected = sign(username)
  try {
    const a = Buffer.from(hmac, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return null
    return timingSafeEqual(a, b) ? username : null
  } catch {
    return null
  }
}

export function setAdminCookieArgs(username: string) {
  return {
    name: COOKIE_NAME,
    value: `${username}|${sign(username)}`,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: COOKIE_MAX_AGE,
  }
}

export function clearAdminCookieArgs() {
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

// Validate a username + password pair against the env-configured admin
// credentials. timing-safe compare so an attacker can't side-channel
// the password byte-by-byte.
export function verifyAdminCredentials(username: string, password: string): boolean {
  const u = process.env.ADMIN_USERNAME
  const p = process.env.ADMIN_PASSWORD
  if (!u || !p) return false
  if (username.length !== u.length) return false
  if (password.length !== p.length) return false
  try {
    const uMatch = timingSafeEqual(Buffer.from(username), Buffer.from(u))
    const pMatch = timingSafeEqual(Buffer.from(password), Buffer.from(p))
    return uMatch && pMatch
  } catch {
    return false
  }
}

export { COOKIE_NAME as ADMIN_COOKIE_NAME }
