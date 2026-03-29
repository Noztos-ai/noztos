import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'
import { E2BProvider } from '@/lib/compute-e2b'
import { decrypt } from '@/lib/crypto'

interface RouteContext {
  params: Promise<{ id: string }>
}

const provider = new E2BProvider()

// GET — get terminal/sandbox status
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const repo = await prisma.repository.findUnique({
    where: { projectId: id },
    select: { sandboxId: true, sandboxStatus: true, sandboxStartedAt: true, githubOwner: true, githubRepo: true },
  })

  if (!repo) return NextResponse.json({ sandboxId: null, status: null })

  // Check if sandbox is still running
  if (repo.sandboxId && repo.sandboxStatus === 'running') {
    const running = await provider.isRunning(repo.sandboxId)
    if (!running) {
      await prisma.repository.update({
        where: { projectId: id },
        data: { sandboxStatus: 'stopped', sandboxId: null },
      })
      return NextResponse.json({ sandboxId: null, status: 'stopped' })
    }
  }

  return NextResponse.json({
    sandboxId: repo.sandboxId,
    status: repo.sandboxStatus,
    startedAt: repo.sandboxStartedAt,
    repo: `${repo.githubOwner}/${repo.githubRepo}`,
  })
}

// POST — start a sandbox (create or reconnect)
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const repo = await prisma.repository.findUnique({
    where: { projectId: id },
    select: { id: true, sandboxId: true, sandboxStatus: true, githubOwner: true, githubRepo: true },
  })

  if (!repo) return NextResponse.json({ error: 'No repository connected' }, { status: 404 })

  // Already running?
  if (repo.sandboxId && repo.sandboxStatus === 'running') {
    const running = await provider.isRunning(repo.sandboxId)
    if (running) return NextResponse.json({ sandboxId: repo.sandboxId, status: 'running', message: 'Already running' })
  }

  // Get GitHub token for cloning
  const user = await prisma.user.findUnique({
    where: { id: access.userId },
    select: { githubToken: true },
  })

  // Build clone URL (public or with decrypted token)
  let ghToken: string | null = null
  if (user?.githubToken) {
    try { ghToken = decrypt(user.githubToken) } catch { /* token invalid */ }
  }
  const repoUrl = ghToken
    ? `https://${ghToken}@github.com/${repo.githubOwner}/${repo.githubRepo}.git`
    : `https://github.com/${repo.githubOwner}/${repo.githubRepo}.git`

  try {
    console.log('[terminal] Creating sandbox for', repo.githubOwner + '/' + repo.githubRepo)
    console.log('[terminal] E2B_API_KEY present:', !!process.env.E2B_API_KEY)
    const sandbox = await provider.createSandbox(repoUrl)
    console.log('[terminal] Sandbox created:', sandbox.id)

    await prisma.repository.update({
      where: { projectId: id },
      data: {
        sandboxId: sandbox.id,
        sandboxStatus: 'running',
        sandboxStartedAt: new Date(),
      },
    })

    return NextResponse.json({ sandboxId: sandbox.id, status: 'running' })
  } catch (err) {
    return NextResponse.json({ error: `Failed to create sandbox: ${err instanceof Error ? err.message : 'Unknown error'}` }, { status: 500 })
  }
}

// DELETE — stop sandbox
export async function DELETE(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const repo = await prisma.repository.findUnique({
    where: { projectId: id },
    select: { sandboxId: true },
  })

  if (repo?.sandboxId) {
    try {
      await provider.stopSandbox(repo.sandboxId)
    } catch {}
    await prisma.repository.update({
      where: { projectId: id },
      data: { sandboxId: null, sandboxStatus: 'stopped' },
    })
  }

  return NextResponse.json({ status: 'stopped' })
}
