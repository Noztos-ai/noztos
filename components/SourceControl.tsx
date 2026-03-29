'use client'

import { useState, useEffect, useCallback } from 'react'

interface FileEntry { id: string; path: string; isModified: boolean; sizeBytes: number }
interface FileDetail { path: string; content: string; originalContent: string; isModified: boolean }

export function SourceControl({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<FileDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showPush, setShowPush] = useState(false)

  const modifiedFiles = files.filter((f) => f.isModified)

  const fetchFiles = useCallback(() => {
    fetch(`/api/projects/${projectId}/repository/files`)
      .then((r) => r.json())
      .then((data) => { setFiles(data.files ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectId])

  useEffect(() => { fetchFiles() }, [fetchFiles])

  async function handleSelectFile(path: string) {
    const res = await fetch(`/api/projects/${projectId}/repository/files/${encodeURIComponent(path)}`)
    if (res.ok) setSelectedFile(await res.json())
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

  if (loading) return <div className="rounded-xl border border-white/10 bg-white/5 p-6"><p className="text-sm text-zinc-500">Loading files...</p></div>
  if (files.length === 0) return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-sm font-medium text-zinc-200">Source Control</h3>
      <p className="mt-1 text-sm text-zinc-500">No repository connected.</p>
    </div>
  )

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden" style={{ backgroundColor: '#15151c' }}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <svg className="h-4 w-4 text-violet-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
          <h3 className="text-sm font-semibold text-zinc-200">Source Control</h3>
          {modifiedFiles.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              {modifiedFiles.length} changed
            </span>
          )}
        </div>
        {modifiedFiles.length > 0 && (
          <button onClick={() => setShowPush(true)} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-violet-500">
            Push to GitHub
          </button>
        )}
      </div>

      <div className="flex" style={{ minHeight: '300px', maxHeight: '600px' }}>
        {/* File tree */}
        <div className="w-72 shrink-0 overflow-y-auto border-r border-white/10">
          {modifiedFiles.length > 0 && (
            <div className="border-b border-white/10 py-2">
              <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Changes</p>
              {modifiedFiles.map((f) => {
                const fileName = f.path.split('/').pop() ?? f.path
                const dirPath = f.path.includes('/') ? f.path.slice(0, f.path.lastIndexOf('/')) : ''
                return (
                  <div key={f.id} className={`group flex items-center justify-between px-3 py-1.5 transition-colors hover:bg-white/5 ${selectedFile?.path === f.path ? 'bg-white/10' : ''}`}>
                    <button onClick={() => handleSelectFile(f.path)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-amber-300">{fileName}</p>
                        {dirPath && <p className="truncate text-[10px] text-zinc-600">{dirPath}</p>}
                      </div>
                    </button>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button onClick={(e) => { e.stopPropagation(); handleAction(f.path, 'revert') }} title="Revert" className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-red-500/10 hover:text-red-400">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleAction(f.path, 'accept') }} title="Accept" className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-emerald-500/10 hover:text-emerald-400">
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="py-2">
            <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Files ({files.length})</p>
            <div className="max-h-80 overflow-y-auto">
              {files.map((f) => (
                <button key={f.id} onClick={() => handleSelectFile(f.path)} className={`flex w-full items-center gap-2 px-3 py-1 text-left text-xs transition-colors hover:bg-white/5 ${selectedFile?.path === f.path ? 'bg-white/10' : ''}`}>
                  {f.isModified && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
                  <span className={`truncate ${f.isModified ? 'text-amber-300' : 'text-zinc-400'}`}>{f.path}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Diff area */}
        <div className="flex-1 overflow-auto">
          {selectedFile ? (
            <DiffView file={selectedFile} />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-zinc-600">Select a file to view</p>
            </div>
          )}
        </div>
      </div>

      {showPush && (
        <PushModal projectId={projectId} modifiedCount={modifiedFiles.length} onClose={() => setShowPush(false)} onPushed={() => { setShowPush(false); setSelectedFile(null); fetchFiles() }} />
      )}
    </div>
  )
}

function DiffView({ file }: { file: FileDetail }) {
  if (!file.isModified) {
    return <pre className="p-4 text-xs leading-5 text-zinc-400">{file.content}</pre>
  }

  const originalLines = file.originalContent.split('\n')
  const currentLines = file.content.split('\n')
  const maxLines = Math.max(originalLines.length, currentLines.length)
  const diffLines: { type: 'unchanged' | 'added' | 'removed'; lineNum: number; text: string }[] = []

  for (let i = 0; i < maxLines; i++) {
    const orig = originalLines[i]
    const curr = currentLines[i]
    if (orig === undefined) diffLines.push({ type: 'added', lineNum: i + 1, text: curr })
    else if (curr === undefined) diffLines.push({ type: 'removed', lineNum: i + 1, text: orig })
    else if (orig !== curr) {
      diffLines.push({ type: 'removed', lineNum: i + 1, text: orig })
      diffLines.push({ type: 'added', lineNum: i + 1, text: curr })
    } else diffLines.push({ type: 'unchanged', lineNum: i + 1, text: curr })
  }

  return (
    <div className="p-2">
      <div className="mb-2 flex items-center gap-2 px-2">
        <span className="text-xs font-medium text-amber-300">{file.path}</span>
        <span className="text-[10px] text-zinc-600">modified</span>
      </div>
      <pre className="text-xs leading-5 font-mono">
        {diffLines.map((line, i) => (
          <div key={i} className={
            line.type === 'added' ? 'bg-emerald-500/10 text-emerald-300' :
            line.type === 'removed' ? 'bg-red-500/10 text-red-300' :
            'text-zinc-500'
          }>
            <span className={`mr-2 inline-block w-5 text-right ${
              line.type === 'added' ? 'text-emerald-500/60' :
              line.type === 'removed' ? 'text-red-500/60' : 'text-zinc-700'
            }`}>
              {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' '}
            </span>
            {line.text}
          </div>
        ))}
      </pre>
    </div>
  )
}

function PushModal({ projectId, modifiedCount, onClose, onPushed }: { projectId: string; modifiedCount: number; onClose: () => void; onPushed: () => void }) {
  const [pushing, setPushing] = useState(false)
  const [commitMsg, setCommitMsg] = useState('')

  async function handlePush() {
    setPushing(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/repository/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: commitMsg || `Update ${modifiedCount} file(s)` }),
      })
      if (res.ok) onPushed()
    } catch {}
    setPushing(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-white/10 shadow-2xl" style={{ backgroundColor: '#1a1a22' }} onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-white/10 px-6 py-4" style={{ backgroundColor: '#15151c' }}>
          <h3 className="text-sm font-semibold text-zinc-100">Push to GitHub</h3>
          <p className="text-[11px] text-zinc-500">{modifiedCount} file{modifiedCount !== 1 ? 's' : ''} will be committed and pushed.</p>
        </div>
        <div className="p-6 space-y-3">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Commit Message</p>
            <input type="text" value={commitMsg} onChange={(e) => setCommitMsg(e.target.value)} placeholder={`Update ${modifiedCount} file(s)`} className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:border-violet-500/50 focus:outline-none" />
          </div>
          <div className="flex gap-3">
            <button onClick={handlePush} disabled={pushing} className="flex h-9 flex-1 items-center justify-center rounded-lg bg-violet-600 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50">
              {pushing ? 'Pushing...' : 'Push'}
            </button>
            <button onClick={onClose} className="flex h-9 items-center justify-center rounded-lg px-4 text-xs text-zinc-400 hover:text-zinc-200">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
