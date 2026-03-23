'use client'

import { createContext, useContext, useState, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'

interface GitHubModalContextValue {
  openGitHub: (opts?: { projectId?: string; onRepoSelected?: (repo: RepoInfo) => void }) => void
}

const GitHubModalContext = createContext<GitHubModalContextValue>({
  openGitHub: () => {},
})

export function useGitHubModal() {
  return useContext(GitHubModalContext)
}

interface RepoInfo {
  owner: string
  name: string
  fullName: string
  defaultBranch: string
  isPrivate: boolean
}

interface GitHubModalProviderProps {
  isConnected: boolean
  children: ReactNode
}

export function GitHubModalProvider({ isConnected, children }: GitHubModalProviderProps) {
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState<string | undefined>()
  const [onRepoSelected, setOnRepoSelected] = useState<((repo: RepoInfo) => void) | undefined>()

  const openGitHub = useCallback((opts?: { projectId?: string; onRepoSelected?: (repo: RepoInfo) => void }) => {
    setProjectId(opts?.projectId)
    // Wrap in a function to avoid React treating it as a state updater
    setOnRepoSelected(() => opts?.onRepoSelected)
    setOpen(true)
  }, [])

  function close() {
    setOpen(false)
    setProjectId(undefined)
    setOnRepoSelected(undefined)
  }

  return (
    <GitHubModalContext.Provider value={{ openGitHub }}>
      {children}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
            {!isConnected ? (
              <ConnectView onClose={close} />
            ) : (
              <RepoSelectorView
                projectId={projectId}
                onSelect={(repo) => {
                  onRepoSelected?.(repo)
                  close()
                }}
                onClose={close}
              />
            )}
          </div>
        </div>
      )}
    </GitHubModalContext.Provider>
  )
}

// ── Connect View ───────────────────────────────────────────────────────────

function ConnectView({ onClose }: { onClose: () => void }) {
  return (
    <div className="p-8">
      <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
        Connect GitHub
      </h2>
      <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
        Connect your GitHub account to clone repositories and let your AI team work on real code.
      </p>

      <a
        href="/api/auth/github/start"
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
        </svg>
        Connect GitHub
      </a>

      <button
        onClick={onClose}
        className="mt-3 flex h-9 w-full items-center justify-center text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
      >
        Cancel
      </button>
    </div>
  )
}

// ── Repo Selector View ─────────────────────────────────────────────────────

function RepoSelectorView({
  projectId,
  onSelect,
  onClose,
}: {
  projectId?: string
  onSelect: (repo: RepoInfo) => void
  onClose: () => void
}) {
  const [repos, setRepos] = useState<RepoInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [cloning, setCloning] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/github/repos')
      .then((r) => r.json())
      .then((data) => {
        setRepos(data.repos ?? [])
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load repositories')
        setLoading(false)
      })
  }, [])

  const filtered = repos.filter((r) =>
    r.fullName.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSelect(repo: RepoInfo) {
    if (!projectId) {
      // Just selecting for project creation — pass the repo info up
      onSelect(repo)
      return
    }

    // Clone into existing project
    setCloning(repo.fullName)
    setError('')

    try {
      const res = await fetch(`/api/projects/${projectId}/repository`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repo.owner,
          repo: repo.name,
          branch: repo.defaultBranch,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to clone repository')
        setCloning(null)
        return
      }

      onSelect(repo)
    } catch {
      setError('Something went wrong')
      setCloning(null)
    }
  }

  return (
    <div className="flex flex-col" style={{ maxHeight: '80vh' }}>
      <div className="border-b border-zinc-200/60 p-6 pb-4 dark:border-zinc-700">
        <h2 className="mb-3 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Select repository
        </h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search repositories..."
          autoFocus
          className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-3" style={{ maxHeight: '400px' }}>
        {error && (
          <div className="mb-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-zinc-400">Loading repositories...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-zinc-400">
              {search ? 'No repositories match your search' : 'No repositories found'}
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map((repo) => (
              <button
                key={repo.fullName}
                onClick={() => handleSelect(repo)}
                disabled={!!cloning}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:hover:bg-zinc-800"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                    {repo.name}
                  </p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    {repo.owner}
                    {repo.isPrivate && (
                      <span className="ml-2 rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                        private
                      </span>
                    )}
                  </p>
                </div>
                {cloning === repo.fullName ? (
                  <span className="text-xs text-zinc-400">Cloning...</span>
                ) : (
                  <span className="text-xs text-zinc-400">{repo.defaultBranch}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-200/60 p-6 pt-4 dark:border-zinc-700">
        <button
          onClick={onClose}
          className="w-full text-center text-sm text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
