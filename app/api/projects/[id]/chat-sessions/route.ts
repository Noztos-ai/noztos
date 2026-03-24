import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET — list all open chat sessions for this project
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const sessions = await prisma.chatSession.findMany({
    where: { projectId: id, status: 'open' },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ sessions })
}

// POST — create a new chat session
export async function POST(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const session = await prisma.chatSession.create({
    data: {
      projectId: id,
      userId: access.userId,
      name: 'New Chat',
    },
    select: { id: true, name: true, createdAt: true },
  })

  return NextResponse.json(session, { status: 201 })
}
