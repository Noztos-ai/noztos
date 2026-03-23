'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import type { BadgeState } from './ClaudeBadge'

interface AuthModalContextValue {
  openModal: () => void
}

const AuthModalContext = createContext<AuthModalContextValue>({
  openModal: () => {},
})

export function useAuthModal() {
  return useContext(AuthModalContext)
}

interface AuthModalProviderProps {
  initialOpen: boolean
  initialStatus?: BadgeState
  children: ReactNode
}

const STATUS_CONFIG: Record<BadgeState, { dot: string; label: string; description: string }> = {
  active: {
    dot: 'bg-emerald-500',
    label: 'Connected',
    description: 'Your API key is valid and working',
  },
  no_credits: {
    dot: 'bg-amber-400',
    label: 'No credits',
    description: 'Add billing at console.anthropic.com',
  },
  invalid: {
    dot: 'bg-red-500',
    label: 'Invalid key',
    description: 'Your API key is no longer valid',
  },
  no_key: {
    dot: 'bg-zinc-300 dark:bg-zinc-600',
    label: 'Not connected',
    description: 'Add your API key to get started',
  },
}

export function AuthModalProvider({ initialOpen, initialStatus = 'no_key', children }: AuthModalProviderProps) {
  const [open, setOpen] = useState(initialOpen)
  const [apiKey, setApiKey] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<BadgeState>(initialStatus)
  const [maskedKey, setMaskedKey] = useState('')
  const [showRemove, setShowRemove] = useState(false)

  const openModal = useCallback(() => {
    setOpen(true)
    setError('')
    setApiKey('')
    setShowRemove(false)
  }, [])

  // Fetch current status when modal opens
  useEffect(() => {
    if (!open) return
    fetch('/api/auth/apikey')
      .then((r) => r.json())
      .then((data) => {
        if (data.status && data.status !== 'no_key') {
          setStatus(data.status as BadgeState)
          setMaskedKey(data.maskedKey ?? '')
        }
      })
      .catch(() => {})
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/auth/apikey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to save API key')
        setLoading(false)
        return
      }

      setStatus(data.status as BadgeState)
      setMaskedKey(`sk-ant-...${apiKey.trim().slice(-4)}`)
      setApiKey('')
      setLoading(false)
      setTimeout(() => {
        setOpen(false)
        window.location.reload()
      }, 1000)
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  async function handleRemoveKey() {
    try {
      await fetch('/api/auth/apikey', { method: 'DELETE' })
      setStatus('no_key')
      setMaskedKey('')
      setShowRemove(false)
      window.location.reload()
    } catch {
      setError('Failed to remove key.')
    }
  }

  const statusConfig = STATUS_CONFIG[status]
  const hasKey = status !== 'no_key'

  return (
    <AuthModalContext.Provider value={{ openModal }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-5 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Claude API Connection
            </h2>

            {/* Current status */}
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
              <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${statusConfig.dot}`} />
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {statusConfig.label}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {statusConfig.description}
                </p>
                {maskedKey && hasKey && (
                  <p className="mt-1 text-xs font-mono text-zinc-400 dark:text-zinc-500">
                    {maskedKey}
                  </p>
                )}
              </div>
            </div>

            {/* Remove key confirmation */}
            {hasKey && showRemove && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
                <p className="mb-3 text-sm text-red-700 dark:text-red-400">
                  Remove your API key? Your AI employees will stop working.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleRemoveKey}
                    className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Remove key
                  </button>
                  <button
                    onClick={() => setShowRemove(false)}
                    className="rounded-lg px-3 py-1.5 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* API key form */}
            <p className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">
              {hasKey ? 'Replace your API key' : 'Paste your Anthropic API key'}
            </p>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="mb-4 inline-block text-sm font-medium text-zinc-600 underline decoration-zinc-300 hover:text-zinc-900 dark:text-zinc-400 dark:decoration-zinc-600 dark:hover:text-zinc-200"
            >
              Get your key at console.anthropic.com
            </a>

            <form onSubmit={handleSubmit} className="space-y-3">
              {error && (
                <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
                  {error}
                </div>
              )}

              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-ant-api03-..."
                required
                className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
              />

              <button
                type="submit"
                disabled={loading || !apiKey.trim()}
                className="flex h-11 w-full items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {loading ? 'Verifying...' : hasKey ? 'Update key' : 'Connect API key'}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => setOpen(false)}
                className="text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                Close
              </button>
              {hasKey && !showRemove && (
                <button
                  onClick={() => setShowRemove(true)}
                  className="text-sm text-red-400 transition-colors hover:text-red-600 dark:hover:text-red-300"
                >
                  Remove key
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </AuthModalContext.Provider>
  )
}
