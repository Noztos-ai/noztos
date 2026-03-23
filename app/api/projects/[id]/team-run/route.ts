import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET — get the active or latest team run for this project
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  // Find running or most recent team run
  const teamRun = await prisma.teamRun.findFirst({
    where: { projectId: id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      plan: true,
      state: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!teamRun) {
    return NextResponse.json({ active: false })
  }

  // Check for timeout (5 minutes)
  if (teamRun.status === 'running') {
    const elapsed = Date.now() - new Date(teamRun.updatedAt).getTime()
    if (elapsed > 5 * 60 * 1000) {
      await prisma.teamRun.update({
        where: { id: teamRun.id },
        data: { status: 'timed_out' },
      })
      return NextResponse.json({
        active: false,
        lastRun: { ...teamRun, status: 'timed_out' },
      })
    }
  }

  return NextResponse.json({
    active: teamRun.status === 'running',
    lastRun: teamRun,
  })
}
