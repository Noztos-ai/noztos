import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { getChannel } from '@/lib/companion-relay'
import { prisma } from '@/lib/db'

// GET — SSE stream that the companion daemon listens to. When the
// browser sends a command (via POST /api/companion/command), the
// relay pushes it through this stream so the companion picks it up.
//
// The companion keeps this connection open permanently. If it drops,
// the daemon reconnects automatically (built into daemon.ts).
//
// Cloud Mirror routing:
//   - This same endpoint serves the in-sandbox bridge (companion/sandbox/bridge.mjs)
//     when called with `?cloud=1&worktreeId=X`. The bridge auths via a
//     SandboxSession token (verifyAuth recognises tokenName='sandbox').
//   - Per-subscriber filtering ensures each command lands on exactly
//     one executor:
//       sandbox subscriber → only commands whose worktreeId === X
//       companion          → only commands whose target worktree is in
//                            local mode (or no worktreeId at all)
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) {
    return new Response('Unauthorized', { status: 401 })
  }

  const isCloud = request.nextUrl.searchParams.get('cloud') === '1'
  const sandboxWorktreeId = request.nextUrl.searchParams.get('worktreeId')
  // Lightweight per-stream cache of worktree activeContext lookups.
  // Each command rarely belongs to a new worktree, and Prisma is fast,
  // but caching makes the filter trivial under load.
  const contextCache = new Map<string, string>()
  async function getActiveContext(worktreeId: string): Promise<string> {
    const cached = contextCache.get(worktreeId)
    if (cached) return cached
    const wt = await prisma.worktree.findUnique({
      where: { id: worktreeId },
      select: { activeContext: true },
    })
    const ctx = wt?.activeContext ?? 'local'
    contextCache.set(worktreeId, ctx)
    return ctx
  }
  async function shouldRouteToThisSubscriber(cmd: unknown): Promise<boolean> {
    const wtId = (cmd as { worktreeId?: unknown })?.worktreeId
    if (isCloud) {
      // Sandbox bridge — only commands targeted at its specific worktree.
      // (Defensive: also requires the worktree to be cloud-active; if it
      // flipped back to local between command submission and now, the
      // companion will take it.)
      if (typeof wtId !== 'string' || wtId !== sandboxWorktreeId) return false
      return (await getActiveContext(wtId)) === 'cloud'
    }
    // Companion — skip commands whose worktree is cloud-active. Commands
    // without a worktreeId (main-branch ops) always go to companion.
    if (typeof wtId !== 'string') return true
    return (await getActiveContext(wtId)) !== 'cloud'
  }

  const channel = getChannel(auth.userId)

  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder()

      function send(data: unknown) {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Stream closed
        }
      }
      async function maybeSend(data: unknown) {
        try {
          if (await shouldRouteToThisSubscriber(data)) send(data)
        } catch (err) {
          console.warn('[companion/events] filter error:', err)
          send(data) // fail-open: better to deliver than to lose a command
        }
      }

      // Drain any queued commands first
      for (const cmd of channel.drainCommands()) {
        void maybeSend(cmd)
      }

      // Listen for new commands
      function onCommand(cmd: unknown) {
        void maybeSend(cmd)
      }
      channel.commandEmitter.on('command', onCommand)

      // Heartbeat every 20s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
          channel.heartbeat()
        } catch {
          clearInterval(heartbeat)
        }
      }, 20_000)

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        channel.commandEmitter.off('command', onCommand)
        clearInterval(heartbeat)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
