import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { encrypt, decrypt } from '../lib/crypto'

describe('crypto', () => {
  const originalSecret = process.env.NODE_SECRET

  beforeEach(() => {
    process.env.NODE_SECRET = 'test-secret-for-vitest-only'
  })

  afterEach(() => {
    process.env.NODE_SECRET = originalSecret
  })

  describe('encrypt', () => {
    it('returns a colon-delimited hex string with 3 parts', () => {
      const result = encrypt('hello world')
      const parts = result.split(':')
      expect(parts).toHaveLength(3)
      // Each part should be valid hex
      for (const part of parts) {
        expect(part).toMatch(/^[0-9a-f]+$/i)
      }
    })

    it('returns different ciphertexts for the same plaintext (random IV)', () => {
      const a = encrypt('same input')
      const b = encrypt('same input')
      // Same plaintext → different output due to random IV
      expect(a).not.toBe(b)
    })

    it('handles empty string without throwing', () => {
      expect(encrypt('')).toBe('')
    })

    it('handles unicode characters', () => {
      const result = encrypt('こんにちは 🌸')
      expect(result.split(':')).toHaveLength(3)
    })

    it('throws when NODE_SECRET is not set', () => {
      delete process.env.NODE_SECRET
      expect(() => encrypt('something')).toThrow('NODE_SECRET')
    })
  })

  describe('decrypt', () => {
    it('round-trips: decrypt(encrypt(x)) === x', () => {
      const plaintext = 'my-secret-anthropic-token'
      expect(decrypt(encrypt(plaintext))).toBe(plaintext)
    })

    it('round-trips unicode correctly', () => {
      const plaintext = 'こんにちは 🌸'
      expect(decrypt(encrypt(plaintext))).toBe(plaintext)
    })

    it('returns empty string for empty input', () => {
      expect(decrypt('')).toBe('')
    })

    it('throws on invalid format (wrong number of parts)', () => {
      expect(() => decrypt('notvalid')).toThrow('Invalid encrypted value format')
      expect(() => decrypt('a:b')).toThrow('Invalid encrypted value format')
      expect(() => decrypt('a:b:c:d')).toThrow('Invalid encrypted value format')
    })

    it('throws on tampered ciphertext (auth tag mismatch)', () => {
      const encrypted = encrypt('real value')
      const parts = encrypted.split(':')
      // Corrupt the ciphertext portion
      parts[2] = parts[2].replace(/.$/, parts[2].endsWith('0') ? '1' : '0')
      expect(() => decrypt(parts.join(':'))).toThrow()
    })

    it('throws when NODE_SECRET is not set', () => {
      const encrypted = encrypt('something')
      delete process.env.NODE_SECRET
      expect(() => decrypt(encrypted)).toThrow('NODE_SECRET')
    })
  })
})
