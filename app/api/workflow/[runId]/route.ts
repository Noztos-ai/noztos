// GET /api/workflow/[runId]
//
// Retorna o snapshot completo de uma run pro UI poller. UI bate aqui
// a cada ~1s e atualiza o card vivo.
//
// Resposta:
//   {
//     id, status, workflowType, userMessage,
//     plan, progress, finalResponse, errorReason,
//     createdAt, completedAt
//   }

import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getSessionUserId } from '@/lib/session'
import { prisma } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ runId: string }> },
) {
  const cookieStore = await cookies()
  const userId = getSessionUserId(cookieStore.get('session')?.value)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { runId } = await context.params
  const run = await prisma.workflowRun.findFirst({
    where: { id: runId, userId },
    select: {
      id: true,
      sessionId: true,
      status: true,
      workflowType: true,
      userMessage: true,
      plan: true,
      progress: true,
      finalResponse: true,
      errorReason: true,
      createdAt: true,
      completedAt: true,
    },
  })
  if (!run) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json(run)
}
