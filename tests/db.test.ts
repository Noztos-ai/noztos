import { describe, it, expect, vi, beforeEach } from 'vitest'

// Test the Prisma singleton behavior in lib/db.ts.
// We mock both the pg Pool and PrismaClient so no real DB is needed.
// This tests that the singleton logic (globalThis caching) works correctly.

vi.mock('pg', () => {
  function Pool() {
    return {}
  }
  return { Pool }
})

vi.mock('@prisma/adapter-pg', () => {
  function PrismaPg() {
    return {}
  }
  return { PrismaPg }
})

vi.mock('../generated/prisma/client', () => {
  let instanceId = 0

  function MockPrismaClient() {
    this._id = ++instanceId
  }

  return { PrismaClient: MockPrismaClient }
})

describe('Prisma singleton (lib/db.ts)', () => {
  beforeEach(() => {
    // Clear the globalThis cache before each test
    const g = globalThis as { prisma?: unknown }
    delete g.prisma
    vi.resetModules()
  })

  it('exports a prisma instance', async () => {
    const { prisma } = await import('../lib/db')
    expect(prisma).toBeDefined()
    expect(typeof prisma).toBe('object')
  })

  it('returns the same instance on repeated imports (singleton)', async () => {
    const { prisma: a } = await import('../lib/db')
    const { prisma: b } = await import('../lib/db')
    // Same object reference via module cache
    expect(a).toBe(b)
  })

  it('caches the instance on globalThis in non-production environments', async () => {
    const originalEnv = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'development'
      const { prisma } = await import('../lib/db')
      const g = globalThis as { prisma?: unknown }
      expect(g.prisma).toBeDefined()
      expect(g.prisma).toBe(prisma)
    } finally {
      process.env.NODE_ENV = originalEnv
    }
  })
})
