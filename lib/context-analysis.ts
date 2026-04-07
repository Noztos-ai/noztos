// ── Context Analysis & Suggestions ────────────────────────────────────────
//
// Tracks token usage by category within a session and generates actionable
// suggestions when the context is getting heavy. Adapted from Claude Code's
// contextAnalysis.ts + contextSuggestions.ts.
//
// Categories tracked:
//   - claude messages vs user messages
//   - tool results (read_file, search, list_dir)
//   - duplicate file reads (same file read multiple times)
//   - compact summaries
//   - session memory

export interface ContextStats {
  totalChars: number
  estimatedTokens: number
  percentUsed: number

  // breakdown by sender
  claudeChars: number
  userChars: number
  toolResultChars: number
  compactChars: number
  sessionMemoryChars: number

  // duplicate file reads: filePath → { count, chars }
  duplicateFileReads: Map<string, { count: number; chars: number }>

  messageCount: number
}

export interface ContextSuggestion {
  severity: 'warning' | 'info'
  title: string
  detail: string
}

const CONTEXT_WINDOW_CHARS = 200_000 * 4 // 200K tokens × 4 chars/token

// Rough patterns to detect file reads in tool result content
const FILE_READ_PATTERN = /^##\s+(.+\.\w+)\s*$/m

function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4)
}

// ── Analysis ───────────────────────────────────────────────────────────────

interface Message {
  content: string
  sender: string
}

/**
 * Analyse context usage for a session's messages.
 */
export function analyzeContext(messages: Message[]): ContextStats {
  let claudeChars = 0
  let userChars = 0
  let toolResultChars = 0
  let compactChars = 0
  let sessionMemoryChars = 0

  // Track file reads: path → list of char counts per read
  const fileReadMap = new Map<string, number[]>()

  for (const msg of messages) {
    const len = msg.content.length

    switch (msg.sender) {
      case 'user':
        userChars += len
        break
      case 'claude':
        claudeChars += len
        break
      case 'compact':
        compactChars += len
        break
      case 'session_memory':
        sessionMemoryChars += len
        break
      case 'system':
        break
      default:
        // skill responses (CEO, Architect, etc.)
        claudeChars += len
    }

    // Detect tool results embedded in prefetch context (format: ## filepath\n```)
    // This is how prefetchContext injects file content into user messages
    if (msg.sender === 'user' && msg.content.includes('Relevant code from the repository')) {
      toolResultChars += len

      // Extract individual file reads
      const fileMatches = [...msg.content.matchAll(/## ([^\n]+\.\w+)\n```\n([\s\S]*?)```/g)]
      for (const match of fileMatches) {
        const filePath = match[1].trim()
        const fileContent = match[2] ?? ''
        const existing = fileReadMap.get(filePath) ?? []
        existing.push(fileContent.length)
        fileReadMap.set(filePath, existing)
      }
    }
  }

  const totalChars = claudeChars + userChars + compactChars + sessionMemoryChars
  const estimatedTokens = estimateTokens(totalChars)
  const percentUsed = Math.round((totalChars / CONTEXT_WINDOW_CHARS) * 100)

  // Build duplicate reads map (only files read more than once)
  const duplicateFileReads = new Map<string, { count: number; chars: number }>()
  for (const [path, reads] of fileReadMap) {
    if (reads.length > 1) {
      duplicateFileReads.set(path, {
        count: reads.length,
        chars: reads.reduce((a, b) => a + b, 0),
      })
    }
  }

  return {
    totalChars,
    estimatedTokens,
    percentUsed,
    claudeChars,
    userChars,
    toolResultChars,
    compactChars,
    sessionMemoryChars,
    duplicateFileReads,
    messageCount: messages.length,
  }
}

// ── Suggestions ────────────────────────────────────────────────────────────

/**
 * Generate actionable suggestions based on context stats.
 * Warnings come first, then infos sorted by impact.
 */
export function generateContextSuggestions(stats: ContextStats): ContextSuggestion[] {
  const suggestions: ContextSuggestion[] = []

  // ── Warnings (high priority) ───────────────────────────────────────────

  if (stats.percentUsed >= 80) {
    suggestions.push({
      severity: 'warning',
      title: `Context ${stats.percentUsed}% full`,
      detail: `Using ~${stats.estimatedTokens.toLocaleString()} tokens of 200K. Auto-compact will trigger soon at 70%. Consider starting a new chat if the conversation is long.`,
    })
  }

  if (stats.percentUsed >= 60 && stats.compactChars === 0) {
    suggestions.push({
      severity: 'warning',
      title: 'No compaction yet — context growing large',
      detail: `${stats.percentUsed}% used with no compaction. If the conversation gets much longer it will auto-compact. You can also compact manually.`,
    })
  }

  // ── Infos (sorted by impact) ───────────────────────────────────────────

  const infos: ContextSuggestion[] = []

  // Tool results taking up too much space
  const toolPct = Math.round((stats.toolResultChars / Math.max(stats.totalChars, 1)) * 100)
  if (toolPct >= 20 && stats.toolResultChars > 10_000) {
    infos.push({
      severity: 'info',
      title: `Code context using ${toolPct}% of window`,
      detail: `~${estimateTokens(stats.toolResultChars).toLocaleString()} tokens spent on fetched code. The file read cache helps avoid re-reads within the same session.`,
    })
  }

  // Duplicate file reads
  if (stats.duplicateFileReads.size > 0) {
    const topDup = [...stats.duplicateFileReads.entries()]
      .sort((a, b) => b[1].chars - a[1].chars)
      .slice(0, 3)

    const dupList = topDup
      .map(([path, { count, chars }]) =>
        `${path} (read ${count}×, ~${estimateTokens(chars).toLocaleString()} tokens)`)
      .join(', ')

    infos.push({
      severity: 'info',
      title: `${stats.duplicateFileReads.size} file(s) read multiple times`,
      detail: `File read cache should prevent this within a session. Top duplicates: ${dupList}.`,
    })
  }

  // Claude responses dominating
  const claudePct = Math.round((stats.claudeChars / Math.max(stats.totalChars, 1)) * 100)
  if (claudePct >= 50 && stats.claudeChars > 20_000) {
    infos.push({
      severity: 'info',
      title: `Claude responses using ${claudePct}% of context`,
      detail: `Long responses accumulate fast. Consider compacting after major milestones to keep context lean.`,
    })
  }

  // Session memory available
  if (stats.sessionMemoryChars > 0) {
    infos.push({
      severity: 'info',
      title: 'Session memory active',
      detail: `~${estimateTokens(stats.sessionMemoryChars).toLocaleString()} tokens of structured session notes. Will be used to produce a smarter compact summary when needed.`,
    })
  }

  // Sort infos by descending impact (chars)
  infos.sort((a, b) => {
    const aChars = a.title.match(/(\d+)%/) ? parseInt(a.title.match(/(\d+)%/)![1]) : 0
    const bChars = b.title.match(/(\d+)%/) ? parseInt(b.title.match(/(\d+)%/)![1]) : 0
    return bChars - aChars
  })

  return [...suggestions, ...infos]
}

/**
 * Log context suggestions to console. Called after each API response.
 */
export function logContextSuggestions(stats: ContextStats, sessionId?: string): void {
  const label = sessionId ? sessionId.slice(0, 8) : 'unknown'
  const suggestions = generateContextSuggestions(stats)

  for (const s of suggestions) {
    if (s.severity === 'warning') {
      console.warn(`[context-analysis] ⚠️  [${label}] ${s.title} — ${s.detail}`)
    } else {
      console.log(`[context-analysis] ℹ  [${label}] ${s.title}`)
    }
  }
}
