import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { getChannel } from '@/lib/companion-relay'

// POST — Companion daemon registers itself. Sends auth info (Claude
// version, email, plan) and project list. Server marks the user's
// relay channel as "companion connected" so the browser knows.
export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { authInfo, projects, machineName } = body as {
    authInfo?: { email?: string; plan?: string; version?: string }
    projects?: Array<{ id: string; path: string; name: string }>
    machineName?: string
  }

  const channel = getChannel(auth.userId)
  const wasConnected = channel.isCompanionConnected()
  // Capture a fingerprint of the prior broadcast payload BEFORE
  // setCompanionConnected mutates it. The fingerprint covers EXACTLY
  // the fields that go into the companion_status broadcast — that
  // structural coupling means future additions to the broadcast
  // automatically participate in change detection. No more bugs from
  // "I added X to the payload but forgot to add X to the diff check".
  const priorFingerprint = wasConnected ? statusFingerprint(channel.companion) : null
  channel.setCompanionConnected(authInfo, auth.tokenId, machineName ?? auth.tokenName)
  if (projects) {
    if (channel.companion) channel.companion.projects = projects
  }
  const nextFingerprint = statusFingerprint(channel.companion)

  // Only broadcast companion_status when the snapshot actually
  // changed. A heartbeat with identical state stays silent so we
  // don't spam every SSE listener every 10s. New browser tabs still
  // get their initial status from the SSE handshake in stream/route.ts.
  if (priorFingerprint !== nextFingerprint) {
    const projIds = (channel.companion?.projects ?? []).map((p) => `${p.name}:${p.id.slice(0, 8)}`).join(',')
    console.log(`[register] FINGERPRINT CHANGED userId=${auth.userId.slice(0, 8)} wasConnected=${wasConnected}`)
    console.log(`[register]   prior=${priorFingerprint?.slice(0, 200) ?? 'null'}`)
    console.log(`[register]   next=${nextFingerprint.slice(0, 200)}`)
    console.log(`[register]   broadcasting companion_status with projects=[${projIds}]`)
    channel.pushEvent({
      type: 'companion_status',
      connected: true,
      authInfo,
      projects: channel.companion?.projects,
      machineName: channel.companion?.machineName,
    }, auth.userId)
  }

  return NextResponse.json({
    ok: true,
    message: 'Companion registered',
    pendingCommands: channel.drainCommands().length,
  })
}

// Snapshot of the companion fields that go into the companion_status
// broadcast. KEEP THIS IN SYNC with the pushEvent payload above —
// every field in the broadcast must be in the fingerprint, and vice
// versa. Sorted projectIds because order changes are not meaningful
// (the daemon may iterate config differently).
function statusFingerprint(companion: { authInfo?: { email?: string; plan?: string; version?: string }; projects?: Array<{ id: string }>; machineName?: string } | null | undefined): string {
  if (!companion) return 'null'
  return JSON.stringify({
    email: companion.authInfo?.email ?? null,
    plan: companion.authInfo?.plan ?? null,
    version: companion.authInfo?.version ?? null,
    machineName: companion.machineName ?? null,
    projectIds: (companion.projects ?? []).map((p) => p.id).sort(),
  })
}

// DELETE — Companion disconnects gracefully. Broadcasts disconnected
// status + empty running list so open browser tabs flip to offline
// state without waiting for the heartbeat sweeper.
export async function DELETE(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const channel = getChannel(auth.userId)
  const dropped = channel.drainCommands().length
  channel.setCompanionDisconnected()
  channel.pushEvent({ type: 'companion_status', connected: false }, auth.userId)
  channel.pushEvent({ type: 'running_sessions', payload: { sessionIds: [] } }, auth.userId)
  console.log(`[register] companion graceful disconnect userId=${auth.userId.slice(0, 8)} dropped=${dropped} pending command(s)`)
  return NextResponse.json({ ok: true })
}
