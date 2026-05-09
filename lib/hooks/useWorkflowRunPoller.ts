'use client'

import { useEffect, useRef, useState } from 'react'
import { companionStore } from '@/lib/companion-store'

// Poll /api/workflow/[runId] every 1s while running. Detach when terminal.
//
// Returns the latest run snapshot pra UI renderizar. Não inflige
// re-render no companion-store inteiro — esse hook é local ao card.

export interface WorkflowRunSnapshot {
  id: string
  sessionId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  workflowType: string
  userMessage: string
  plan: unknown
  progress: unknown
  finalResponse: string | null
  errorReason: string | null
  createdAt: string
  completedAt: string | null
}

const POLL_INTERVAL_MS = 1_000
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

export function useWorkflowRunPoller(sessionId: string | null, runId: string | null): WorkflowRunSnapshot | null {
  const [snapshot, setSnapshot] = useState<WorkflowRunSnapshot | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!sessionId || !runId) {
      setSnapshot(null)
      return
    }
    cancelledRef.current = false
    let timer: ReturnType<typeof setTimeout> | null = null

    async function tick() {
      if (cancelledRef.current) return
      try {
        const res = await fetch(`/api/workflow/${runId}`)
        if (!res.ok) {
          console.warn(`[wf-poll] runId=${runId!.slice(0, 8)} fetch status=${res.status}`)
        } else {
          const data = await res.json() as WorkflowRunSnapshot
          if (cancelledRef.current) return
          setSnapshot(data)

          if (TERMINAL.has(data.status)) {
            console.log(`[wf-poll] runId=${runId!.slice(0, 8)} terminal status=${data.status} → detach`)
            companionStore.detachWorkflowRun(sessionId!)
            return  // stop polling
          }
        }
      } catch (err) {
        console.warn(`[wf-poll] runId=${runId!.slice(0, 8)} tick error:`, err)
      }
      if (!cancelledRef.current) timer = setTimeout(tick, POLL_INTERVAL_MS)
    }

    void tick()
    return () => {
      cancelledRef.current = true
      if (timer) clearTimeout(timer)
    }
  }, [sessionId, runId])

  return snapshot
}
