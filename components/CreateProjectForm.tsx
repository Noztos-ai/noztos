'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useGitHubModal } from './GitHubModal'

export function CreateProjectButton() {
  const router = useRouter()
  const { openGitHub } = useGitHubModal()
  const [creating, setCreating] = useState(false)

  function handleClick() {
    openGitHub({
      onRepoSelected: async (repo) => {
        setCreating(true)
        try {
          // Create project with repo name
          const res = await fetch('/api/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: repo.name }),
          })

          if (!res.ok) {
            setCreating(false)
            return
          }

          const { id } = await res.json()

          // Clone repo into project
          await fetch(`/api/projects/${id}/repository`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              owner: repo.owner,
              repo: repo.name,
              branch: repo.defaultBranch,
            }),
          })

          router.push(`/projects/${id}`)
          router.refresh()
        } catch {
          setCreating(false)
        }
      },
    })
  }

  return (
    <button
      onClick={handleClick}
      disabled={creating}
      className="flex h-10 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
    >
      {creating ? 'Cloning...' : 'New Project'}
    </button>
  )
}
