// Cloud Mirror — bearer auth for E2B sandbox sessions.
//
// Pattern mirrors lib/auth.ts verifyAuth(): the sandbox calls our cloud
// APIs with `Authorization: Bearer <token>`, where token is the
// SandboxSession.token issued by /api/cloud/switch. This auth path is
// separate from CompanionToken because sandbox sessions:
//   - belong to one specific worktree (not just a user)
//   - have their own lifecycle (provisioning/ready/destroyed)
//   - need to be revocable independently when the sandbox is torn down
//
// Successful auth returns { userId, worktreeId, sessionId }. Endpoints
// downstream can therefore enforce per-worktree scoping without an
// extra DB lookup.

import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/db'

export interface SandboxAuth {
  userId: string
  worktreeId: string
  sessionId: string
}

export async function verifySandboxAuth(
  request: NextRequest,
): Promise<SandboxAuth | null> {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) return null
  const token = header.slice('Bearer '.length).trim()
  if (!token) return null

  const session = await prisma.sandboxSession.findUnique({
    where: { token },
    select: {
      id: true,
      userId: true,
      worktreeId: true,
      status: true,
      destroyedAt: true,
    },
  })
  if (!session) return null
  if (session.destroyedAt) return null
  if (session.status === 'destroyed' || session.status === 'failed') return null

  // Refresh lastActiveAt asynchronously so a misbehaving sandbox can't
  // be considered "alive" forever based on its provision time alone.
  prisma.sandboxSession
    .update({ where: { id: session.id }, data: { lastActiveAt: new Date() } })
    .catch(() => {})

  return {
    userId: session.userId,
    worktreeId: session.worktreeId,
    sessionId: session.id,
  }
}
