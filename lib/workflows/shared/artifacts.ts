// Helpers pra ler/escrever artifacts em <worktree>/.team-handoff/.
//
// Comunicação entre agents é via arquivo (audit trail) + injeção via
// prompt (canal real). Estas funções lidam com a parte de arquivo —
// orquestrador captura output do agent, materializa aqui, depois
// injeta o conteúdo no prompt do próximo agent.
//
// Cleanup automático: orquestrador chama cleanupHandoff() ao final do
// workflow.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'

const HANDOFF_DIR = '.team-handoff'

function blockDir(projectPath: string, blockIndex: number): string {
  // 0-indexed → 1-indexed pra display (block-01, block-02, ...)
  const display = String(blockIndex + 1).padStart(2, '0')
  return join(projectPath, HANDOFF_DIR, `block-${display}`)
}

export async function ensureHandoffDir(projectPath: string): Promise<void> {
  await fs.mkdir(join(projectPath, HANDOFF_DIR), { recursive: true })
}

export async function ensureBlockDir(projectPath: string, blockIndex: number): Promise<string> {
  const dir = blockDir(projectPath, blockIndex)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

// ── Plan (Planner output, top-level) ────────────────────────────────

export async function writePlan(projectPath: string, planMarkdown: string): Promise<string> {
  await ensureHandoffDir(projectPath)
  const path = join(projectPath, HANDOFF_DIR, 'plan.md')
  await fs.writeFile(path, planMarkdown, 'utf-8')
  return path
}

// ── Planner raw output (debug, parse-fail forensics) ────────────────
//
// Written when the planner returns text we can't parse as JSON. Lets
// us inspect what the model actually said instead of guessing — we
// can't reproduce the exact prompt + temperature on a separate spawn.
// Survives the regular cleanupHandoff() so it's still there to read
// after the run is marked failed.
export async function writePlannerRawOutput(projectPath: string, raw: string): Promise<string> {
  await ensureHandoffDir(projectPath)
  const path = join(projectPath, HANDOFF_DIR, 'planner-raw-output.md')
  await fs.writeFile(path, raw, 'utf-8')
  return path
}

// ── Architect plan (per block) ──────────────────────────────────────

export async function writeArchitectPlan(projectPath: string, blockIndex: number, content: string): Promise<string> {
  const dir = await ensureBlockDir(projectPath, blockIndex)
  const path = join(dir, 'architect-plan.md')
  await fs.writeFile(path, content, 'utf-8')
  return path
}

export async function readArchitectPlan(projectPath: string, blockIndex: number): Promise<string | null> {
  try {
    const path = join(blockDir(projectPath, blockIndex), 'architect-plan.md')
    return await fs.readFile(path, 'utf-8')
  } catch { return null }
}

// ── Builder report (per block) ──────────────────────────────────────

export async function writeBuilderReport(projectPath: string, blockIndex: number, content: string): Promise<string> {
  const dir = await ensureBlockDir(projectPath, blockIndex)
  const path = join(dir, 'builder-report.md')
  await fs.writeFile(path, content, 'utf-8')
  return path
}

export async function readBuilderReport(projectPath: string, blockIndex: number): Promise<string | null> {
  try {
    const path = join(blockDir(projectPath, blockIndex), 'builder-report.md')
    return await fs.readFile(path, 'utf-8')
  } catch { return null }
}

// ── Rejection list (per block, may have multiple) ──────────────────

export async function writeRejectionList(projectPath: string, blockIndex: number, attempt: number, content: string): Promise<string> {
  const dir = await ensureBlockDir(projectPath, blockIndex)
  const path = join(dir, `rejection-list-${attempt}.md`)
  await fs.writeFile(path, content, 'utf-8')
  return path
}

export async function readRejectionList(projectPath: string, blockIndex: number, attempt: number): Promise<string | null> {
  try {
    const path = join(blockDir(projectPath, blockIndex), `rejection-list-${attempt}.md`)
    return await fs.readFile(path, 'utf-8')
  } catch { return null }
}

// ── Summary (intermediate blocks) ──────────────────────────────────

export async function writeSummary(projectPath: string, blockIndex: number, content: string): Promise<string> {
  const dir = await ensureBlockDir(projectPath, blockIndex)
  const path = join(dir, 'summary.md')
  await fs.writeFile(path, content, 'utf-8')
  return path
}

export async function readSummary(projectPath: string, blockIndex: number): Promise<string | null> {
  try {
    const path = join(blockDir(projectPath, blockIndex), 'summary.md')
    return await fs.readFile(path, 'utf-8')
  } catch { return null }
}

// ── Final response (last block only) ───────────────────────────────

export async function writeFinalResponse(projectPath: string, blockIndex: number, content: string): Promise<string> {
  const dir = await ensureBlockDir(projectPath, blockIndex)
  const path = join(dir, 'final-response.md')
  await fs.writeFile(path, content, 'utf-8')
  return path
}

// ── Read all summaries from previous blocks (pra Architect cross-block) ──

export async function readPreviousSummaries(projectPath: string, beforeBlockIndex: number): Promise<Array<{ blockIndex: number; content: string }>> {
  const out: Array<{ blockIndex: number; content: string }> = []
  for (let i = 0; i < beforeBlockIndex; i++) {
    const content = await readSummary(projectPath, i)
    if (content) out.push({ blockIndex: i, content })
  }
  return out
}

// ── Cleanup ────────────────────────────────────────────────────────

export async function cleanupHandoff(projectPath: string): Promise<void> {
  try {
    const path = join(projectPath, HANDOFF_DIR)
    await fs.rm(path, { recursive: true, force: true })
  } catch {}
}
