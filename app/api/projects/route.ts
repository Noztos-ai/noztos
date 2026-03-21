import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { getSessionUserId } from '@/lib/session'

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const sessionValue = cookieStore.get('session')?.value
  const userId = getSessionUserId(sessionValue)

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { name?: string; slackChannel?: string; slackWebhook?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const name = body.name?.trim()
  if (!name) {
    return NextResponse.json({ error: 'Project name is required' }, { status: 400 })
  }

  if (name.length > 100) {
    return NextResponse.json({ error: 'Project name must be 100 characters or less' }, { status: 400 })
  }

  const project = await prisma.project.create({
    data: {
      userId,
      name,
      slackChannel: body.slackChannel?.trim() || null,
      slackWebhook: body.slackWebhook?.trim() || null,
    },
    select: { id: true },
  })

  return NextResponse.json({ id: project.id }, { status: 201 })
}
