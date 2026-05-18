'use client'

// Reset-password page. Token comes in the URL (?token=...) — the user
// just types a new password and submits. On success, the server signs
// them in automatically and we land them on the dashboard.
//
// Visual: same shell as /login so the brand stays consistent.

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') ?? ''
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) {
      setError('Missing token. Open the link from your email again.')
      return
    }
    const form = new FormData(e.currentTarget)
    const password = form.get('password') as string
    const confirm = form.get('confirmPassword') as string
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? 'Reset failed')
      }
      setDone(true)
      setTimeout(() => {
        router.push('/')
        router.refresh()
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');
        :root {
          --bg: oklch(0.13 0.008 255);
          --bg-2: oklch(0.16 0.009 255);
          --bg-3: oklch(0.19 0.01 255);
          --fg: oklch(0.96 0.005 255);
          --muted: oklch(0.62 0.012 255);
          --muted-2: oklch(0.45 0.012 255);
          --line: oklch(0.26 0.012 255);
          --line-2: oklch(0.22 0.012 255);
          --accent: oklch(0.88 0.19 130);
          --display: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
          --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        html, body { background: var(--bg); color: var(--fg); margin: 0; padding: 0; overflow-x: hidden; }
        body { font-family: var(--display); -webkit-font-smoothing: antialiased; }
        ::selection { background: var(--accent); color: #000; }
      `}</style>

      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        background:
          'radial-gradient(1200px 600px at 80% -10%, oklch(0.88 0.19 130 / 0.08), transparent 60%),' +
          'radial-gradient(900px 500px at 10% 110%, oklch(0.55 0.18 260 / 0.07), transparent 60%),' +
          'linear-gradient(var(--line-2) 1px, transparent 1px) 0 0 / 100% 64px,' +
          'linear-gradient(90deg, var(--line-2) 1px, transparent 1px) 0 0 / 64px 100%',
        maskImage: 'radial-gradient(ellipse at 50% 30%, black 30%, transparent 80%)',
        WebkitMaskImage: 'radial-gradient(ellipse at 50% 30%, black 30%, transparent 80%)',
        opacity: 0.55,
      }} />
      <div aria-hidden style={{
        position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none',
        background: 'repeating-linear-gradient(to bottom, transparent 0 2px, oklch(1 0 0 / 0.012) 2px 3px)',
        mixBlendMode: 'overlay',
      }} />

      <nav style={{ position: 'relative', zIndex: 10, borderBottom: '1px solid var(--line)', background: 'oklch(0.13 0.008 255 / 0.7)', backdropFilter: 'blur(8px)' }}>
        <div style={{ maxWidth: 1280, margin: '0 auto', padding: '14px 28px', display: 'flex', alignItems: 'center', gap: 32 }}>
          <a href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--fg)', fontFamily: 'var(--display)', fontWeight: 600, fontSize: 18, letterSpacing: '-0.01em', textDecoration: 'none' }}>noztos</a>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.14em' }}>reset password</span>
        </div>
      </nav>

      <main style={{ position: 'relative', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 50px)', padding: '40px 20px' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ fontFamily: 'var(--display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
              {done ? <>Done. <span style={{ color: 'var(--accent)' }}>Signing you in…</span></> : <>Set a new <span style={{ color: 'var(--accent)' }}>password.</span></>}
            </h1>
            <p style={{ marginTop: 10, color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
              {done ? 'Your password is updated.' : 'Pick something at least 8 chars with mixed case + a number.'}
            </p>
          </div>

          {!done && (
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {error && (
                <div style={{ padding: '10px 12px', borderRadius: 4, border: '1px solid oklch(0.72 0.18 25 / 0.4)', background: 'oklch(0.72 0.18 25 / 0.08)', color: 'oklch(0.85 0.15 25)', fontSize: 12, fontFamily: 'var(--mono)' }}>
                  {error}
                </div>
              )}
              <Field name="password" label="New password" type="password" autoComplete="new-password" required />
              <Field name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" required />

              <button
                type="submit"
                disabled={loading || !token}
                style={{
                  marginTop: 12, padding: '12px 16px',
                  border: '1px solid var(--accent)',
                  background: loading ? 'oklch(0.88 0.19 130 / 0.4)' : 'var(--accent)',
                  color: '#000', fontFamily: 'var(--mono)', fontSize: 12,
                  textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500,
                  cursor: loading ? 'wait' : 'pointer', borderRadius: 4,
                }}
              >
                {loading ? 'Saving…' : 'Save and sign in →'}
              </button>
            </form>
          )}

          <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--line-2)', color: 'var(--muted-2)', fontSize: 11, fontFamily: 'var(--mono)', textAlign: 'center' }}>
            <a href="/login" style={{ color: 'var(--accent)', textDecoration: 'none' }}>← Back to sign in</a>
          </div>
        </div>
      </main>
    </>
  )
}

function Field({ name, label, type, autoComplete, required }: {
  name: string; label: string; type: string; autoComplete?: string; required?: boolean
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>{label}</span>
      <input
        name={name} type={type} required={required} autoComplete={autoComplete}
        style={{
          padding: '10px 12px', background: 'var(--bg-2)',
          border: '1px solid var(--line)', color: 'var(--fg)',
          fontFamily: 'var(--display)', fontSize: 14,
          outline: 'none', borderRadius: 4, transition: 'border-color 0.15s',
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = 'oklch(0.88 0.19 130 / 0.6)' }}
        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--line)' }}
      />
    </label>
  )
}
