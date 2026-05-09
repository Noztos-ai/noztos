// Shared types for team workflows.
//
// Tudo aqui é runtime-agnostic — runs server-side dentro do orquestrador
// e do client-side leem o snapshot via API. Os tipos de "agent step",
// "block state", etc são compartilhados entre as duas pontas.

export type WorkflowMode = 'ask' | 'agent'

export type WorkflowStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

export type WorkflowType = 'builder'  // V1; futuro: 'review' | 'test' | etc

// ── Planner output ──────────────────────────────────────────────────

export interface PlannerBlock {
  name: string                  // título curto
  objective: string             // RICO — descrição detalhada do que fazer
  estimatedFiles?: string[]     // arquivos prováveis (heurística)
}

export interface PlannerOutput {
  rationale?: string
  blocks: PlannerBlock[]
}

// ── Step state (live) ───────────────────────────────────────────────

export type StepRole = 'planner' | 'architect' | 'builder' | 'reviewer'

export type StepStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface StepState {
  role: StepRole
  attempt: number               // 1 = first try, 2+ = after reject
  status: StepStatus
  startedAt?: number
  finishedAt?: number
  durationMs?: number
  // Output paths (artifacts persisted in <worktree>/.team-handoff/...)
  // ou conteúdo inline pra steps menores (planner, reviewer XML decision).
  outputPath?: string           // ex: '.team-handoff/block-01/architect-plan.md'
  output?: string               // texto raw do agent (capturado pelo orquestrador)
  // Reviewer-specific: parsed decision
  decision?: 'APPROVED' | 'REJECT' | 'FORCED_APPROVAL'
  errorReason?: string
}

// ── Block state (live) ──────────────────────────────────────────────

export interface BlockState {
  index: number                 // 0-based
  name: string                  // copiado do PlannerBlock
  objective: string
  estimatedFiles?: string[]
  status: StepStatus
  startedAt?: number
  finishedAt?: number
  // Steps em ordem cronológica. Pode ter várias entradas pro mesmo
  // role quando há reject (Architect attempt 1, attempt 2, etc).
  steps: StepState[]
  // Quantos REJECTs o Reviewer deu nesse block (max 2 antes do forced).
  rejectCount: number
  // Path do summary.md (intermediário) ou final-response.md (último block).
  summaryPath?: string
  // Conteúdo raw da summary/final-response (cache pra UI ler sem fs).
  summary?: string
}

// ── Run snapshot ─────────────────────────────────────────────────────

export interface RunSnapshot {
  workflowType: WorkflowType
  userMessage: string
  mode: WorkflowMode
  // Caminho da worktree onde os agents operam (vem da ChatSession)
  projectPath: string
  plan?: PlannerOutput
  blocks: BlockState[]
  currentBlockIndex?: number    // -1 / undefined = phase 0 / pre-blocks
  // Live step indicator pra UI mostrar "▶ Architect thinking..."
  currentStep?: {
    role: StepRole
    blockIndex: number
    attempt: number
    startedAt: number
  } | null
  finalResponse?: string
}

// ── Agent step input/output (single CLI call) ──────────────────────

export interface AgentStepInput {
  role: StepRole
  systemPrompt: string          // composed: skill + context (block, plan, summaries, etc)
  userText: string              // o `claude -p <text>`
  cwd: string                   // worktree path
  model?: string                // 'sonnet' | 'haiku' | 'opus' | undefined
  allowedTools?: string[]
  disallowedTools?: string[]
  permissionMode?: 'bypassPermissions' | 'plan' | 'default'
  timeoutMs?: number
}

export interface AgentStepResult {
  output: string                // texto final do assistant
  toolCalls: Array<{
    name: string
    input: Record<string, unknown>
    result?: string
    error?: boolean
  }>
  durationMs: number
  costUsd?: number
  error?: string
}
