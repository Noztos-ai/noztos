import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock next/server for NextResponse.redirect
vi.mock('next/server', () => {
  class MockNextResponse {
    status: number
    headers: Headers
    _cookies: Map<string, { value: string; options: Record<string, unknown> }>

    constructor(body?: string, init?: { status?: number }) {
      this.status = init?.status ?? 200
      this.headers = new Headers()
      this._cookies = new Map()
    }

    static redirect(url: string | URL) {
      const res = new MockNextResponse(undefined, { status: 302 })
      res.headers.set('location', typeof url === 'string' ? url : url.toString())
      return res
    }

    get cookies() {
      const cookies = this._cookies
      return {
        set(name: string | Record<string, unknown>, value?: string, options?: Record<string, unknown>) {
          if (typeof name === 'string') {
            cookies.set(name, { value: value ?? '', options: options ?? {} })
          } else {
            cookies.set(name.name as string, { value: name.value as string, options: name })
          }
        },
        get(name: string) {
          return cookies.get(name)
        },
      }
    }
  }

  return { NextResponse: MockNextResponse }
})

describe('GET /api/auth/anthropic/start', () => {
  let originalClientId: string | undefined
  let originalRedirectUri: string | undefined

  beforeEach(() => {
    originalClientId = process.env.ANTHROPIC_CLIENT_ID
    originalRedirectUri = process.env.ANTHROPIC_REDIRECT_URI
    process.env.ANTHROPIC_CLIENT_ID = 'test-client-id'
    process.env.ANTHROPIC_REDIRECT_URI = 'http://localhost:3000/api/auth/anthropic/callback'
  })

  afterEach(() => {
    if (originalClientId === undefined) delete process.env.ANTHROPIC_CLIENT_ID
    else process.env.ANTHROPIC_CLIENT_ID = originalClientId
    if (originalRedirectUri === undefined) delete process.env.ANTHROPIC_REDIRECT_URI
    else process.env.ANTHROPIC_REDIRECT_URI = originalRedirectUri
  })

  it('redirects to Anthropic authorization URL with correct params', async () => {
    const { GET } = await import('../app/api/auth/anthropic/start/route')
    const request = new Request('http://localhost:3000/api/auth/anthropic/start')
    const response = await GET(request) as unknown as { status: number; headers: Headers; cookies: { get: (name: string) => { value: string } | undefined } }

    expect(response.status).toBe(302)
    const location = response.headers.get('location')!
    const url = new URL(location)
    expect(url.hostname).toBe('claude.ai')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('test-client-id')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/anthropic/callback')
  })

  it('sets auth_state cookie with 64-char hex state', async () => {
    const { GET } = await import('../app/api/auth/anthropic/start/route')
    const request = new Request('http://localhost:3000/api/auth/anthropic/start')
    const response = await GET(request) as unknown as { cookies: { get: (name: string) => { value: string; options: Record<string, unknown> } | undefined } }

    const stateCookie = response.cookies.get('auth_state')
    expect(stateCookie).toBeDefined()
    expect(stateCookie!.value).toMatch(/^[0-9a-f]{64}$/)
  })

  it('includes state in both cookie and redirect URL', async () => {
    const { GET } = await import('../app/api/auth/anthropic/start/route')
    const request = new Request('http://localhost:3000/api/auth/anthropic/start')
    const response = await GET(request) as unknown as { headers: Headers; cookies: { get: (name: string) => { value: string } | undefined } }

    const stateCookie = response.cookies.get('auth_state')!
    const location = response.headers.get('location')!
    const url = new URL(location)
    expect(url.searchParams.get('state')).toBe(stateCookie.value)
  })

  it('returns 500 when ANTHROPIC_CLIENT_ID is missing', async () => {
    delete process.env.ANTHROPIC_CLIENT_ID
    const { GET } = await import('../app/api/auth/anthropic/start/route')
    const request = new Request('http://localhost:3000/api/auth/anthropic/start')
    const response = await GET(request) as unknown as { status: number }

    expect(response.status).toBe(500)
  })
})
