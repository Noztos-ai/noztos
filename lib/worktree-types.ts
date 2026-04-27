// Shared shape for the per-worktree file listing returned by
// /api/projects/[id]/repository/files. Lives here so the cache module
// (`worktree-cache.ts`) and the renderer (`WorkPanel.tsx`) agree on the
// type without one importing from the other.
export interface FileEntry {
  id: string
  path: string
  isModified: boolean
  isNew: boolean
  sizeBytes: number
  // Cross-worktree info — present only when at least one open worktree touched this file
  added?: number
  removed?: number
  worktrees?: { id: string; name: string }[]
}
