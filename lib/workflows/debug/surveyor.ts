// Surveyor step — Phase 0 of Debug Workflow.
//
// The Surveyor is the only agent with tools that runs before the
// Planner. It explores the repo (Read/Grep/Glob/Bash, no writes) and
// produces a structured Repo Study Report that the Planner consumes
// downstream. The Planner itself has zero tools — its decomposition
// is pure reasoning on Surveyor's output + user task.
//
// This split exists because earlier prompts kept the Planner agentic
// AND tool-restricted, and the model still found ways to short-circuit
// into fix-mode (sed via Bash, sub-agents via the Agent tool). By
// removing the Planner's capabilities entirely and pushing exploration
// up to a dedicated Surveyor, the fix temptation is gone at the SDK
// level: a tool-less Planner physically cannot edit files.

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { callClaude } from '../shared/claude-cli'
import { writeSurveyorReport } from '../shared/artifacts'
import type { AgentStepResult, TranscriptChunk } from '../shared/types'

async function loadSurveyorSkill(): Promise<string> {
  const path = join(process.cwd(), 'lib/workflows/debug/prompts/surveyor.md')
  return await fs.readFile(path, 'utf-8')
}

interface SurveyorInput {
  userMessage: string
  chatContextXml: string
  repoSnapshot: string
  projectPath: string
  runId?: string
  onChunk?: (chunk: TranscriptChunk) => void
}

export interface SurveyorStepResult {
  rawResult: AgentStepResult
  outputPath?: string
  systemPrompt: string
  userText: string
}

function buildSystemPrompt(skill: string, input: SurveyorInput): string {
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
  sections.push('## Repo snapshot (cheap structural info)', input.repoSnapshot, '')
  return sections.join('\n')
}

export async function runSurveyorStep(input: SurveyorInput): Promise<SurveyorStepResult> {
  const skill = await loadSurveyorSkill()
  const systemPrompt = buildSystemPrompt(skill, input)
  const userText = 'Survey the repo and produce the study report now.'

  const rawResult = await callClaude({
    role: 'surveyor',
    systemPrompt,
    userText,
    cwd: input.projectPath,
    // Haiku is more instruction-literal than Sonnet — less drift into
    // fix-mode when the user message contains imperative verbs. The
    // Surveyor's task (read + write a structured map) doesn't need
    // Sonnet-level reasoning; following the prompt strictly matters more.
    model: 'haiku',
    runId: input.runId,
    // Surveyor explores freely (Read/Grep/Glob/Bash for ergonomic
    // navigation: ls, find, tree, cat). Never writes. Edit/Write are
    // blocked at the SDK level; Bash stays open because Surveyor's
    // role legitimately uses it for structure mapping. The Agent tool
    // is blocked so the model can't delegate a fix to a sub-claude.
    disallowedTools: ['Edit', 'Write', 'NotebookEdit', 'MultiEdit', 'Agent', 'Task'],
    permissionMode: 'bypassPermissions',
    onChunk: input.onChunk,
  })

  let outputPath: string | undefined
  if (rawResult.output && !rawResult.error) {
    try {
      outputPath = await writeSurveyorReport(input.projectPath, rawResult.output)
    } catch (err) {
      console.warn(`[surveyor] failed to write report: ${(err as Error).message}`)
    }
  }

  return {
    rawResult,
    ...(outputPath && { outputPath }),
    systemPrompt,
    userText,
  }
}
