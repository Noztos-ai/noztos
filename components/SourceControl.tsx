'use client'

import { useState, useEffect, useCallback } from 'react'

interface FileEntry {
  id: string
  path: string
  isModified: boolean
  sizeBytes: number
}

interface FileDetail {
  path: string
  content: string
  originalContent: string
  isModified: boolean
}

interface SourceControlProps {
  projectId: string
}

export function SourceControl({ projectId }: SourceControlProps) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<FileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPush, setShowPush] = useState(false)

  const modifiedFiles = files.filter((f) => f.isModified)

  const fetchFiles = useCallback(() => {
    fetch(`/api/projects/${projectId}/repository/files`)
      .then((r) => r.json())
      .then((data) => {
        setFiles(data.files ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [projectId])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  async function handleSelectFile(path: string) {
    const res = await fetch(`/api/projects/${projectId}/repository/files/${encodeURIComponent(path)}`)
    if (res.ok) {
      const data = await res.json()
      setSelectedFile(data)
    }
  }

  async function handleAction(path: string, action: 'revert' | 'accept') {
    await fetch(`/api/projects/${projectId}/repository/files`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, action }),
    })
    setSelectedFile(null)
    fetchFiles()
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-zinc-300/50 bg-zinc-100 p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <p className="text-sm text-zinc-400">Loading files...</p>
      </div>
    )
  }

  if (files.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-300/50 bg-zinc-100 p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Source Control</h3>
        <p className="mt-1 text-sm text-zinc-400">No repository connected.</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-zinc-300/50 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-300/50 px-4 py-3 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-50">Source Control</h3>
          {modifiedFiles.length > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {modifiedFiles.length} changed
            </span>
          )}
        </div>
        {modifiedFiles.length > 0 && (
          <button
            onClick={() => setShowPush(true)}
            className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Push to GitHub
          </button>
        )}
      </div>

      <div className="flex" style={{ minHeight: '300px', maxHeight: '600px' }}>
        {/* File tree */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-zinc-300/50 dark:border-zinc-700">
          {/* Modified files section */}
          {modifiedFiles.length > 0 && (
            <div className="border-b border-zinc-300/50 py-2 dark:border-zinc-700">
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Changes
              </p>
              {modifiedFiles.map((f) => (
                <FileRow
                  key={f.id}
                  file={f}
                  isSelected={selectedFile?.path === f.path}
                  onSelect={() => handleSelectFile(f.path)}
                  onRevert={() => handleAction(f.path, 'revert')}
                  onAccept={() => handleAction(f.path, 'accept')}
                />
              ))}
            </div>
          )}

          {/* All files */}
          <div className="py-2">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Files ({files.length})
            </p>
            <div className="max-h-80 overflow-y-auto">
              {files.map((f) => (
                <button
                  key={f.id}
                  onClick={() => handleSelectFile(f.path)}
                  className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-800 ${
                    selectedFile?.path === f.path ? 'bg-zinc-200 dark:bg-zinc-800' : ''
                  }`}
                >
                  {f.isModified && (
                    <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                  )}
                  <span className={`truncate ${f.isModified ? 'text-amber-700 dark:text-amber-400' : 'text-zinc-600 dark:text-zinc-400'}`}>
                    {f.path}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Content / Diff area */}
        <div className="flex-1 overflow-auto">
          {selectedFile ? (
            <DiffView file={selectedFile} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-400">Select a file to view</p>
            </div>
          )}
        </div>
      </div>

      {/* Push modal */}
      {showPush && (
        <PushModal
          projectId={projectId}
          modifiedCount={modifiedFiles.length}
          onClose={() => setShowPush(false)}
          onPushed={() => {
            setShowPush(false)
            setSelectedFile(null)
            fetchFiles()
          }}
        />
      )}
    </div>
  )
}

// ── File Row (in changes section) ──────────────────────────────────────────

function FileRow({
  file,
  isSelected,
  onSelect,
  onRevert,
  onAccept,
}: {
  file: FileEntry
  isSelected: boolean
  onSelect: () => void
  onRevert: () => void
  onAccept: () => void
}) {
  // Get just the filename from path
  const fileName = file.path.split('/').pop() ?? file.path
  const dirPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : ''

  return (
    <div
      className={`group flex items-center justify-between px-3 py-1.5 transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-800 ${
        isSelected ? 'bg-zinc-200 dark:bg-zinc-800' : ''
      }`}
    >
      <button onClick={onSelect} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-amber-700 dark:text-amber-400">{fileName}</p>
          {dirPath && (
            <p className="truncate text-[10px] text-zinc-400">{dirPath}</p>
          )}
        </div>
      </button>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onRevert() }}
          title="Revert changes"
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300 hover:text-red-500 dark:hover:bg-zinc-700 dark:hover:text-red-400"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
          </svg>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onAccept() }}
          title="Accept changes"
          className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-300 hover:text-emerald-500 dark:hover:bg-zinc-700 dark:hover:text-emerald-400"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </button>
      </div>
    </div>
  )
}

// ── Diff View ──────────────────────────────────────────────────────────────

function DiffView({ file }: { file: FileDetail }) {
  if (!file.isModified) {
    return (
      <pre className="p-4 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
        {file.content}
      </pre>
    )
  }

  const originalLines = file.originalContent.split('\n')
  const currentLines = file.content.split('\n')

  // Simple line-by-line diff
  const maxLines = Math.max(originalLines.length, currentLines.length)
  const diffLines: { type: 'unchanged' | 'added' | 'removed' | 'modified'; lineNum: number; original?: string; current?: string }[] = []

  for (let i = 0; i < maxLines; i++) {
    const orig = originalLines[i]
    const curr = currentLines[i]

    if (orig === undefined) {
      diffLines.push({ type: 'added', lineNum: i + 1, current: curr })
    } else if (curr === undefined) {
      diffLines.push({ type: 'removed', lineNum: i + 1, original: orig })
    } else if (orig !== curr) {
      diffLines.push({ type: 'removed', lineNum: i + 1, original: orig })
      diffLines.push({ type: 'added', lineNum: i + 1, current: curr })
    } else {
      diffLines.push({ type: 'unchanged', lineNum: i + 1, current: curr })
    }
  }

  return (
    <div className="p-2">
      <div className="mb-2 flex items-center gap-2 px-2">
        <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{file.path}</span>
        <span className="text-[10px] text-zinc-400">modified</span>
      </div>
      <pre className="text-xs leading-5">
        {diffLines.map((line, i) => {
          if (line.type === 'added') {
            return (
              <div key={i} className="bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
                <span className="mr-2 inline-block w-5 text-right text-emerald-400/60">+</span>
                {line.current}
              </div>
            )
          }
          if (line.type === 'removed') {
            return (
              <div key={i} className="bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400">
                <span className="mr-2 inline-block w-5 text-right text-red-400/60">-</span>
                {line.original}
              </div>
            )
          }
          return (
            <div key={i} className="text-zinc-500 dark:text-zinc-500">
              <span className="mr-2 inline-block w-5 text-right text-zinc-400/40">{line.lineNum}</span>
              {line.current}
            </div>
          )
        })}
      </pre>
    </div>
  )
}

// ── Push Modal ─────────────────────────────────────────────────────────────

function PushModal({
  projectId,
  modifiedCount,
  onClose,
  onPushed,
}: {
  projectId: string
  modifiedCount: number
  onClose: () => void
  onPushed: () => void
}) {
  const [message, setMessage] = useState('')
  const [pushing, setPushing] = useState(false)
  const [error, setError] = useState('')

  async function handlePush(e: React.FormEvent) {
    e.preventDefault()
    setPushing(true)
    setError('')

    try {
      const res = await fetch(`/api/projects/${projectId}/repository/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitMessage: message.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Push failed')
        setPushing(false)
        return
      }

      onPushed()
    } catch {
      setError('Something went wrong')
      setPushing(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl dark:bg-zinc-900">
        <h2 className="mb-2 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Push to GitHub
        </h2>
        <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400">
          {modifiedCount} file{modifiedCount !== 1 ? 's' : ''} changed. Write a commit message and push.
        </p>

        <form onSubmit={handlePush} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400">
              {error}
            </div>
          )}

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe your changes..."
            required
            rows={3}
            className="block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder-zinc-500 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
          />

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={pushing || !message.trim()}
              className="flex h-10 flex-1 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              {pushing ? 'Pushing...' : 'Push'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-10 items-center justify-center rounded-full px-5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
