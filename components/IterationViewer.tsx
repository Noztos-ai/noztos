'use client'

import { useState, useEffect } from 'react'

interface SkillLog {
  id: string
  collaboratorName: string
  conclusion: string | null
  approved: boolean | null
  rejectionReason: string | null
}

interface Iteration {
  id: string
  iterationNumber: number
  rejectionReason: string | null
  skillLogs: SkillLog[]
}

interface IterationViewerProps {
  projectId: string
  taskId: string
  taskName: string
  onClose: () => void
}

export function IterationViewer({ projectId, taskId, taskName, onClose }: IterationViewerProps) {
  const [iterations, setIterations] = useState<Iteration[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/tasks/${taskId}/iterations`)
      .then((res) => res.json())
      .then(setIterations)
      .finally(() => setLoading(false))
  }, [projectId, taskId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="flex w-full max-w-2xl max-h-[80vh] flex-col rounded-2xl bg-white shadow-xl dark:bg-zinc-900">
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            {taskName} — Iterations
          </h2>
          <button
            onClick={onClose}
            className="text-sm text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Close
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && <p className="text-sm text-zinc-400">Loading...</p>}

          {!loading && iterations.length === 0 && (
            <p className="text-sm text-zinc-400">No iterations yet. Run the task to see results.</p>
          )}

          {iterations.map((iter) => (
            <div key={iter.id} className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  Iteration {iter.iterationNumber}
                </span>
                {iter.rejectionReason && (
                  <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-600 dark:bg-red-900/30 dark:text-red-400">
                    Rejected
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1 ml-4">
                {iter.skillLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {log.collaboratorName}
                      </span>
                      {log.approved === true && (
                        <span className="text-xs text-emerald-500">Approved</span>
                      )}
                      {log.approved === false && (
                        <span className="text-xs text-red-500">Rejected</span>
                      )}
                    </div>
                    {log.conclusion && (
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 whitespace-pre-wrap line-clamp-4">
                        {log.conclusion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
