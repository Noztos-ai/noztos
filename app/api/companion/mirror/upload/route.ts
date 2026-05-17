// POST /api/companion/mirror/upload
//
// Daemon uploads a single blob's raw content. Server:
//   1. Verifies SHA-256 of the bytes matches the claimed hash
//      (integrity guard against transit corruption or bug).
//   2. gzips + encrypts with the user's DEK.
//   3. Inserts GitObject with refCount=0 (commit-entries will bump it
//      when paths point to this hash). If row already exists for this
//      (userId, hash), the upload is a no-op — content can't change
//      since it's content-addressed.
//
// Body:   { hash: string, contentBase64: string }
// Reply:  { ok: true, sizeBytes: number, deduped: boolean }
//
// Size cap: MAX_BLOB_BYTES — anything larger is rejected. Daemon should
// skip oversized files (typically binary assets) before calling this.

import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { verifyAuth } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { compressAndEncrypt } from '@/lib/mirror/crypto'

const MAX_BLOB_BYTES = 10 * 1024 * 1024 // 10 MB per file

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { hash?: unknown; contentBase64?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Bad JSON' }, { status: 400 })
  }

  if (typeof body.hash !== 'string' || typeof body.contentBase64 !== 'string') {
    return NextResponse.json(
      { error: 'hash and contentBase64 are required strings' },
      { status: 400 }
    )
  }

  const plaintext = Buffer.from(body.contentBase64, 'base64')
  if (plaintext.length > MAX_BLOB_BYTES) {
    return NextResponse.json(
      { error: `blob exceeds max size ${MAX_BLOB_BYTES}` },
      { status: 413 }
    )
  }

  // Integrity check: SHA-256 of plaintext must match the claimed hash.
  // Hex lowercase to match what the daemon should be computing.
  const computed = createHash('sha256').update(plaintext).digest('hex')
  if (computed !== body.hash) {
    return NextResponse.json(
      { error: `hash mismatch: claimed=${body.hash} computed=${computed}` },
      { status: 400 }
    )
  }

  // Dedup short-circuit — if row exists we're done.
  const existing = await prisma.gitObject.findUnique({
    where: { userId_hash: { userId: auth.userId, hash: body.hash } },
  })
  if (existing) {
    return NextResponse.json({ ok: true, sizeBytes: existing.sizeBytes, deduped: true })
  }

  const encrypted = await compressAndEncrypt(plaintext, auth.userId)
  await prisma.gitObject.create({
    data: {
      userId: auth.userId,
      hash: body.hash,
      content: Uint8Array.from(encrypted),
      sizeBytes: plaintext.length,
      refCount: 0,
    },
  })

  return NextResponse.json({ ok: true, sizeBytes: plaintext.length, deduped: false })
}
