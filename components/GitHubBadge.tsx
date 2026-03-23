'use client'

import { useGitHubModal } from './GitHubModal'

export type GitHubBadgeState = 'connected' | 'not_connected'

const CONFIG: Record<GitHubBadgeState, { dot: string; label: string; description: string }> = {
  connected: {
    dot: 'bg-emerald-500',
    label: 'GitHub',
    description: 'Connected and ready to clone repos',
  },
  not_connected: {
    dot: 'bg-zinc-300 dark:bg-zinc-600',
    label: 'GitHub',
    description: 'Not connected — click to link your account',
  },
}

interface GitHubBadgeProps {
  state: GitHubBadgeState
  username?: string
}

export function GitHubBadge({ state, username }: GitHubBadgeProps) {
  const { openGitHub } = useGitHubModal()
  const { dot, label, description } = CONFIG[state]

  return (
    <button
      onClick={() => openGitHub()}
      className="flex items-center gap-3 rounded-xl border border-zinc-200/60 bg-white px-4 py-2.5 text-left shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
    >
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {label}
          {username && <span className="ml-1 font-normal text-zinc-500">@{username}</span>}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{description}</p>
      </div>
    </button>
  )
}
