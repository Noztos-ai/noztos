'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { ReactNode } from 'react'

type View = 'menu' | 'change-password' | 'delete-confirm'

interface SettingsModalContextValue {
  openSettings: () => void
}

const SettingsModalContext = createContext<SettingsModalContextValue>({
  openSettings: () => {},
})

export function useSettingsModal() {
  return useContext(SettingsModalContext)
}

interface SettingsModalProviderProps {
  userName: string
  userEmail: string
  children: ReactNode
}

export function SettingsModalProvider({ userName, userEmail, children }: SettingsModalProviderProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<View>('menu')

  const openSettings = useCallback(() => {
    setOpen(true)
    setView('menu')
  }, [])

  function close() {
    setOpen(false)
    setView('menu')
  }

  return (
    <SettingsModalContext.Provider value={{ openSettings }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-zinc-900">
            {view === 'menu' && (
              <MenuView
                userName={userName}
                userEmail={userEmail}
                onChangePassword={() => setView('change-password')}
                onDeleteAccount={() => setView('delete-confirm')}
                onLogout={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' })
                  router.push('/login')
                  router.refresh()
                }}
                onClose={close}
              />
            )}
            {view === 'change-password' && (
              <ChangePasswordView
                onBack={() => setView('menu')}
                onClose={close}
              />
            )}
            {view === 'delete-confirm' && (
              <DeleteAccountView
                onBack={() => setView('menu')}
                onDeleted={() => {
                  router.push('/login')
                  router.refresh()
                }}
              />
            )}
          </div>
        </div>
      )}
    </SettingsModalContext.Provider>
  )
}

// ── Menu View ──────────────────────────────────────────────────────────────

function MenuView({
  userName,
  userEmail,
  onChangePassword,
  onDeleteAccount,
  onLogout,
  onClose,
}: {
  userName: string
  userEmail: string
  onChangePassword: () => void
  onDeleteAccount: () => void
  onLogout: () => void
  onClose: () => void
}) {
  return (
    <>
      <h2 className="mb-5 text-xl font-semibold text-zinc-900 dark:text-zinc-50">Settings</h2>

      {/* User info */}
      <div className="mb-6 rounded-xl border border-zinc-200/60 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/50">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{userName}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{userEmail}</p>
      </div>

      {/* Actions */}
      <div className="space-y-2">
        <button
          onClick={onChangePassword}
          className="flex w-full items-center justify-between rounded-xl border border-zinc-200/60 bg-white px-4 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Change password
          <ChevronRight />
        </button>

        <button
          onClick={onLogout}
          className="flex w-full items-center justify-between rounded-xl border border-zinc-200/60 bg-white px-4 py-3 text-left text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          Log out
          <ChevronRight />
        </button>

        <button
          onClick={onDeleteAccount}
          className="flex w-full items-center justify-between rounded-xl border border-red-200/60 bg-white px-4 py-3 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-900/40 dark:bg-zinc-800/50 dark:text-red-400 dark:hover:bg-red-950/20"
        >
          Delete account
          <ChevronRight />
        </button>
      </div>

      <button
        onClick={onClose}
        className="mt-5 w-full text-center text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        Close
      </button>
    </>
  )
}

// ── Change Password View ───────────────────────────────────────────────────

function ChangePasswordView({ onBack, onClose }: { onBack: () => void; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to change password')
        setLoading(false)
        return
      }

      setSuccess(true)
      setLoading(false)
      setTimeout(onClose, 1500)
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-4">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
          <svg className="h-6 w-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Password changed</p>
      </div>
    )
  }

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Change password</h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Current password
          </label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            New password
          </label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            autoComplete="new-password"
            placeholder="Min 8 chars, upper + lower + number"
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Confirm new password
          </label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            autoComplete="new-password"
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex h-11 w-full items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {loading ? 'Changing...' : 'Change password'}
        </button>
      </form>
    </>
  )
}

// ── Delete Account View ────────────────────────────────────────────────────

function DeleteAccountView({ onBack, onDeleted }: { onBack: () => void; onDeleted: () => void }) {
  const [password, setPassword] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (confirmText !== 'DELETE') {
      setError('Type DELETE to confirm')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/delete-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Failed to delete account')
        setLoading(false)
        return
      }

      onDeleted()
    } catch {
      setError('Something went wrong. Try again.')
      setLoading(false)
    }
  }

  return (
    <>
      <div className="mb-5 flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <h2 className="text-xl font-semibold text-red-600 dark:text-red-400">Delete account</h2>
      </div>

      <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/30">
        <p className="text-sm text-red-700 dark:text-red-400">
          This action is <strong>permanent</strong>. All your projects, tasks, teams, and data will be permanently deleted. This cannot be undone.
        </p>
      </div>

      <form onSubmit={handleDelete} className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Your password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Type <span className="font-mono font-bold">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            required
            placeholder="DELETE"
            autoComplete="off"
            className="mt-1 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
          />
        </div>

        <button
          type="submit"
          disabled={loading || confirmText !== 'DELETE' || !password}
          className="flex h-11 w-full items-center justify-center rounded-full bg-red-600 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Deleting...' : 'Delete my account permanently'}
        </button>
      </form>
    </>
  )
}

// ── Icons ──────────────────────────────────────────────────────────────────

function ChevronRight() {
  return (
    <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  )
}
