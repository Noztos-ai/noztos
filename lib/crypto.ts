import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

// AES-256-GCM encryption for sensitive tokens (Anthropic OAuth, Slack OAuth).
//
// Flow:
//   encrypt(plaintext) → "<iv_hex>:<authTag_hex>:<ciphertext_hex>"
//   decrypt(stored)    → plaintext
//
// The stored format is a colon-delimited string so it fits in a plain TEXT column
// without schema changes. The auth tag provides tamper detection.
//
// NODE_SECRET must be set in the environment. It is stretched via scrypt to
// produce a 32-byte key — you can pass any string (not just 32 chars).

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const secret = process.env.NODE_SECRET
  if (!secret) {
    throw new Error(
      'NODE_SECRET environment variable is not set. ' +
        'Set it in .env.local or your hosting environment.'
    )
  }
  // scrypt stretches any-length string into a 32-byte key
  return scryptSync(secret, 'bornastar-salt', 32)
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a colon-delimited string: "<iv>:<authTag>:<ciphertext>" (all hex).
 *
 * Throws if NODE_SECRET is not set.
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return ''

  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join(
    ':'
  )
}

/**
 * Decrypts a string produced by encrypt().
 * Returns the original plaintext.
 *
 * Throws if:
 * - NODE_SECRET is not set
 * - The input format is invalid (wrong number of colon-separated parts)
 * - The auth tag does not match (tampered ciphertext)
 */
export function decrypt(stored: string): string {
  if (!stored) return ''

  const parts = stored.split(':')
  if (parts.length !== 3) {
    throw new Error(
      'Invalid encrypted value format. Expected "<iv>:<authTag>:<ciphertext>".'
    )
  }

  const [ivHex, authTagHex, ciphertextHex] = parts
  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return decrypted.toString('utf8')
}
