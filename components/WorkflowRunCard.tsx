'use client'

import { useEffect, useState } from 'react'
import { useWorkflowRunPoller, type WorkflowRunSnapshot } from '@/lib/hooks/useWorkflowRunPoller'
import { companionStore } from '@/lib/companion-store'

// Card vivo no chat com progresso do Builder Workflow.
//
// Polling via useWorkflowRunPoller (1s). Renderiza Planner → blocks →
// agents step-by-step. Não mostra cost/tokens (user paga via OAuth).

interface RunSnapshotProgress {
  blocks?: Array<{
    index: number
    name: string
    objective: string
    status: 'pending' | 'running' | 'completed' | 'failed'
    rejectCount?: number
    steps?: Array<{
      role: 'planner' | 'architect' | 'builder' | 'reviewer'
      attempt: number
      status: 'pending' | 'running' | 'completed' | 'failed'
      durationMs?: number
      output?: string
      decision?: 'APPROVED' | 'REJECT' | 'FORCED_APPROVAL'
      errorReason?: string
    }>
  }>
  currentBlockIndex?: number
  currentStep?: {
    role: string
    blockIndex: number
    attempt: number
    startedAt: number
  } | null
}

export function WorkflowRunCard({ sessionId, runId }: { sessionId: string; runId: string }) {
  const snapshot = useWorkflowRunPoller(sessionId, runId)

  if (!snapshot) {
    return (
      <div className="my-3 rounded-md border border-white/10 bg-white/[0.02] px-3 py-2 text-[11px] text-zinc-500">
        Builder Team — starting…
      </div>
    )
  }

  return (
    <div className="my-3 rounded-md border border-white/10 bg-white/[0.02]">
      <Header snapshot={snapshot} />
      <Body snapshot={snapshot} />
      {snapshot.errorReason && (
        <div className="border-t border-white/10 px-3 py-1.5 text-[10px] text-rose-400">
          {snapshot.errorReason}
        </div>
      )}
    </div>
  )
}

function Header({ snapshot }: { snapshot: WorkflowRunSnapshot }) {
  const status = snapshot.status
  const elapsed = ((snapshot.completedAt ? new Date(snapshot.completedAt).getTime() : Date.now()) - new Date(snapshot.createdAt).getTime()) / 1000

  return (
    <div className="flex items-center gap-2 border-b border-white/10 px-3 py-1.5 text-[11px]">
      <StatusDot status={status} />
      <span className="font-medium text-zinc-300">🛠️ Builder Team</span>
      <span className="text-zinc-500">{status === 'running' ? 'running' : status}</span>
      <span className="ml-auto text-zinc-500">{elapsed.toFixed(0)}s</span>
    </div>
  )
}

function StatusDot({ status }: { status: string }) {
  const cls = status === 'running' || status === 'pending'
    ? 'bg-amber-400 animate-pulse'
    : status === 'completed'
    ? 'bg-emerald-400'
    : status === 'failed' || status === 'cancelled'
    ? 'bg-rose-400'
    : 'bg-zinc-500'
  return <span className={`inline-block h-1.5 w-1.5 rounded-full ${cls}`} />
}

function Body({ snapshot }: { snapshot: WorkflowRunSnapshot }) {
  const progress = (snapshot.progress ?? {}) as RunSnapshotProgress
  const blocks = progress.blocks ?? []

  if (blocks.length === 0) {
    return (
      <div className="px-3 py-2 text-[11px] italic text-zinc-500">
        {progress.currentStep?.role === 'planner'
          ? <ThinkingLine label="Planner" startedAt={progress.currentStep.startedAt} />
          : 'Planner — decomposing…'}
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      {blocks.map((b) => (
        <BlockRow key={b.index} block={b} totalBlocks={blocks.length} liveStep={progress.currentStep ?? null} />
      ))}
    </div>
  )
}

function BlockRow({
  block,
  totalBlocks,
  liveStep,
}: {
  block: NonNullable<RunSnapshotProgress['blocks']>[number]
  totalBlocks: number
  liveStep: RunSnapshotProgress['currentStep']
}) {
  const isActive = block.status === 'running'
  const [expanded, setExpanded] = useState(isActive || block.status === 'failed')

  useEffect(() => {
    if (block.status === 'running') setExpanded(true)
  }, [block.status])

  const marker = block.status === 'completed' ? '✓'
    : block.status === 'failed' ? '✗'
    : isActive ? '▶'
    : '◌'
  const markerCls = block.status === 'completed' ? 'text-emerald-400'
    : block.status === 'failed' ? 'text-rose-400'
    : isActive ? 'text-amber-400'
    : 'text-zinc-600'

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[11px] transition-colors hover:bg-white/[0.02]"
      >
        <span className={`shrink-0 font-mono ${markerCls}`}>{marker}</span>
        <span className="text-[10px] text-zinc-500">{block.index + 1}/{totalBlocks}</span>
        <span className="truncate text-zinc-300">{block.name}</span>
        {(block.rejectCount ?? 0) > 0 && (
          <span className="ml-auto shrink-0 rounded border border-amber-500/30 bg-amber-500/10 px-1 text-[9px] text-amber-400">
            {block.rejectCount} reject{block.rejectCount === 1 ? '' : 's'}
          </span>
        )}
      </button>

      {expanded && (
        <div className="border-t border-white/5 bg-black/10 px-3 py-2">
          <div className="mb-2 text-[10px] text-zinc-500">
            <span className="text-zinc-600">Objective: </span>{block.objective}
          </div>

          {(block.steps ?? []).map((step, i) => (
            <StepRow key={i} step={step} />
          ))}

          {liveStep && liveStep.blockIndex === block.index && (
            <ThinkingLine label={liveStep.role} startedAt={liveStep.startedAt} attempt={liveStep.attempt} />
          )}
        </div>
      )}
    </div>
  )
}

function StepRow({ step }: { step: NonNullable<NonNullable<RunSnapshotProgress['blocks']>[number]['steps']>[number] }) {
  const icon = step.status === 'completed' && step.decision === 'REJECT' ? '✗'
    : step.status === 'completed' && step.decision === 'FORCED_APPROVAL' ? '⚠'
    : step.status === 'completed' ? '✓'
    : step.status === 'failed' ? '✗'
    : step.status === 'running' ? '▶'
    : '◌'
  const cls = step.status === 'completed' && step.decision === 'REJECT' ? 'text-rose-400'
    : step.status === 'completed' && step.decision === 'FORCED_APPROVAL' ? 'text-amber-400'
    : step.status === 'completed' ? 'text-emerald-400'
    : step.status === 'failed' ? 'text-rose-400'
    : step.status === 'running' ? 'text-amber-400 animate-pulse'
    : 'text-zinc-600'
  return (
    <div className="flex items-center gap-1.5 py-0.5 text-[11px]">
      <span className={`font-mono ${cls}`}>{icon}</span>
      <span className="font-medium text-zinc-200">{capitalize(step.role)}</span>
      {step.attempt > 1 && <span className="text-[9px] text-amber-400/80">retry {step.attempt}</span>}
      {step.durationMs !== undefined && (
        <span className="ml-auto text-[10px] text-zinc-500">{(step.durationMs / 1000).toFixed(1)}s</span>
      )}
    </div>
  )
}

function ThinkingLine({ label, startedAt, attempt }: { label: string; startedAt: number; attempt?: number }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const elapsed = Math.max(0, now - startedAt)
  const sec = elapsed >= 60_000
    ? `${Math.floor(elapsed / 60_000)}m${Math.floor((elapsed % 60_000) / 1000)}s`
    : `${Math.floor(elapsed / 1000)}s`
  return (
    <div className="mt-1 flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px] text-amber-400">
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-400" />
      <span className="font-medium">{capitalize(label)}</span>
      {attempt !== undefined && attempt > 1 && <span>retry {attempt}</span>}
      <span className="text-amber-500/80">thinking… {sec}</span>
    </div>
  )
}

function capitalize(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1)
}
