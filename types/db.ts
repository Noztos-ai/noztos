// TypeScript interfaces for Prisma JSON fields.
//
// These types correspond to the Json columns in the Prisma schema.
// Use them everywhere you read/write those fields to maintain type safety.

// ─────────────────────────────────────────────────────────────────────────────
// Teams
// ─────────────────────────────────────────────────────────────────────────────

/**
 * teams.collaboratorOrder
 * Ordered list of collaborator IDs for the team pipeline.
 */
export interface CollaboratorOrder {
  collaboratorIds: string[]
}

/**
 * teams.rejectionRules
 * Per-collaborator toggle for who can reject and restart the flow.
 */
export interface RejectionRules {
  /** Map of collaboratorId → whether they can reject */
  canReject: Record<string, boolean>
  /** ID of the collaborator the flow restarts from after a rejection */
  restartFromCollaboratorId: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Tasks
// ─────────────────────────────────────────────────────────────────────────────

/**
 * tasks.context (immutable) and tasks.accumulatedContext (grows over iterations)
 * Free-form JSON blob — original chat context and accumulated team context.
 */
export type TaskContext = Record<string, unknown>

export type RecurrenceType = 'daily' | 'every_n_days' | 'weekday' | 'custom'

/**
 * tasks.recurrenceConfig
 * Configuration for recurring tasks.
 */
export interface RecurrenceConfig {
  type: RecurrenceType
  /** For every_n_days: how many days between runs */
  interval?: number
  /** For weekday: 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
  weekday?: number
  /** "HH:MM" in 24-hour format, e.g. "09:00" */
  time: string
}

// ─────────────────────────────────────────────────────────────────────────────
// Task build logs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * task_build_logs.filesTouched — array of file-level build stats
 */
export interface FileTouched {
  path: string
  linesAdded: number
  linesRemoved: number
}

export type FilesTouched = FileTouched[]
