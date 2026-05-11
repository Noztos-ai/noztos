// POST /api/workflow/[runId]/cancel
//
// Two-prong cancel:
//   1. Flip status='cancelled' in DB so any in-flight checkpoint inside
//      the runner exits cleanly (no orphan progress writes).
//   2. SIGTERM the spawned `claude -p` child via process-registry so the
//      mid-step work stops immediately. Without this, the agent keeps
//      editing files until its current step closes its stream.
//
// Idempotente: se já é terminal, no-op com indicação.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/db'
import { killRun } from '@/lib/workflows/shared/process-registry'

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const cookieStore = await cookies()
  const userId = getSessionUserId(cookieStore.get('session')?.value)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await context.params
  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, userId },
    select: { id: true, status: true, sessionId: true },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    // Even if DB is already terminal, an orphan child may still be alive
    // (e.g. race between the runner closing and a previous cancel call).
    // Best-effort kill; no-op if registry has nothing.
    const killed = killRun(runId)
    return NextResponse.json({ ok: true, status: run.status, alreadyTerminal: true, killed })
  }

  const updated = await prisma.workflowRun.updateMany({
    where: { id: runId, status: { in: ['pending', 'running'] } },
    data: { status: 'cancelled', completedAt: new Date() },
  })
  const killed = killRun(runId)
  console.log(`[api/workflow/cancel] run=${runId.slice(0, 8)} session=${run.sessionId.slice(0, 8)} updated=${updated.count} killed_child=${killed}`)

  return NextResponse.json({ ok: true, status: 'cancelled', killed })
}
