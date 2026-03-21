import { describe, it, expect, vi, beforeEach } from 'vitest'

// Seed idempotency test.
//
// We mock PrismaClient to avoid needing a real DB in unit tests.
// The integration test (run with a real DB) lives in tests/integration/seed.test.ts
// and is run separately before deploying.
//
// What we verify here:
// 1. The seed calls upsert (not create) — safe to run twice
// 2. Exactly 7 collaborators are seeded
// 3. The upsert uses the correct unique key (name + null projectId)
// 4. All seeded collaborators have isPlatformDefault: true

vi.mock('../generated/prisma/client', () => {
  const mockUpsert = vi.fn()
  const mockDisconnect = vi.fn()

  // Must use function keyword so `new PrismaClient()` works as a constructor
  function MockPrismaClient() {
    return {
      collaborator: { upsert: mockUpsert },
      $disconnect: mockDisconnect,
    }
  }

  return {
    PrismaClient: MockPrismaClient,
    Phase: {
      planner: 'planner',
      reviewer: 'reviewer',
    },
    __mockUpsert: mockUpsert,
    __mockDisconnect: mockDisconnect,
  }
})

describe('prisma/seed.ts', () => {
  beforeEach(async () => {
    vi.resetModules()
    // Re-import to get fresh mock references after resetModules
    const mod = await import('../generated/prisma/client')
    const { __mockUpsert, __mockDisconnect } = mod as unknown as {
      __mockUpsert: ReturnType<typeof vi.fn>
      __mockDisconnect: ReturnType<typeof vi.fn>
    }
    __mockUpsert.mockReset()
    __mockUpsert.mockImplementation(({ create }: { create: object }) =>
      Promise.resolve(create)
    )
    __mockDisconnect.mockReset()
    __mockDisconnect.mockResolvedValue(undefined)
  })

  async function runSeedAndGetMocks() {
    vi.resetModules()
    await import('../prisma/seed')
    const mod = await import('../generated/prisma/client')
    const { __mockUpsert, __mockDisconnect } = mod as unknown as {
      __mockUpsert: ReturnType<typeof vi.fn>
      __mockDisconnect: ReturnType<typeof vi.fn>
    }
    await vi.waitFor(() => expect(__mockUpsert.mock.calls.length + __mockDisconnect.mock.calls.length).toBeGreaterThan(0), { timeout: 3000 })
    return { mockUpsert: __mockUpsert, mockDisconnect: __mockDisconnect }
  }

  it('calls upsert exactly 7 times (one per platform default)', async () => {
    const { mockUpsert } = await runSeedAndGetMocks()
    await vi.waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(7), { timeout: 3000 })
  })

  it('seeds all 7 expected collaborators by name', async () => {
    const { mockUpsert } = await runSeedAndGetMocks()
    await vi.waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(7), { timeout: 3000 })

    const names = mockUpsert.mock.calls.map(
      (call: [{ create: { name: string } }]) => call[0].create.name
    )
    expect(names).toContain('CEO')
    expect(names).toContain('Architect')
    expect(names).toContain('Designer')
    expect(names).toContain('Code Review')
    expect(names).toContain('QA')
    expect(names).toContain('Security')
    expect(names).toContain('Documentation')
  })

  it('uses projectId: null in the unique where clause (global templates)', async () => {
    const { mockUpsert } = await runSeedAndGetMocks()
    await vi.waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(7), { timeout: 3000 })

    for (const call of mockUpsert.mock.calls as [{ where: { name_projectId: { projectId: unknown } } }][]) {
      expect(call[0].where).toHaveProperty('name_projectId')
      expect(call[0].where.name_projectId.projectId).toBeNull()
    }
  })

  it('sets isPlatformDefault: true on all seeded collaborators', async () => {
    const { mockUpsert } = await runSeedAndGetMocks()
    await vi.waitFor(() => expect(mockUpsert).toHaveBeenCalledTimes(7), { timeout: 3000 })

    for (const call of mockUpsert.mock.calls as [{ create: { isPlatformDefault: boolean } }][]) {
      expect(call[0].create.isPlatformDefault).toBe(true)
    }
  })

  it('calls $disconnect after seeding', async () => {
    const { mockDisconnect } = await runSeedAndGetMocks()
    await vi.waitFor(() => expect(mockDisconnect).toHaveBeenCalledTimes(1), { timeout: 3000 })
  })
})
