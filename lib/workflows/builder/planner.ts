// Planner step — Phase 0 do Builder Workflow.
//
// Responsabilidade: chamar claude com a skill do Planner + contexto
// (user task, chat context vindo do Bridge IN, repo snapshot, mode),
// capturar o output JSON, validar e retornar PlannerOutput tipado.
//
// Quando isso retorna, runner.ts pode iniciar os blocks.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { callClaude } from '../shared/claude-cli'
import { writePlan } from '../shared/artifacts'
import type {
  AgentStepResult,
  PlannerOutput,
  WorkflowMode,
} from '../shared/types'

// Carrega skill md do disco. Em produção, podemos cachear no startup;
// V1 lê do FS a cada run pra simplicidade.
async function loadPlannerSkill(): Promise<string> {
  const path = join(process.cwd(), 'lib/workflows/builder/prompts/planner.md')
  return await fs.readFile(path, 'utf-8')
}

interface PlannerInput {
  userMessage: string
  chatContextXml: string         // output do Bridge IN ('' se vazio)
  repoSnapshot: string
  mode: WorkflowMode
  projectPath: string
}

export interface PlannerStepResult {
  rawResult: AgentStepResult
  plan: PlannerOutput | null
  parseError?: string
  systemPrompt: string
  userText: string
}

// Builda repo snapshot leve. Top-level + key dirs + package.json hints.
export async function buildRepoSnapshot(projectPath: string): Promise<string> {
  const KEY_DIRS = new Set([
    'src', 'lib', 'app', 'components', 'utils', 'helpers',
    'pages', 'api', 'server', 'routes', 'hooks', 'modules',
    'features', 'packages', 'prisma', 'db',
  ])
  const lines: string[] = [`Project root: ${projectPath}`, '', 'Top-level entries:']
  const keyDirs: string[] = []
  try {
    const entries = await fs.readdir(projectPath, { withFileTypes: true })
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'dist' || e.name === 'build') continue
      lines.push(`  ${e.name}${e.isDirectory() ? '/' : ''}`)
      if (e.isDirectory() && KEY_DIRS.has(e.name)) keyDirs.push(e.name)
    }
  } catch (err) {
    return `(error reading projectPath: ${(err as Error).message})`
  }
  if (keyDirs.length > 0) {
    lines.push('', 'Key directories (one level deep):')
    for (const d of keyDirs) {
      try {
        const sub = await fs.readdir(join(projectPath, d), { withFileTypes: true })
        const items = sub
          .filter((e) => !e.name.startsWith('.'))
          .slice(0, 20)
          .map((e) => `${e.name}${e.isDirectory() ? '/' : ''}`)
        lines.push(`  ${d}/ → ${items.join(', ')}${sub.length > 20 ? `, … (+${sub.length - 20})` : ''}`)
      } catch {}
    }
  }
  try {
    const pkgRaw = await fs.readFile(join(projectPath, 'package.json'), 'utf-8')
    const pkg = JSON.parse(pkgRaw) as {
      name?: string
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
    lines.push('', `package.json: name="${pkg.name ?? 'unknown'}"`)
    if (pkg.scripts) lines.push(`  scripts: ${Object.keys(pkg.scripts).join(', ')}`)
    const deps = Object.keys({ ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) })
    if (deps.length > 0) {
      lines.push(`  deps: ${deps.slice(0, 15).join(', ')}${deps.length > 15 ? ` (+${deps.length - 15} more)` : ''}`)
    }
  } catch {}
  try {
    const readme = await fs.readFile(join(projectPath, 'README.md'), 'utf-8')
    lines.push('', 'README.md excerpt:', readme.slice(0, 500))
  } catch {}
  return lines.join('\n')
}

function buildPlannerSystemPrompt(skill: string, input: PlannerInput): string {
  const sections: string[] = [
    skill,
    '',
    '---',
    '',
    '## User task',
    input.userMessage,
    '',
  ]
  if (input.chatContextXml.length > 0) {
    sections.push('## Chat context preceding the workflow', input.chatContextXml, '')
  }
  sections.push('## Repo snapshot', input.repoSnapshot, '')
  sections.push(`## Mode\n${input.mode}`, '')
  return sections.join('\n')
}

function parsePlannerOutput(raw: string): { plan: PlannerOutput | null; error?: string } {
  // Strip optional markdown fence the model may wrap JSON in.
  const cleaned = raw
    .replace(/^[\s\S]*?```(?:json)?\s*/, '')
    .replace(/```[\s\S]*$/, '')
    .trim()
  try {
    const parsed = JSON.parse(cleaned) as PlannerOutput
    if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
      return { plan: null, error: 'planner returned no blocks' }
    }
    for (const b of parsed.blocks) {
      if (typeof b.name !== 'string' || typeof b.objective !== 'string') {
        return { plan: null, error: 'planner block missing name/objective' }
      }
    }
    return { plan: parsed }
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/)
    if (!match) return { plan: null, error: 'planner output is not valid JSON' }
    try {
      const parsed = JSON.parse(match[0]) as PlannerOutput
      if (!Array.isArray(parsed.blocks) || parsed.blocks.length === 0) {
        return { plan: null, error: 'planner returned no blocks (after recovery)' }
      }
      return { plan: parsed }
    } catch (e) {
      return { plan: null, error: `planner output JSON parse failed: ${(e as Error).message}` }
    }
  }
}

function planToMarkdown(plan: PlannerOutput, userMessage: string): string {
  const lines: string[] = [`# Plan`, '', `## Task`, userMessage, '']
  if (plan.rationale) lines.push(`## Rationale`, plan.rationale, '')
  lines.push(`## Blocks`, '')
  plan.blocks.forEach((b, i) => {
    lines.push(`### Block ${i + 1}: ${b.name}`)
    lines.push('', `**Objective:** ${b.objective}`)
    if (b.estimatedFiles?.length) {
      lines.push('', `**Estimated files:** ${b.estimatedFiles.join(', ')}`)
    }
    lines.push('')
  })
  return lines.join('\n')
}

export async function runPlannerStep(input: PlannerInput): Promise<PlannerStepResult> {
  const skill = await loadPlannerSkill()
  const systemPrompt = buildPlannerSystemPrompt(skill, input)
  const userText = 'Produce the final JSON plan now.'

  const rawResult = await callClaude({
    role: 'planner',
    systemPrompt,
    userText,
    cwd: input.projectPath,
    model: 'sonnet',
    // Planner não precisa editar — só pensar e ler (Read pra investigar
    // se quiser, mas o snapshot já vem no prompt)
    disallowedTools: ['Edit', 'Write', 'Bash', 'NotebookEdit', 'MultiEdit'],
    permissionMode: 'bypassPermissions',
  })

  const { plan, error } = parsePlannerOutput(rawResult.output)

  // Materializa plan.md em .team-handoff/ (audit trail) se o parse foi bem
  if (plan) {
    try {
      await writePlan(input.projectPath, planToMarkdown(plan, input.userMessage))
    } catch (err) {
      console.warn(`[planner] failed to write plan.md: ${(err as Error).message}`)
    }
  }

  return {
    rawResult,
    plan,
    ...(error && { parseError: error }),
    systemPrompt,
    userText,
  }
}
