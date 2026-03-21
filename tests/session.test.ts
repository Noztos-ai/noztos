import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('lib/session.ts', () => {
  const TEST_SECRET = 'test-secret-for-session-tests'
  let originalSecret: string | undefined

  beforeEach(() => {
    originalSecret = process.env.NODE_SECRET
    process.env.NODE_SECRET = TEST_SECRET
  })

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.NODE_SECRET
    } else {
      process.env.NODE_SECRET = originalSecret
    }
  })

  it('setSessionCookieArgs produces a value that getSessionUserId can parse', async () => {
    const { setSessionCookieArgs, getSessionUserId } = await import('../lib/session')
    const args = setSessionCookieArgs('user_123')
    expect(args.name).toBe('session')
    expect(args.httpOnly).toBe(true)
    expect(args.path).toBe('/')

    const userId = getSessionUserId(args.value)
    expect(userId).toBe('user_123')
  })

  it('getSessionUserId returns null for undefined', async () => {
    const { getSessionUserId } = await import('../lib/session')
    expect(getSessionUserId(undefined)).toBeNull()
  })

  it('getSessionUserId returns null for empty string', async () => {
    const { getSessionUserId } = await import('../lib/session')
    expect(getSessionUserId('')).toBeNull()
  })

  it('getSessionUserId returns null for value without pipe separator', async () => {
    const { getSessionUserId } = await import('../lib/session')
    expect(getSessionUserId('no-pipe-here')).toBeNull()
  })

  it('getSessionUserId returns null for tampered HMAC', async () => {
    const { setSessionCookieArgs, getSessionUserId } = await import('../lib/session')
    const args = setSessionCookieArgs('user_123')
    // Corrupt the HMAC by changing last char
    const tampered = args.value.slice(0, -1) + (args.value.at(-1) === 'a' ? 'b' : 'a')
    expect(getSessionUserId(tampered)).toBeNull()
  })

  it('getSessionUserId returns null for tampered userId', async () => {
    const { setSessionCookieArgs, getSessionUserId } = await import('../lib/session')
    const args = setSessionCookieArgs('user_123')
    // Replace the userId portion
    const parts = args.value.split('|')
    const tampered = `user_HACKED|${parts[1]}`
    expect(getSessionUserId(tampered)).toBeNull()
  })

  it('clearSessionCookieArgs sets maxAge to 0', async () => {
    const { clearSessionCookieArgs } = await import('../lib/session')
    const args = clearSessionCookieArgs()
    expect(args.maxAge).toBe(0)
    expect(args.value).toBe('')
  })

  it('throws when NODE_SECRET is not set', async () => {
    delete process.env.NODE_SECRET
    const { setSessionCookieArgs } = await import('../lib/session')
    expect(() => setSessionCookieArgs('user_123')).toThrow('NODE_SECRET')
  })

  it('produces different HMACs for different userIds', async () => {
    const { setSessionCookieArgs } = await import('../lib/session')
    const a = setSessionCookieArgs('user_1')
    const b = setSessionCookieArgs('user_2')
    const hmacA = a.value.split('|')[1]
    const hmacB = b.value.split('|')[1]
    expect(hmacA).not.toBe(hmacB)
  })

  it('produces consistent HMAC for same userId', async () => {
    const { setSessionCookieArgs } = await import('../lib/session')
    const a = setSessionCookieArgs('user_1')
    const b = setSessionCookieArgs('user_1')
    expect(a.value).toBe(b.value)
  })
})
