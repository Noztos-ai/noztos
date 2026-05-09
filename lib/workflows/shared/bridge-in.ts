// Bridge IN — cache pass-through pro Planner.
//
// Lê o histórico do chat do ring buffer (RAM) ou DB Postgres (fallback)
// e formata como XML estruturado pra Planner consumir.
//
// Decisões locked (ver docs/team-workflow/01-builder-workflow.md):
// - Tier 1: ring buffer (sem cap — confia na cache tunada)
// - Tier 2: DB com LIMIT 30
// - Tier 3: empty (retorna "")
// - Output: XML wrapped em <chat_context>...</chat_context>
// - Sem chamada de modelo na crítica
// - Wait time = 0 (não espera writeback do trigger msg)
//
// Quem usa: APENAS o Planner (Phase 0). Outros agents não veem chat raw.

import { prisma } from '@/lib/db'
import { getSessionBuffer } from '@/lib/companion-relay'

interface CanonicalRow {
  role: 'user' | 'assistant' | 'tool' | 'thinking' | 'system'
  text: string
  toolName?: string
  toolError?: boolean
  toolResult?: string
}

// ── Adapter 1: ring buffer raw events → CanonicalRow[] ─────────────

interface RingEventEnvelope {
  type?: string
  payload?: {
    bornastarSessionId?: string
    event?: {
      type?: string
      message?: {
        content?: Array<{
          type?: string
          text?: string
          thinking?: string
          name?: string
          id?: string
          tool_use_id?: string
          content?: string | Array<{ type: string; text: string }>
          is_error?: boolean
        }>
      }
    }
    persistRows?: Array<{
      id: string
      role: string
      content?: string
      toolName?: string
      toolInput?: unknown
      toolResult?: string
      toolError?: boolean
    }>
  }
}

function fromRingEvents(events: unknown[], sessionId: string): CanonicalRow[] {
  const out: CanonicalRow[] = []
  // Track tool_use → tool_result mapping by id within the stream.
  const toolByUseId = new Map<string, CanonicalRow>()

  for (const raw of events) {
    const env = raw as RingEventEnvelope
    if (env?.type !== 'claude_event') continue
    if (env.payload?.bornastarSessionId !== sessionId) continue

    // Path A: persistRows (daemon-stamped, structured) — preferred
    if (Array.isArray(env.payload?.persistRows) && env.payload.persistRows.length > 0) {
      for (const r of env.payload.persistRows) {
        if (!r?.role) continue
        const role = r.role as CanonicalRow['role']
        if (role === 'tool') {
          out.push({
            role: 'tool',
            text: r.content ?? '',
            toolName: r.toolName,
            toolError: r.toolError,
            toolResult: typeof r.toolResult === 'string' ? r.toolResult : undefined,
          })
        } else if (role === 'thinking') {
          out.push({ role: 'thinking', text: r.content ?? '' })
        } else if (role === 'user' || role === 'assistant' || role === 'system') {
          out.push({ role, text: r.content ?? '' })
        }
      }
      continue
    }

    // Path B: parse the inner Claude event (when persistRows is absent)
    const inner = env.payload?.event
    if (!inner) continue
    if (inner.type === 'assistant' && inner.message?.content) {
      for (const block of inner.message.content) {
        if (block.type === 'text' && typeof block.text === 'string') {
          out.push({ role: 'assistant', text: block.text })
        } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
          out.push({ role: 'thinking', text: block.thinking })
        } else if (block.type === 'tool_use' && block.id && block.name) {
          const row: CanonicalRow = { role: 'tool', text: '', toolName: block.name }
          out.push(row)
          toolByUseId.set(block.id, row)
        }
      }
    }
    if (inner.type === 'user' && inner.message?.content) {
      for (const block of inner.message.content) {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const row = toolByUseId.get(block.tool_use_id)
          if (row) {
            const text = typeof block.content === 'string'
              ? block.content
              : Array.isArray(block.content)
                ? block.content.map((c) => c.text).join('\n')
                : ''
            row.toolResult = text
            row.toolError = block.is_error ?? false
          }
        }
      }
    }
  }
  return out
}

// ── Adapter 2: DB rows → CanonicalRow[] ─────────────────────────────

interface DbRow {
  role: string
  content: string
  toolName: string | null
  toolError: boolean
  toolResult: unknown
}

function fromDbRows(rows: DbRow[]): CanonicalRow[] {
  return rows.map((r) => {
    const role = r.role as CanonicalRow['role']
    return {
      role,
      text: r.content ?? '',
      toolName: r.toolName ?? undefined,
      toolError: r.toolError ?? undefined,
      toolResult: typeof r.toolResult === 'string' ? r.toolResult : undefined,
    }
  })
}

// ── Single formatter (XML output) ──────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function formatLine(row: CanonicalRow): string {
  if (row.role === 'tool') {
    const status = row.toolError ? ' status="error"' : ''
    const inner: string[] = []
    if (row.text) inner.push(`    <label>${escapeXml(row.text)}</label>`)
    if (row.toolResult) inner.push(`    <result>${escapeXml(row.toolResult)}</result>`)
    return `  <tool name="${escapeXml(row.toolName ?? 'unknown')}"${status}>\n${inner.join('\n')}\n  </tool>`
  }
  if (row.role === 'thinking') return `  <thinking>${escapeXml(row.text)}</thinking>`
  if (row.role === 'system')   return `  <system>${escapeXml(row.text)}</system>`
  return `  <${row.role}>${escapeXml(row.text)}</${row.role}>`
}

function formatXml(rows: CanonicalRow[]): string {
  if (rows.length === 0) return ''
  return `<chat_context>\n${rows.map(formatLine).join('\n')}\n</chat_context>`
}

// ── Tier-fallback: ring → DB → empty ───────────────────────────────

const DB_LIMIT = 30

export async function buildBridgeInContext(sessionId: string, userId: string): Promise<string> {
  // Tier 1: ring buffer (RAM, ~0ms)
  try {
    const events = getSessionBuffer(sessionId, userId)
    if (events && events.length > 0) {
      const rows = fromRingEvents(events, sessionId)
      if (rows.length > 0) {
        console.log(`[bridge-in] sid=${sessionId.slice(0, 8)} source=ring events=${events.length} rows=${rows.length}`)
        return formatXml(rows)
      }
    }
  } catch (err) {
    console.warn(`[bridge-in] sid=${sessionId.slice(0, 8)} ring buffer error:`, (err as Error).message)
  }

  // Tier 2: DB (LIMIT 30, ~5ms)
  try {
    const dbRows = await prisma.chatMessage.findMany({
      where: { sessionId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: DB_LIMIT,
      select: {
        role: true,
        content: true,
        toolName: true,
        toolError: true,
        toolResult: true,
      },
    })
    if (dbRows.length > 0) {
      dbRows.reverse()
      const rows = fromDbRows(dbRows)
      console.log(`[bridge-in] sid=${sessionId.slice(0, 8)} source=db rows=${rows.length}`)
      return formatXml(rows)
    }
  } catch (err) {
    console.warn(`[bridge-in] sid=${sessionId.slice(0, 8)} DB error:`, (err as Error).message)
  }

  // Tier 3: empty
  console.log(`[bridge-in] sid=${sessionId.slice(0, 8)} source=empty`)
  return ''
}
