'use client'

import { useAuthModal } from './AuthModal'

export type BadgeState = 'active' | 'no_credits' | 'invalid' | 'no_key'

const CONFIG: Record<BadgeState, { dot: string; label: string; description: string }> = {
  active: {
    dot: 'bg-emerald-500',
    label: 'Claude API',
    description: 'Connected and ready to use',
  },
  no_credits: {
    dot: 'bg-amber-400',
    label: 'Claude API',
    description: 'No credits available — add billing on Anthropic',
  },
  invalid: {
    dot: 'bg-red-500',
    label: 'Claude API',
    description: 'API key is invalid — click to update',
  },
  no_key: {
    dot: 'bg-zinc-300 dark:bg-zinc-600',
    label: 'Claude API',
    description: 'Not connected — click to add your API key',
  },
}

interface ClaudeBadgeProps {
  state: BadgeState
}

export function ClaudeBadge({ state }: ClaudeBadgeProps) {
  const { openModal } = useAuthModal()
  const { dot, label, description } = CONFIG[state]

  return (
    <button
      onClick={openModal}
      className="flex items-center gap-3 rounded-xl border border-zinc-200/60 bg-white px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
    >
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{label}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
    </button>
  )
}
