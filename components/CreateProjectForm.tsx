'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function CreateProjectForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slackChannel, setSlackChannel] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slackChannel: slackChannel.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Something went wrong')
        return
      }

      const { id } = await res.json()
      router.push(`/projects/${id}`)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Project name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          type="text"
          required
          maxLength={100}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="My AI Company"
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="slackChannel" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Slack channel <span className="text-zinc-400">(optional)</span>
        </label>
        <input
          id="slackChannel"
          type="text"
          value={slackChannel}
          onChange={(e) => setSlackChannel(e.target.value)}
          placeholder="#my-project"
          className="h-10 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
        />
      </div>

      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || !name.trim()}
        className="mt-2 flex h-10 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {submitting ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  )
}
