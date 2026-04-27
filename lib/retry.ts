// ── withRetry ──────────────────────────────────────────────────────
//
// Small wrapper for retrying transient Prisma errors with exponential
// backoff. We don't want a generic retry-everything — that could mask
// real bugs (validation failures, missing rows, business-rule errors)
// and turn a 5-line bug report into a "looks intermittent" mystery.
//
// What we DO retry: connection-layer errors that come and go on their
// own. The DriverAdapterError variants Prisma surfaces under a flaky
// pooled connection (cross-region latency, connection pool churn,
// brief Supabase-side hiccups). These get a 100ms / 200ms / 400ms
// backoff and, in practice, vanish after the first retry.
//
// What we do NOT retry: P2002 unique violations, P2025 not-found,
// P2003 fk constraint, plain Error throws. Those are signals to fix,
// not to paper over.

const TRANSIENT_PATTERNS = [
  'DatabaseNotReachable',
  'SocketTimeout',
  'ConnectionClosed',
  'ConnectionTimeout',
  'PoolTimeout',
] as const

export function isTransientPrismaError(err: unknown): boolean {
  if (!err) return false
  // Prisma wraps the underlying driver error inside a long message; a
  // simple includes-check on the stringified form catches every case
  // we've actually observed in production logs.
  const text = err instanceof Error
    ? `${err.name} ${err.message}\n${err.stack ?? ''}`
    : String(err)
  return TRANSIENT_PATTERNS.some((p) => text.includes(p))
}

export interface WithRetryOptions {
  /** Max number of attempts INCLUDING the first one. Default 3. */
  max?: number
  /** Base backoff in ms, doubled each retry. Default 100. */
  baseMs?: number
  /** Tag for logs so we can correlate retry storms to specific ops. */
  tag?: string
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: WithRetryOptions = {},
): Promise<T> {
  const max = opts.max ?? 3
  const baseMs = opts.baseMs ?? 100
  const tag = opts.tag ?? 'op'
  let lastErr: unknown
  for (let attempt = 1; attempt <= max; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (!isTransientPrismaError(err) || attempt === max) {
        if (attempt > 1) {
          console.warn(`[retry] ${tag} giving up after ${attempt} attempt(s): ${(err as Error).message}`)
        }
        throw err
      }
      const delay = baseMs * Math.pow(2, attempt - 1)
      console.log(`[retry] ${tag} transient error on attempt ${attempt}/${max}, sleeping ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  // Unreachable: the loop either returns or throws. Throwing here keeps
  // TypeScript happy that all paths return T.
  throw lastErr
}
