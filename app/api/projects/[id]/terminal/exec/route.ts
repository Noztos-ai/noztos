import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'
import { E2BProvider } from '@/lib/compute-e2b'

interface RouteContext {
  params: Promise<{ id: string }>
}

const provider = new E2BProvider()

// POST — execute a command in the sandbox
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const body = await request.json() as { command: string }
  if (!body.command?.trim()) {
    return NextResponse.json({ error: 'Command is required' }, { status: 400 })
  }

  const repo = await prisma.repository.findUnique({
    where: { projectId: id },
    select: { sandboxId: true, sandboxStatus: true },
  })

  if (!repo?.sandboxId || repo.sandboxStatus !== 'running') {
    return NextResponse.json({ error: 'No active sandbox. Start the terminal first.' }, { status: 400 })
  }

  try {
    const result = await provider.exec(repo.sandboxId, body.command)

    // Track resource usage
    await prisma.resourceUsage.create({
      data: {
        userId: access.userId,
        projectId: id,
        cpuSeconds: 1, // Rough estimate per command
      },
    })

    return NextResponse.json({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    })
  } catch (err) {
    return NextResponse.json({
      error: `Execution failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
    }, { status: 500 })
  }
}
