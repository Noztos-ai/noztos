import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

// Prisma 7 requires a driver adapter. We use the official pg adapter.
//
// Connection flow:
//   DATABASE_URL → pg.Pool → PrismaPg adapter → PrismaClient
//
// Singleton pattern prevents connection pool exhaustion during Next.js hot reload:
//
// ┌──────────────────────────────────────────────────────────┐
// │  dev:  globalThis.__prisma (persists across hot reloads) │
// │  prod: module-level singleton (standard singleton)       │
// └──────────────────────────────────────────────────────────┘

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient(): PrismaClient {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaPg(pool as any)

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? (['query', 'error', 'warn'] as const)
        : (['error'] as const),
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}
