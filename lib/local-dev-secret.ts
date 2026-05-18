// Local-dev auto-auth secret.
//
// When the user runs the app via `npm run dev`, both Next.js and the
// companion daemon spawn from the same repo root and share the same
// filesystem. We avoid the manual "generate token → copy into terminal"
// dance by:
//
//   1. Server generates a random 32-byte secret on first boot, writes
//      it to ./data/.companion-secret with mode 0600 (only the user can
//      read it).
//   2. Daemon reads the file from cwd and uses its contents as a
//      Bearer token when calling server endpoints.
//   3. verifyAuth() in lib/auth.ts trusts this token and resolves it
//      to the first user in the DB — the single user that exists in
//      a self-hosted setup.
//
// Security notes:
//   - Mode 0600 means only the OS user who owns the file can read it.
//     If your machine has multiple OS users with separate accounts,
//     they can't impersonate the daemon.
//   - The secret never travels over the network unless YOU expose
//     localhost via cloudflared/Tailscale. Even then, it's only used
//     on the daemon ↔ server channel; the browser UI still requires
//     a regular signup + session cookie.
//   - If you ever suspect compromise, delete the file and restart
//     the server; a new secret is generated.

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import { prisma } from './db'

const DATA_DIR = join(process.cwd(), 'data')
const SECRET_PATH = join(DATA_DIR, '.companion-secret')

let cachedSecret: string | null = null

/**
 * Returns the local-dev secret, creating it on disk the first time
 * this is called. Cached in module scope so the disk read happens
 * once per process.
 */
export function getLocalDevSecret(): string {
  if (cachedSecret) return cachedSecret
  if (existsSync(SECRET_PATH)) {
    cachedSecret = readFileSync(SECRET_PATH, 'utf-8').trim()
    return cachedSecret
  }
  mkdirSync(DATA_DIR, { recursive: true })
  const secret = randomBytes(32).toString('hex')
  writeFileSync(SECRET_PATH, secret + '\n', { mode: 0o600 })
  // chmod again in case umask interfered with mode at create time.
  try { chmodSync(SECRET_PATH, 0o600) } catch { /* best-effort */ }
  cachedSecret = secret
  console.log('[local-dev] generated companion-secret at ./data/.companion-secret')
  return secret
}

/**
 * True if the bearer token presented by a client matches the local-dev
 * secret. Used by verifyAuth() to skip the regular CompanionToken DB
 * lookup for daemon connections that auth'd via the auto-secret.
 */
export function isLocalDevSecret(token: string | undefined): boolean {
  if (!token) return false
  return token === getLocalDevSecret()
}

/**
 * Resolve the local-dev secret to a userId. Returns the single user
 * in the DB (self-hosted assumption) or null if no users have signed
 * up yet — the daemon will retry on its reconnect loop.
 */
export async function resolveLocalDevUserId(): Promise<string | null> {
  const user = await prisma.user.findFirst({
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  })
  return user?.id ?? null
}
