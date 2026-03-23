import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/crypto'
import { getSessionUserId } from '@/lib/session'

// POST — save or update the user's Anthropic API key
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const userId = getSessionUserId(cookieStore.get('session')?.value)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { apiKey } = (await request.json()) as { apiKey?: string }
  if (!apiKey || !apiKey.startsWith('sk-ant-')) {
    return NextResponse.json(
      { error: 'Invalid API key. It should start with sk-ant-' },
      { status: 400 }
    )
  }

  // Verify the key works by calling the Anthropic API
  const verification = await verifyAnthropicKey(apiKey)
  if (!verification.valid) {
    return NextResponse.json(
      { error: verification.error },
      { status: 400 }
    )
  }

  await prisma.user.update({
    where: { id: userId },
    data: { anthropicToken: encrypt(apiKey) },
  })

  return NextResponse.json({ success: true, status: verification.status })
}

// GET — check the status of the user's saved API key
export async function GET() {
  const cookieStore = await cookies()
  const userId = getSessionUserId(cookieStore.get('session')?.value)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { anthropicToken: true },
  })

  if (!user?.anthropicToken) {
    return NextResponse.json({ status: 'no_key' })
  }

  const apiKey = decrypt(user.anthropicToken)
  const verification = await verifyAnthropicKey(apiKey)

  return NextResponse.json({
    status: verification.valid ? verification.status : 'invalid',
    error: verification.error ?? null,
    maskedKey: `sk-ant-...${apiKey.slice(-4)}`,
  })
}

// DELETE — remove the user's API key
export async function DELETE() {
  const cookieStore = await cookies()
  const userId = getSessionUserId(cookieStore.get('session')?.value)
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await prisma.user.update({
    where: { id: userId },
    data: { anthropicToken: null },
  })

  return NextResponse.json({ success: true })
}

interface VerificationResult {
  valid: boolean
  status?: 'active' | 'no_credits'
  error?: string
}

async function verifyAnthropicKey(apiKey: string): Promise<VerificationResult> {
  try {
    // Use the messages API with minimal tokens to verify the key
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    if (res.ok) {
      return { valid: true, status: 'active' }
    }

    const data = await res.json().catch(() => null)
    const errorType = data?.error?.type ?? ''
    const errorMessage = data?.error?.message ?? ''

    if (res.status === 401) {
      return { valid: false, error: 'Invalid API key. Check and try again.' }
    }
    if (res.status === 403) {
      return { valid: false, error: 'API key does not have permission. Check your Anthropic console.' }
    }
    if (res.status === 429 || errorType === 'rate_limit_error') {
      // Rate limited but key is valid
      return { valid: true, status: 'active' }
    }
    if (errorType === 'insufficient_quota' || errorMessage.includes('credit')) {
      return { valid: true, status: 'no_credits' }
    }

    // Other errors (500, etc) — key might be valid, API is just having issues
    return { valid: true, status: 'active' }
  } catch {
    return { valid: false, error: 'Could not reach Anthropic API. Try again later.' }
  }
}
