'use client'

import { useAuthModal } from './AuthModal'

export type BadgeState = 'connected' | 'needs_reconnect' | 'error' | 'none'

const CONFIG: Record<BadgeState, { dot: string; label: string; title: string }> = {
  connected: {
    dot: 'bg-emerald-500',
    label: 'Claude connected',
    title: 'Anthropic account connected',
  },
  needs_reconnect: {
    dot: 'bg-amber-400',
    label: 'Reconnect Claude',
    title: 'Your Anthropic account needs to be reconnected',
  },
  error: {
    dot: 'bg-red-500',
    label: 'Auth error — retry',
    title: 'Authentication failed. Click to try again.',
  },
  none: {
    dot: 'bg-zinc-300',
    label: 'Connect Claude',
    title: 'Connect your Anthropic account',
  },
}

interface ClaudeBadgeProps {
  state: BadgeState
}

export function ClaudeBadge({ state }: ClaudeBadgeProps) {
  const { openModal } = useAuthModal()
  const { dot, label, title } = CONFIG[state]

  return (
    <button
      onClick={openModal}
      title={title}
      className="flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
      {label}
    </button>
  )
}
