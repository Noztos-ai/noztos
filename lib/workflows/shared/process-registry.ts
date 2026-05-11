// Per-run handle of the spawned `claude -p` child process.
//
// Cancel via DB flag alone takes effect only at the next runner checkpoint
// (between steps/blocks) — meanwhile the in-flight step keeps editing files.
// The registry lets the cancel endpoint deliver SIGTERM directly so "pausa"
// is instantaneous from the user's perspective.
//
// V1 lives in the Next.js server process memory. When the daemon adapter
// lands, this becomes a thin RPC to "kill remote child for run X".
//
// HMR-stable: Next.js dev re-imports module on edit; a plain Map would
// reset and lose track of in-flight runs. Bind to `globalThis` so the
// instance survives reloads.

import type { ChildProcess } from 'node:child_process'

type Registry = Map<string, ChildProcess>
const g = globalThis as unknown as { __workflowProcessRegistry?: Registry }
const registry: Registry = g.__workflowProcessRegistry ?? new Map()
g.__workflowProcessRegistry = registry

export function registerChild(runId: string, child: ChildProcess): void {
  registry.set(runId, child)
}

// Idempotent: only deletes when the stored handle matches. Guards against
// races where a later step's spawn already swapped in a new child.
export function unregisterChild(runId: string, child: ChildProcess): void {
  if (registry.get(runId) === child) registry.delete(runId)
}

// Deliver SIGTERM now; SIGKILL fallback after 2s if the child ignores it.
// Returns true when a live handle was found (caller can log accurately).
export function killRun(runId: string): boolean {
  const child = registry.get(runId)
  if (!child || child.killed) return false
  try {
    child.kill('SIGTERM')
    const fallback = setTimeout(() => {
      const still = registry.get(runId)
      if (still === child && !child.killed) {
        try { child.kill('SIGKILL') } catch { /* swallow */ }
      }
    }, 2000)
    if (typeof fallback.unref === 'function') fallback.unref()
    return true
  } catch {
    return false
  }
}

export function isRunActive(runId: string): boolean {
  const child = registry.get(runId)
  return !!child && !child.killed
}
