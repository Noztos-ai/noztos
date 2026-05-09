// Spawn `claude -p` server-side e captura stream-json.
//
// V1: spawn direto do processo do server (não via daemon). Funciona pra
// dev local e ambiente de teste. Pra produção multi-machine, esta função
// vira um adapter — interface fica igual, implementação roteia pro
// daemon do user.
//
// Função pure-server (Node child_process). Não importa do client.

import { spawn } from 'node:child_process'
import type { AgentStepInput, AgentStepResult } from './types'

const DEFAULT_TIMEOUT_MS = 5 * 60_000

export function callClaude(input: AgentStepInput): Promise<AgentStepResult> {
  const startedAt = Date.now()
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const args: string[] = [
    '-p', input.userText,
    '--output-format', 'stream-json',
    '--verbose',
  ]
  if (input.systemPrompt.trim().length > 0) {
    args.push('--append-system-prompt', input.systemPrompt)
  }
  if (input.model) args.push('--model', input.model)
  if (input.allowedTools?.length) args.push('--allowedTools', input.allowedTools.join(','))
  if (input.disallowedTools?.length) args.push('--disallowedTools', input.disallowedTools.join(','))
  if (input.permissionMode) args.push('--permission-mode', input.permissionMode)

  console.log(`[wf-cli] spawn role=${input.role} cwd=${input.cwd} model=${input.model ?? 'default'} promptBytes=${input.systemPrompt.length}`)

  return new Promise<AgentStepResult>((resolve) => {
    let settled = false
    const child = spawn('claude', args, {
      cwd: input.cwd,
      env: { ...process.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    const assistantChunks: string[] = []
    const toolCalls: AgentStepResult['toolCalls'] = []
    const toolUseById = new Map<string, AgentStepResult['toolCalls'][number]>()
    let costUsd: number | undefined

    const finish = (out: AgentStepResult, reason: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { child.kill('SIGTERM') } catch {}
      const tag = out.error ? 'WARN' : 'LOG'
      console[tag === 'WARN' ? 'warn' : 'log'](`[wf-cli] done role=${input.role} reason=${reason} elapsed=${out.durationMs}ms outputBytes=${out.output.length}${out.error ? ` error="${out.error.slice(0, 200)}"` : ''}`)
      resolve(out)
    }

    const timer = setTimeout(() => {
      finish({
        output: assistantChunks.join(''),
        toolCalls,
        durationMs: Date.now() - startedAt,
        costUsd,
        error: `local timeout after ${timeoutMs}ms`,
      }, 'timeout')
    }, timeoutMs)

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf-8')
      let nl: number
      while ((nl = stdout.indexOf('\n')) !== -1) {
        const line = stdout.slice(0, nl).trim()
        stdout = stdout.slice(nl + 1)
        if (!line) continue
        try {
          const evt = JSON.parse(line) as {
            type?: string
            total_cost_usd?: number
            message?: {
              content?: Array<{
                type?: string
                text?: string
                id?: string
                name?: string
                input?: Record<string, unknown>
                tool_use_id?: string
                content?: string | Array<{ type: string; text: string }>
                is_error?: boolean
              }>
            }
          }
          if (evt.type === 'assistant' && evt.message?.content) {
            for (const block of evt.message.content) {
              if (block.type === 'text' && typeof block.text === 'string') {
                assistantChunks.push(block.text)
              }
              if (block.type === 'tool_use' && block.id && block.name) {
                const tc = { name: block.name, input: block.input ?? {} }
                toolCalls.push(tc)
                toolUseById.set(block.id, tc)
              }
            }
          }
          if (evt.type === 'user' && evt.message?.content) {
            for (const block of evt.message.content) {
              if (block.type === 'tool_result' && block.tool_use_id) {
                const tc = toolUseById.get(block.tool_use_id)
                if (tc) {
                  const text = typeof block.content === 'string'
                    ? block.content
                    : Array.isArray(block.content)
                      ? block.content.map((c) => c.text).join('\n')
                      : ''
                  tc.result = text
                  tc.error = block.is_error ?? false
                }
              }
            }
          }
          if (evt.type === 'result' && typeof evt.total_cost_usd === 'number') {
            costUsd = evt.total_cost_usd
          }
        } catch {
          // Linha não-JSON (banner ocasional) — ignora.
        }
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf-8')
    })

    child.on('error', (err) => {
      finish({
        output: assistantChunks.join(''),
        toolCalls,
        durationMs: Date.now() - startedAt,
        costUsd,
        error: `spawn error: ${err.message}`,
      }, 'error')
    })

    child.on('close', (code) => {
      const output = assistantChunks.join('')
      const durationMs = Date.now() - startedAt
      if (code !== 0 && !output) {
        finish({
          output: '',
          toolCalls,
          durationMs,
          costUsd,
          error: `claude exited with code ${code}: ${stderr.slice(0, 500)}`,
        }, 'close-error')
        return
      }
      finish({ output, toolCalls, durationMs, costUsd }, 'close')
    })
  })
}
