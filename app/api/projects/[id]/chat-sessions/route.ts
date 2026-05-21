import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'
import { withRetry } from '@/lib/retry'

interface RouteContext {
  params: Promise<{ id: string }>
}

// GET — list all open chat sessions for this project, including those that
// belong to a worktree (worktreeId is returned so the frontend can group them).
export async function GET(_request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  const sessions = await prisma.chatSession.findMany({
    // Defense in depth: require both status='open' and deletedAt null so
    // a row with an inconsistent status flip (e.g. future data migration)
    // still stays out of the user's view.
    where: { projectId: id, status: 'open', deletedAt: null },
    select: { id: true, name: true, worktreeId: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json({ sessions })
}

// POST — create a new chat session.
//
// Body:
//   {
//     id?: string         ← optional client-minted cuid for idempotent retry.
//                            When the client retries after a transient
//                            network error the server returns the existing
//                            session instead of creating a duplicate.
//     worktreeId?: string ← when present, chat lives inside that worktree's
//                            branch + working dir; otherwise it operates on
//                            main directly.
//     name?: string       ← display-name override.
//   }
//
// All Prisma writes go through withRetry so transient connection errors
// (DatabaseNotReachable / SocketTimeout / ConnectionClosed) get backoff
// retries before surfacing as 500.
export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const access = await verifyProjectAccess(id)
  if ('error' in access) return NextResponse.json({ error: access.error }, { status: access.status })

  let body: { id?: string; worktreeId?: string; name?: string } = {}
  try { body = await request.json() } catch { /* empty body is fine */ }

  const tStart = Date.now()
  console.log(`[chat-route] POST start projectId=${id.slice(0, 12)} preMintedId=${body.id?.slice(0, 12) ?? '(none)'} wt=${body.worktreeId?.slice(0, 12) ?? '(none)'}`)

  // Idempotent fast-path: re-POST with the same id returns the existing
  // session. Caller is the client retrying after a transient error;
  // creating a duplicate would orphan the original chat in the sidebar.
  if (body.id) {
    const existing = await withRetry(
      () => prisma.chatSession.findUnique({
        where: { id: body.id },
        select: { id: true, name: true, worktreeId: true, projectId: true, createdAt: true },
      }),
      { tag: 'session-idempotent-lookup' },
    )
    if (existing && existing.projectId === id) {
      const { projectId: _omit, ...session } = existing
      void _omit
      console.log(`[chat-route] IDEMPOTENT HIT id=${body.id.slice(0, 12)} ms=${Date.now() - tStart}`)
      return NextResponse.json(session, { status: 200 })
    }
  }

  // Every chat lives in a workspace (worktree). A session with no
  // worktreeId would be a "main chat" — and an agent run from it would
  // execute on the project root / main branch. Refuse to create one.
  if (!body.worktreeId) {
    return NextResponse.json(
      { message: 'A chat must belong to a workspace (worktreeId required).' },
      { status: 422 },
    )
  }

  // Validate worktreeId if provided
  if (body.worktreeId) {
    const wt = await withRetry(
      () => prisma.worktree.findUnique({
        where: { id: body.worktreeId },
        select: { projectId: true, status: true },
      }),
      { tag: 'session-worktree-validate' },
    )
    if (!wt || wt.projectId !== id || wt.status !== 'open') {
      return NextResponse.json({ error: 'Invalid worktree' }, { status: 400 })
    }
  }

  // Upsert by id when client minted one so retries resume cleanly; plain
  // create otherwise (legacy callers that don't pre-mint).
  const session = await withRetry(
    () => body.id
      ? prisma.chatSession.upsert({
          where: { id: body.id },
          create: {
            id: body.id,
            projectId: id,
            userId: access.userId,
            name: body.name?.trim() || 'New Chat',
            worktreeId: body.worktreeId ?? null,
          },
          update: {},
          select: { id: true, name: true, worktreeId: true, createdAt: true },
        })
      : prisma.chatSession.create({
          data: {
            projectId: id,
            userId: access.userId,
            name: body.name?.trim() || 'New Chat',
            worktreeId: body.worktreeId ?? null,
          },
          select: { id: true, name: true, worktreeId: true, createdAt: true },
        }),
    { tag: 'session-create' },
  )

  console.log(`[chat-route] DONE id=${session.id.slice(0, 12)} wt=${session.worktreeId?.slice(0, 12) ?? '(main)'} ms=${Date.now() - tStart}`)
  return NextResponse.json(session, { status: 201 })
}
