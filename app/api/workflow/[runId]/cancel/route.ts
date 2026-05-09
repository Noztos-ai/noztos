// POST /api/workflow/[runId]/cancel
//
// Marca status='cancelled' na DB. Orquestrador detecta no próximo
// checkpoint (entre steps/blocks) e exit limpo. Step em flight termina
// — daemon não tem mecanismo de kill mid-step em V1.
//
// Idempotente: se já é terminal, no-op com indicação.

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/db'

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
    return NextResponse.json({ ok: true, status: run.status, alreadyTerminal: true })
  }

  const updated = await prisma.workflowRun.updateMany({
    where: { id: runId, status: { in: ['pending', 'running'] } },
    data: { status: 'cancelled', completedAt: new Date() },
  })
  console.log(`[api/workflow/cancel] run=${runId.slice(0, 8)} session=${run.sessionId.slice(0, 8)} updated=${updated.count}`)

  return NextResponse.json({ ok: true, status: 'cancelled' })
}
