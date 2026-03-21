import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET /api/projects/[id]/usage — get resource usage summary
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }

  const usage = await prisma.resourceUsage.aggregate({
    where: { projectId: id },
    _sum: {
      cpuSeconds: true,
      gpuSeconds: true,
    },
    _count: true,
  })

  const recentUsage = await prisma.resourceUsage.findMany({
    where: { projectId: id },
    select: {
      id: true,
      taskId: true,
      cpuSeconds: true,
      gpuSeconds: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  })

  return NextResponse.json({
    total: {
      cpuSeconds: usage._sum.cpuSeconds ?? 0,
      gpuSeconds: usage._sum.gpuSeconds ?? 0,
      count: usage._count,
    },
    recent: recentUsage,
  })
}
