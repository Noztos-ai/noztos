// Cloud Mirror — envelope encryption for blob storage.
//
// Pattern: per-user Data Encryption Key (DEK), wrapped by a master key.
// All GitObject.content and UnpushedCommit.patchContent bytes are
// encrypted with the user's DEK before write. The DEK itself is
// AES-GCM-encrypted by the master key and stored in
// UserEncryptionKey.wrappedKey.
//
// MVP master key source: NODE_SECRET (same env var as lib/crypto.ts,
// but stretched with a distinct salt so leaking one key class doesn't
// compromise the other). Phase 6 swaps the master source for AWS KMS
// or Supabase Vault — the public API of this module stays the same,
// only wrapDEK/unwrapDEK internals change.
//
// Wire format for both wrapped DEK and encrypted bytes:
//   iv(12) | authTag(16) | ciphertext(N)
//
// Right-to-erasure: revokeUserKey() stamps UserEncryptionKey.revokedAt.
// Any subsequent encrypt/decrypt for that user throws. Background GC
// then hard-deletes dependent GitObject / UnpushedCommit rows after a
// grace window — the actual ciphertext is already unreadable.

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'
import { gzipSync, gunzipSync } from 'zlib'
import { prisma } from '@/lib/db'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16
const DEK_LENGTH = 32

// MASTER_KEY_ID is stamped into UserEncryptionKey.kmsKeyId so when we
// migrate to a real KMS, we can find rows that still use NODE_SECRET
// and re-wrap them under the new master. Bumping the version (v2, v3)
// triggers re-wrap on the next read.
const MASTER_KEY_ID = 'NODE_SECRET-mirror-master-v1'
const MASTER_KEY_SALT = 'bornastar-mirror-master-v1'

const dekCache = new Map<string, Buffer>()

function getMasterKey(): Buffer {
  const secret = process.env.NODE_SECRET
  if (!secret) {
    throw new Error(
      'NODE_SECRET environment variable is not set. ' +
        'Set it in .env.local or your hosting environment.'
    )
  }
  return scryptSync(secret, MASTER_KEY_SALT, 32)
}

function wrapDEK(dek: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, getMasterKey(), iv)
  const ciphertext = Buffer.concat([cipher.update(dek), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext])
}

function unwrapDEK(wrapped: Buffer): Buffer {
  const iv = wrapped.subarray(0, IV_LENGTH)
  const authTag = wrapped.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = wrapped.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, getMasterKey(), iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// Lazy creation: first call for a user generates a fresh DEK, wraps it,
// persists, and caches. Subsequent calls hit cache.
export async function getUserDEK(userId: string): Promise<Buffer> {
  const cached = dekCache.get(userId)
  if (cached) return cached

  let row = await prisma.userEncryptionKey.findUnique({ where: { userId } })
  if (!row) {
    const dek = randomBytes(DEK_LENGTH)
    const wrapped = wrapDEK(dek)
    row = await prisma.userEncryptionKey.create({
      data: { userId, wrappedKey: Uint8Array.from(wrapped), kmsKeyId: MASTER_KEY_ID },
    })
    dekCache.set(userId, dek)
    return dek
  }

  if (row.revokedAt) {
    throw new Error(`Encryption key for user ${userId} has been revoked`)
  }

  const dek = unwrapDEK(Buffer.from(row.wrappedKey))
  dekCache.set(userId, dek)
  return dek
}

// Encrypt raw bytes (already gzipped by caller, or raw if caller chooses).
export async function encryptBytes(
  plaintext: Buffer,
  userId: string
): Promise<Buffer> {
  const dek = await getUserDEK(userId)
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, dek, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext])
}

export async function decryptBytes(
  stored: Buffer,
  userId: string
): Promise<Buffer> {
  const dek = await getUserDEK(userId)
  const iv = stored.subarray(0, IV_LENGTH)
  const authTag = stored.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = stored.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, dek, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()])
}

// Convenience: gzip + encrypt. Source code compresses 5-10x; this is the
// default for GitObject.content and UnpushedCommit.patchContent.
export async function compressAndEncrypt(
  plaintext: Buffer,
  userId: string
): Promise<Buffer> {
  const compressed = gzipSync(plaintext)
  return encryptBytes(compressed, userId)
}

export async function decryptAndDecompress(
  stored: Buffer,
  userId: string
): Promise<Buffer> {
  const compressed = await decryptBytes(stored, userId)
  return gunzipSync(compressed)
}

// Stamps revokedAt. After this point, any encrypt/decrypt for the user
// throws. Caller is expected to follow up with hard-delete of dependent
// rows after the grace window.
export async function revokeUserKey(userId: string): Promise<void> {
  await prisma.userEncryptionKey.update({
    where: { userId },
    data: { revokedAt: new Date() },
  })
  dekCache.delete(userId)
}

// Drop the in-process DEK cache. Useful for tests or after a forced
// re-wrap during master-key migration.
export function clearDEKCache(userId?: string): void {
  if (userId) dekCache.delete(userId)
  else dekCache.clear()
}
