// ── Compute provider passthrough ────────────────────────────────────
//
// Single-machine local mode: every command runs on the same Mac
// that hosts Next.js (the user's). This module used to switch between
// LocalProvider and an E2B cloud provider; that's gone now.
//
// Kept as a single re-export so existing callers (lib/git.ts,
// lib/worktree.ts, lib/tools.ts, ~8 routes) don't need to change.

import { LocalProvider } from './compute-local'

export const cloudAwareCompute = new LocalProvider()

// Stub kept so any leftover callers in delete-flow code still compile.
// No-op now: there's no remote context to evict.
export function evictContextCache(_worktreeId?: string): void {
  /* no-op */
}

// Stub kept so any leftover callers still compile. Always returns null
// in single-machine local mode — no worktree is ever "in the cloud".
export function extractWorktreeIdFromPath(_path: string): string | null {
  return null
}
