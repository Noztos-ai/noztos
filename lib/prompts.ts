import { readFileSync } from 'fs'
import { join } from 'path'

// ── Prompt Loader ─────────────────────────────────────────────────────────
//
// Loads prompts from /prompts/*.md files.
// All behavior rules are centralized there — not in code.

const PROMPTS_DIR = join(process.cwd(), 'prompts')
const SKILLS_DIR = join(PROMPTS_DIR, 'skills')

// Cache prompts in memory (they don't change at runtime)
const cache = new Map<string, string>()

function load(filePath: string): string {
  if (cache.has(filePath)) return cache.get(filePath)!
  const content = readFileSync(filePath, 'utf-8')
  cache.set(filePath, content)
  return content
}

// ── Base Prompts ──────────────────────────────────────────────────────────

export function getBasePrompt(): string {
  return load(join(PROMPTS_DIR, 'base.md'))
}

export function getBuildRules(): string {
  return load(join(PROMPTS_DIR, 'build-rules.md'))
}

export function getTaskRules(): string {
  return load(join(PROMPTS_DIR, 'task-rules.md'))
}

export function getTeamRules(): string {
  return load(join(PROMPTS_DIR, 'team-rules.md'))
}

export function getSuggestionsRules(): string {
  return load(join(PROMPTS_DIR, 'suggestions-rules.md'))
}

// ── Skill Prompts ─────────────────────────────────────────────────────────

export function getSkillPrompt(skillId: string): string {
  return load(join(SKILLS_DIR, `${skillId}.md`))
}

export function getBuilderPrompt(): string {
  return load(join(SKILLS_DIR, 'builder.md'))
}

// ── Specialty Prompts ─────────────────────────────────────────────────────

export function getSecurityScanPrompt(mode: 'full' | 'targeted'): string {
  return load(join(PROMPTS_DIR, `security-scan-${mode}.md`))
}

export function getCodeHealthPrompt(mode: 'full' | 'targeted'): string {
  return load(join(PROMPTS_DIR, `codehealth-${mode}.md`))
}

// ── Composed Prompts ──────────────────────────────────────────────────────

/** System prompt for direct chat (no skill selected) — repo always present */
export function buildChatPrompt(): string {
  return [getBasePrompt(), getBuildRules(), getTaskRules()].join('\n\n---\n\n')
}

/** System prompt for skill chat (/ceo, /architect, etc.) — repo always present */
export function buildSkillChatPrompt(skillId: string): string {
  return [getBasePrompt(), getSkillPrompt(skillId), getBuildRules(), getTaskRules()].join('\n\n---\n\n')
}

/** System prompt for team chat pipeline — repo always present */
export function buildTeamChatPrompt(): string {
  return [getBasePrompt(), getTeamRules(), getBuildRules(), getTaskRules()].join('\n\n---\n\n')
}

/** System prompt for a specific employee within a team pipeline */
export function buildTeamMemberPrompt(skillId: string): string {
  return [getBasePrompt(), getSkillPrompt(skillId)].join('\n\n---\n\n')
}

/** System prompt for the builder within a team pipeline */
export function buildTeamBuilderPrompt(): string {
  return [getBasePrompt(), getBuilderPrompt()].join('\n\n---\n\n')
}

// ── Task Prompts ──────────────────────────────────────────────────────────

/** System prompt for task execution (skill mode) */
export function buildTaskSkillPrompt(skillId: string): string {
  const parts = [getBasePrompt(), getSkillPrompt(skillId), getSuggestionsRules()]
  return parts.join('\n\n---\n\n')
}

/** System prompt for task execution (team member) */
export function buildTaskTeamMemberPrompt(skillId: string): string {
  return [getBasePrompt(), getSkillPrompt(skillId), getSuggestionsRules()].join('\n\n---\n\n')
}

/** System prompt for task execution (builder) */
export function buildTaskBuilderPrompt(): string {
  return [getBasePrompt(), getBuilderPrompt(), getSuggestionsRules()].join('\n\n---\n\n')
}

// ── Skill Name Map ────────────────────────────────────────────────────────

export const SKILL_NAMES: Record<string, string> = {
  ceo: 'CEO',
  architect: 'Architect',
  designer: 'Designer',
  security: 'Security',
}
