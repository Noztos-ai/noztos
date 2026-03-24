import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'
import { getContextUsage, compactConversation } from '@/lib/chat-engine'

interface RouteContext {
  params: Promise<{ id: string; sessionId: string }>
}

// GET — get context usage for a session
export async function GET(request: NextRequest, context: RouteContext) {
  const { id, sessionId } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const model = request.nextUrl.searchParams.get('model') ?? 'sonnet'
  const usage = await getContextUsage(sessionId, model)

  return NextResponse.json({
    used: usage.used,
    limit: usage.limit,
    percentage: Math.round(usage.percentage * 100),
    shouldCompact: usage.shouldCompact,
  })
}

// POST — manually compact the conversation
export async function POST(request: NextRequest, context: RouteContext) {
  const { id, sessionId } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const user = await prisma.user.findUnique({
    where: { id: access.userId },
    select: { anthropicToken: true },
  })

  if (!user?.anthropicToken) {
    return NextResponse.json({ error: 'No API key' }, { status: 400 })
  }

  const body = await request.json().catch(() => ({})) as { model?: string }

  const summary = await compactConversation(sessionId, id, access.userId, user.anthropicToken, body.model)

  return NextResponse.json({ success: true, summaryLength: summary.length })
}
