// POST /api/companion/mirror/check-hashes
//
// Daemon sends a batch of hashes it would like to upload. Server replies
// with the subset that the user doesn't yet have in GitObject. The daemon
// then uploads only those — primary dedup mechanism.
//
// Body:   { hashes: string[] }       (cap ~500 per call)
// Reply:  { missing: string[] }      (subset to upload)

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'

const MAX_HASHES_PER_CALL = 500

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { hashes?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }

  if (!Array.isArray(body.hashes)) {
    return NextResponse.json({ error: 'hashes must be an array' }, { status: 400 })
  }
  if (body.hashes.length > MAX_HASHES_PER_CALL) {
    return NextResponse.json(
      { error: `max ${MAX_HASHES_PER_CALL} hashes per call` },
      { status: 400 }
    )
  }

  const hashes = body.hashes.filter((h): h is string => typeof h === 'string')
  if (hashes.length === 0) {
    return NextResponse.json({ missing: [] })
  }

  const existing = await prisma.gitObject.findMany({
    where: { userId: auth.userId, hash: { in: hashes } },
    select: { hash: true },
  })
  const existingSet = new Set(existing.map((r) => r.hash))
  const missing = hashes.filter((h) => !existingSet.has(h))

  return NextResponse.json({ missing })
}
