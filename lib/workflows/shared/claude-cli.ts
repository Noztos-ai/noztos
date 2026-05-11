// Spawn `claude -p` server-side e captura stream-json.
//
// V1: spawn direto do processo do server (não via daemon). Funciona pra
// dev local e ambiente de teste. Pra produção multi-machine, esta função
// vira um adapter — interface fica igual, implementação roteia pro
// daemon do user.
//
// Função pure-server (Node child_process). Não importa do client.

import { spawn } from 'node:child_process'
import type { AgentStepInput, AgentStepResult, TranscriptChunk } from './types'
import { registerChild, unregisterChild } from './process-registry'

// Best-effort emit — onChunk is observation; never let it block the
// stream parse or surface back as a CLI error.
function emit(onChunk: ((c: TranscriptChunk) => void) | undefined, c: TranscriptChunk): void {
  if (!onChunk) return
  try { onChunk(c) } catch { /* swallow */ }
}

// Two timers cooperate per agent run:
//   • DEFAULT_TIMEOUT_MS — absolute hard cap. Only fires for truly
//     zombie processes (deadlock, hung subprocess). Generous so
//     legitimate long work (deep planner investigation, builder with
//     compile/test, etc) is never artificially cut short.
//   • STALL_THRESHOLD_MS — kills if NO bytes flow from claude's stdout
//     for this long. This is the real "something broke" detector.
//     Reset on every chunk; dies only on actual silence.
const DEFAULT_TIMEOUT_MS = 90 * 60_000   // 90min absolute cap
const STALL_THRESHOLD_MS = 5 * 60_000    // 5min of complete silence = stall

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
    if (input.runId) registerChild(input.runId, child)

    let stdout = ''
    let stderr = ''
    const assistantChunks: string[] = []
    const toolCalls: AgentStepResult['toolCalls'] = []
    const toolUseById = new Map<string, AgentStepResult['toolCalls'][number]>()
    let costUsd: number | undefined

    // ── Live observability + stall detection ────────────────────────
    // The bare spawn → close pair gives us nothing while the model
    // thinks. These flags + the heartbeat timer let us see in real
    // time whether the CLI even started, whether claude began
    // streaming, or whether we're stuck waiting for the first byte.
    //
    // The heartbeat doubles as the stall detector: if `sinceLastByte`
    // crosses STALL_THRESHOLD_MS, we kill with a clear error. This is
    // the real "broken" detector — the absolute timeout is just a last-
    // resort cap for zombie processes that somehow keep producing bytes
    // without finishing.
    let lastByteAt = Date.now()
    let sawSystem = false
    let sawAssistantChunk = false
    let sawFirstStdoutByte = false
    let assistantChunkCount = 0
    let toolUseLogged = 0
    const HEARTBEAT_MS = 30_000
    const heartbeat = setInterval(() => {
      if (settled) return
      const sinceStart = Date.now() - startedAt
      const sinceLastByte = Date.now() - lastByteAt
      console.warn(`[wf-cli] heartbeat role=${input.role} totalElapsed=${(sinceStart / 1000).toFixed(1)}s sinceLastByte=${(sinceLastByte / 1000).toFixed(1)}s sawSystem=${sawSystem} sawAssistant=${sawAssistantChunk} chunks=${assistantChunkCount} tools=${toolUseLogged}`)
      if (sinceLastByte > STALL_THRESHOLD_MS) {
        finish({
          output: assistantChunks.join(''),
          toolCalls,
          durationMs: sinceStart,
          costUsd,
          error: `stalled: no stdout for ${Math.round(sinceLastByte / 1000)}s (threshold ${STALL_THRESHOLD_MS / 1000}s)`,
        }, 'stall')
      }
    }, HEARTBEAT_MS)
    if (typeof heartbeat.unref === 'function') heartbeat.unref()

    const finish = (out: AgentStepResult, reason: string) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearInterval(heartbeat)
      try { child.kill('SIGTERM') } catch {}
      if (input.runId) unregisterChild(input.runId, child)
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
      lastByteAt = Date.now()
      if (!sawFirstStdoutByte) {
        sawFirstStdoutByte = true
        const dt = Date.now() - startedAt
        console.log(`[wf-cli] first stdout byte role=${input.role} after=${dt}ms (CLI started)`)
      }
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
          if (evt.type === 'system' && !sawSystem) {
            sawSystem = true
            const dt = Date.now() - startedAt
            console.log(`[wf-cli] system event role=${input.role} after=${dt}ms (claude session ready)`)
          }
          if (evt.type === 'assistant' && evt.message?.content) {
            for (const block of evt.message.content) {
              if (block.type === 'text' && typeof block.text === 'string') {
                assistantChunks.push(block.text)
                if (!sawAssistantChunk) {
                  sawAssistantChunk = true
                  const dt = Date.now() - startedAt
                  console.log(`[wf-cli] first assistant text role=${input.role} after=${dt}ms (model started replying)`)
                }
                assistantChunkCount++
                emit(input.onChunk, { ts: Date.now(), type: 'text', text: block.text })
              }
              if (block.type === 'tool_use' && block.id && block.name) {
                const tc = { name: block.name, input: block.input ?? {} }
                toolCalls.push(tc)
                toolUseById.set(block.id, tc)
                if (toolUseLogged < 5) {
                  const dt = Date.now() - startedAt
                  console.log(`[wf-cli] tool_use role=${input.role} after=${dt}ms name=${block.name}`)
                  toolUseLogged++
                }
                emit(input.onChunk, {
                  ts: Date.now(),
                  type: 'tool_use',
                  toolName: block.name,
                  toolInput: block.input ?? {},
                  toolUseId: block.id,
                })
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
                  // Truncate huge tool results before emitting — keeps
                  // WorkflowRun.progress under control. Full payload
                  // still lives in toolCalls[].result for the report.
                  const MAX_RESULT_BYTES = 8 * 1024
                  const safeText = text.length > MAX_RESULT_BYTES
                    ? text.slice(0, MAX_RESULT_BYTES) + `\n…[truncated ${text.length - MAX_RESULT_BYTES} bytes]`
                    : text
                  emit(input.onChunk, {
                    ts: Date.now(),
                    type: 'tool_result',
                    toolName: tc.name,
                    toolUseId: block.tool_use_id,
                    toolResult: safeText,
                    toolError: block.is_error ?? false,
                  })
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
