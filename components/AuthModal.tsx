'use client'

import { createContext, useContext, useState, useCallback } from 'react'
import type { ReactNode } from 'react'

// AuthModal serves double duty:
// 1. Context provider — lets ClaudeBadge (or any descendant) call openModal()
// 2. Modal UI — renders the "Connect Anthropic" overlay when open
//
// Rendered in layout.tsx (Server Component) which passes initialOpen based on
// whether the user has a session.

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
  children: ReactNode
}

export function AuthModalProvider({ initialOpen, children }: AuthModalProviderProps) {
  const [open, setOpen] = useState(initialOpen)
  const openModal = useCallback(() => setOpen(true), [])

  return (
    <AuthModalContext.Provider value={{ openModal }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-zinc-900">
            <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              Connect your Anthropic account
            </h2>
            <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
              Bornastar uses your Anthropic account to power AI employees.
              Connect once and your team is ready to work.
            </p>
            <a
              href="/api/auth/anthropic/start"
              className="flex h-11 w-full items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Connect Anthropic account
            </a>
            <button
              onClick={() => setOpen(false)}
              className="mt-3 flex h-9 w-full items-center justify-center rounded-full text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              Skip for now
            </button>
          </div>
        </div>
      )}
    </AuthModalContext.Provider>
  )
}
