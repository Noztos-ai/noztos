// Runner — state machine do Builder Workflow.
//
// Phase 0: Bridge IN + repo snapshot + Planner
// Phase 1..N: pra cada block, Architect → Builder → Reviewer (com reject loop max 2)
// Phase final: posta resposta final do último Reviewer como ChatMessage no chat
//
// Persiste estado em WorkflowRun.progress a cada step pro UI poller
// renderizar progresso vivo.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { prisma } from '@/lib/db'
import { buildBridgeInContext } from '../shared/bridge-in'
import { cleanupHandoff, readArchitectPlan, readBuilderReport, readRejectionList } from '../shared/artifacts'
import { runPlannerStep, buildRepoSnapshot } from './planner'
import { runArchitectStep } from './architect'
import { runBuilderStep } from './builder'
import { runReviewerStep, type ReviewerDecision } from './reviewer'
import type {
  BlockState,
  RunSnapshot,
  StepState,
  WorkflowMode,
  WorkflowType,
} from '../shared/types'

const MAX_REJECTS_PER_BLOCK = 2

export interface StartWorkflowInput {
  sessionId: string
  userId: string
  projectId: string
  workflowType: WorkflowType
  userMessage: string
  mode: WorkflowMode
  projectPath: string
}

export interface StartWorkflowResult {
  runId: string
}

export async function startBuilderWorkflow(input: StartWorkflowInput): Promise<StartWorkflowResult> {
  // Validate projectPath exists
  try {
    const stat = await fs.stat(input.projectPath)
    if (!stat.isDirectory()) throw new Error(`projectPath is not a directory: ${input.projectPath}`)
  } catch (err) {
    throw new Error(`projectPath does not exist or unreachable: ${input.projectPath} — ${(err as Error).message}`)
  }

  const initialSnapshot: RunSnapshot = {
    workflowType: input.workflowType,
    userMessage: input.userMessage,
    mode: input.mode,
    projectPath: input.projectPath,
    blocks: [],
    currentStep: null,
  }

  const run = await prisma.workflowRun.create({
    data: {
      sessionId: input.sessionId,
      projectId: input.projectId,
      userId: input.userId,
      workflowType: input.workflowType,
      userMessage: input.userMessage,
      status: 'pending',
      progress: initialSnapshot as unknown as object,
    },
    select: { id: true },
  })

  console.log(`[wf-runner] start run=${run.id.slice(0, 8)} session=${input.sessionId.slice(0, 8)} workflow=${input.workflowType} mode=${input.mode}`)

  // Fire-and-forget. Erros caem no catch e marcam status='failed'.
  void executeRun(run.id, input).catch(async (err) => {
    console.error(`[wf-runner] run ${run.id} crashed:`, err)
    await prisma.workflowRun.updateMany({
      where: { id: run.id, status: { not: 'cancelled' } },
      data: {
        status: 'failed',
        errorReason: (err as Error).message,
        completedAt: new Date(),
      },
    }).catch(() => {})
  })

  return { runId: run.id }
}

// ── Cancel checkpoint helper ───────────────────────────────────────

async function isCancelled(runId: string): Promise<boolean> {
  const row = await prisma.workflowRun.findUnique({
    where: { id: runId },
    select: { status: true },
  })
  return row?.status === 'cancelled'
}

// ── Persist progress ───────────────────────────────────────────────

async function persistProgress(runId: string, snapshot: RunSnapshot): Promise<void> {
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { progress: snapshot as unknown as object },
  })
}

async function markStatus(runId: string, status: string): Promise<void> {
  await prisma.workflowRun.updateMany({
    where: { id: runId, status: { not: 'cancelled' } },
    data: { status },
  })
}

// ── Main executor ──────────────────────────────────────────────────

async function executeRun(runId: string, input: StartWorkflowInput): Promise<void> {
  await markStatus(runId, 'running')

  const snapshot: RunSnapshot = {
    workflowType: input.workflowType,
    userMessage: input.userMessage,
    mode: input.mode,
    projectPath: input.projectPath,
    blocks: [],
    currentStep: null,
  }

  // ── Phase 0: Bridge IN + repo snapshot + Planner ─────────────────

  snapshot.currentStep = {
    role: 'planner',
    blockIndex: -1,
    attempt: 1,
    startedAt: Date.now(),
  }
  await persistProgress(runId, snapshot)

  const chatContextXml = await buildBridgeInContext(input.sessionId, input.userId)
  console.log(`[wf-runner] run=${runId.slice(0, 8)} bridge_in chatBytes=${chatContextXml.length} hasContext=${chatContextXml.length > 0}`)

  const repoSnapshot = await buildRepoSnapshot(input.projectPath)
  console.log(`[wf-runner] run=${runId.slice(0, 8)} repo_snapshot bytes=${repoSnapshot.length} cwd=${input.projectPath}`)

  if (await isCancelled(runId)) {
    console.log(`[wf-runner] run=${runId.slice(0, 8)} cancelled before planner`)
    return
  }
  console.log(`[wf-runner] run=${runId.slice(0, 8)} ▶ planner starting userMsgBytes=${input.userMessage.length}`)

  const plannerResult = await runPlannerStep({
    userMessage: input.userMessage,
    chatContextXml,
    repoSnapshot,
    mode: input.mode,
    projectPath: input.projectPath,
  })

  if (!plannerResult.plan) {
    snapshot.currentStep = null
    await persistProgress(runId, snapshot)
    await prisma.workflowRun.updateMany({
      where: { id: runId, status: { not: 'cancelled' } },
      data: {
        status: 'failed',
        errorReason: `Planner failed: ${plannerResult.parseError ?? plannerResult.rawResult.error ?? 'unknown'}`,
        completedAt: new Date(),
      },
    })
    return
  }

  snapshot.plan = plannerResult.plan
  snapshot.blocks = plannerResult.plan.blocks.map((b, i) => ({
    index: i,
    name: b.name,
    objective: b.objective,
    estimatedFiles: b.estimatedFiles,
    status: 'pending' as const,
    steps: [],
    rejectCount: 0,
  }))
  snapshot.currentStep = null
  await prisma.workflowRun.update({
    where: { id: runId },
    data: { plan: plannerResult.plan as unknown as object, progress: snapshot as unknown as object },
  })

  const totalObjBytes = plannerResult.plan.blocks.reduce((acc, b) => acc + b.objective.length, 0)
  const blockNames = plannerResult.plan.blocks.map((b) => `"${b.name}"`).join(', ')
  console.log(`[wf-runner] run=${runId.slice(0, 8)} ✓ planner done blocks=${plannerResult.plan.blocks.length} totalObjBytes=${totalObjBytes} names=[${blockNames}]`)

  // ── Phase 1..N: blocks ────────────────────────────────────────────

  for (let i = 0; i < snapshot.blocks.length; i++) {
    if (await isCancelled(runId)) {
      console.log(`[wf-runner] run=${runId.slice(0, 8)} cancelled before block=${i + 1}`)
      return
    }

    const block = snapshot.blocks[i]
    const isFinalBlock = i === snapshot.blocks.length - 1
    block.status = 'running'
    block.startedAt = Date.now()
    snapshot.currentBlockIndex = i
    await persistProgress(runId, snapshot)

    console.log(`[wf-runner] run=${runId.slice(0, 8)} block=${i + 1}/${snapshot.blocks.length} START name="${block.name}"`)

    const ok = await runBlock(runId, snapshot, i, isFinalBlock, plannerResult.plan, input)
    if (!ok) {
      block.status = 'failed'
      block.finishedAt = Date.now()
      await persistProgress(runId, snapshot)
      await prisma.workflowRun.updateMany({
        where: { id: runId, status: { not: 'cancelled' } },
        data: {
          status: 'failed',
          errorReason: `Block ${i + 1} failed`,
          completedAt: new Date(),
        },
      })
      return
    }

    block.status = 'completed'
    block.finishedAt = Date.now()
    await persistProgress(runId, snapshot)
    console.log(`[wf-runner] run=${runId.slice(0, 8)} block=${i + 1} DONE`)
  }

  // ── Phase final: post final response as chat message ─────────────

  if (snapshot.finalResponse) {
    await postFinalResponseToChat(input.sessionId, snapshot.finalResponse)
  }

  // Cleanup handoff folder (artifacts foram preservados na DB via snapshot)
  try {
    await cleanupHandoff(input.projectPath)
  } catch (err) {
    console.warn(`[wf-runner] cleanup failed: ${(err as Error).message}`)
  }

  await prisma.workflowRun.updateMany({
    where: { id: runId, status: { not: 'cancelled' } },
    data: {
      status: 'completed',
      finalResponse: snapshot.finalResponse,
      progress: snapshot as unknown as object,
      completedAt: new Date(),
    },
  })

  console.log(`[wf-runner] run=${runId.slice(0, 8)} COMPLETED blocks=${snapshot.blocks.length}`)
}

// ── Single block execution (with reject loop) ─────────────────────

async function runBlock(
  runId: string,
  snapshot: RunSnapshot,
  blockIndex: number,
  isFinalBlock: boolean,
  plan: NonNullable<RunSnapshot['plan']>,
  input: StartWorkflowInput,
): Promise<boolean> {
  const block = snapshot.blocks[blockIndex]
  const totalBlocks = snapshot.blocks.length

  let attempt = 1
  let architectIsRetry = false
  let previousArchitectPlan: string | undefined
  let previousRejectionList: string | undefined
  const allRejections: Array<{ attempt: number; content: string }> = []

  while (true) {
    if (await isCancelled(runId)) return false

    // ── Architect ───────────────────────────────────────────────────
    const archStep: StepState = {
      role: 'architect',
      attempt,
      status: 'running',
      startedAt: Date.now(),
    }
    block.steps.push(archStep)
    snapshot.currentStep = { role: 'architect', blockIndex, attempt, startedAt: archStep.startedAt! }
    await persistProgress(runId, snapshot)
    console.log(`[wf-runner] run=${runId.slice(0, 8)} block=${blockIndex + 1} ▶ architect attempt=${attempt}${attempt > 1 ? ' (retry)' : ''}`)

    const archResult = await runArchitectStep({
      userMessage: input.userMessage,
      plan,
      block: { name: block.name, objective: block.objective, estimatedFiles: block.estimatedFiles },
      blockIndex,
      totalBlocks,
      projectPath: input.projectPath,
      isRetry: architectIsRetry,
      previousPlan: previousArchitectPlan,
      rejectionList: previousRejectionList,
    })

    archStep.finishedAt = Date.now()
    archStep.durationMs = archStep.finishedAt - archStep.startedAt!
    if (archResult.rawResult.error || !archResult.outputPath) {
      archStep.status = 'failed'
      archStep.errorReason = archResult.rawResult.error ?? 'architect produced no output'
      await persistProgress(runId, snapshot)
      console.error(`[wf-runner] block=${blockIndex + 1} architect failed: ${archStep.errorReason}`)
      return false
    }
    archStep.status = 'completed'
    archStep.outputPath = archResult.outputPath
    archStep.output = archResult.rawResult.output
    await persistProgress(runId, snapshot)
    console.log(`[wf-runner] run=${runId.slice(0, 8)} block=${blockIndex + 1} ✓ architect done elapsed=${archStep.durationMs}ms planBytes=${archResult.rawResult.output.length} toolCalls=${archResult.rawResult.toolCalls.length} artifact=${archResult.outputPath?.split('/').slice(-2).join('/') ?? '?'}`)

    const architectPlan = archResult.rawResult.output

    // ── Builder ────────────────────────────────────────────────────
    if (await isCancelled(runId)) return false
    const buildStep: StepState = {
      role: 'builder',
      attempt,
      status: 'running',
      startedAt: Date.now(),
    }
    block.steps.push(buildStep)
    snapshot.currentStep = { role: 'builder', blockIndex, attempt, startedAt: buildStep.startedAt! }
    await persistProgress(runId, snapshot)
    console.log(`[wf-runner] run=${runId.slice(0, 8)} block=${blockIndex + 1} ▶ builder attempt=${attempt}${attempt > 1 ? ' (retry)' : ''} architectPlanBytes=${architectPlan.length}`)

    const buildResult = await runBuilderStep({
      userMessage: input.userMessage,
      block: { name: block.name, objective: block.objective, estimatedFiles: block.estimatedFiles },
      blockIndex,
      totalBlocks,
      projectPath: input.projectPath,
      architectPlan,
      mode: input.mode,
      isRetry: attempt > 1,
    })

    buildStep.finishedAt = Date.now()
    buildStep.durationMs = buildStep.finishedAt - buildStep.startedAt!
    if (buildResult.rawResult.error || !buildResult.outputPath) {
      buildStep.status = 'failed'
      buildStep.errorReason = buildResult.rawResult.error ?? 'builder produced no output'
      await persistProgress(runId, snapshot)
      console.error(`[wf-runner] block=${blockIndex + 1} builder failed: ${buildStep.errorReason}`)
      return false
    }
    buildStep.status = 'completed'
    buildStep.outputPath = buildResult.outputPath
    buildStep.output = buildResult.rawResult.output
    await persistProgress(runId, snapshot)
    const editTools = buildResult.rawResult.toolCalls.filter((t) => ['Edit', 'Write', 'NotebookEdit', 'MultiEdit'].includes(t.name)).length
    const bashCalls = buildResult.rawResult.toolCalls.filter((t) => t.name === 'Bash').length
    console.log(`[wf-runner] run=${runId.slice(0, 8)} block=${blockIndex + 1} ✓ builder done elapsed=${buildStep.durationMs}ms reportBytes=${buildResult.rawResult.output.length} edits=${editTools} bashRuns=${bashCalls} totalTools=${buildResult.rawResult.toolCalls.length} artifact=${buildResult.outputPath?.split('/').slice(-2).join('/') ?? '?'}`)

    const builderReport = buildResult.rawResult.output

    // ── Reviewer ───────────────────────────────────────────────────
    if (await isCancelled(runId)) return false
    const revStep: StepState = {
      role: 'reviewer',
      attempt,
      status: 'running',
      startedAt: Date.now(),
    }
    block.steps.push(revStep)
    snapshot.currentStep = { role: 'reviewer', blockIndex, attempt, startedAt: revStep.startedAt! }
    await persistProgress(runId, snapshot)
    console.log(`[wf-runner] run=${runId.slice(0, 8)} block=${blockIndex + 1} ▶ reviewer attempt=${attempt}${isFinalBlock ? ' (FINAL BLOCK)' : ''} builderReportBytes=${builderReport.length}`)

    const revResult = await runReviewerStep({
      userMessage: input.userMessage,
      block: { name: block.name, objective: block.objective, estimatedFiles: block.estimatedFiles },
      blockIndex,
      totalBlocks,
      projectPath: input.projectPath,
      architectPlan,
      builderReport,
      attempt,
      isFinalBlock,
      previousRejections: allRejections,
    })

    revStep.finishedAt = Date.now()
    revStep.durationMs = revStep.finishedAt - revStep.startedAt!
    if (revResult.rawResult.error || !revResult.decision) {
      revStep.status = 'failed'
      revStep.errorReason = revResult.rawResult.error ?? revResult.parseError ?? 'reviewer parse failed'
      await persistProgress(runId, snapshot)
      console.error(`[wf-runner] block=${blockIndex + 1} reviewer failed: ${revStep.errorReason}`)
      return false
    }
    revStep.status = 'completed'
    revStep.outputPath = revResult.outputPath
    revStep.output = revResult.rawResult.output
    revStep.decision = revResult.decision as ReviewerDecision
    await persistProgress(runId, snapshot)
    const decisionEmoji = revResult.decision === 'APPROVED' ? '✓' : revResult.decision === 'FORCED_APPROVAL' ? '⚠' : '✗'
    console.log(`[wf-runner] run=${runId.slice(0, 8)} block=${blockIndex + 1} ${decisionEmoji} reviewer done elapsed=${revStep.durationMs}ms decision=${revResult.decision} payloadBytes=${revResult.payload.length} artifact=${revResult.outputPath?.split('/').slice(-2).join('/') ?? '?'}`)

    // ── Decisão ────────────────────────────────────────────────────
    if (revResult.decision === 'APPROVED' || revResult.decision === 'FORCED_APPROVAL') {
      block.summaryPath = revResult.outputPath
      block.summary = revResult.payload
      // Final block → store final response in snapshot for chat post
      if (isFinalBlock) {
        snapshot.finalResponse = revResult.payload
      }
      snapshot.currentStep = null
      await persistProgress(runId, snapshot)
      return true
    }

    // REJECT → bump rejectCount, prepare retry
    block.rejectCount = (block.rejectCount ?? 0) + 1
    allRejections.push({ attempt, content: revResult.payload })
    previousRejectionList = revResult.payload
    previousArchitectPlan = architectPlan

    if (block.rejectCount > MAX_REJECTS_PER_BLOCK) {
      // Should not happen — Reviewer should auto-FORCED_APPROVAL on attempt 3+
      console.warn(`[wf-runner] block=${blockIndex + 1} reject cap exceeded (Reviewer didn't force) — failing block`)
      return false
    }

    architectIsRetry = true
    attempt++
    console.log(`[wf-runner] block=${blockIndex + 1} REJECT #${block.rejectCount} → architect retry attempt=${attempt}`)
  }
}

// ── Post final response to chat as assistant message ──────────────

async function postFinalResponseToChat(sessionId: string, content: string): Promise<void> {
  try {
    console.log(`[wf-runner] ▶ posting final response to chat session=${sessionId.slice(0, 8)} contentBytes=${content.length}`)
    // Pega projectId/userId do session (precisa pra ChatMessage)
    const session = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      select: { projectId: true, userId: true, worktreeId: true },
    })
    if (!session) {
      console.warn(`[wf-runner] session ${sessionId} not found, skipping chat post`)
      return
    }
    await prisma.chatMessage.create({
      data: {
        sessionId,
        projectId: session.projectId,
        userId: session.userId,
        worktreeId: session.worktreeId,
        role: 'assistant',
        content,
      },
    })
    console.log(`[wf-runner] ✓ final response posted to chat session=${sessionId.slice(0, 8)}`)
  } catch (err) {
    console.warn(`[wf-runner] failed to post final response: ${(err as Error).message}`)
  }
}
