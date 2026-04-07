// ── Session Memory ─────────────────────────────────────────────────────────
//
// Maintains a structured markdown file per session that grows as the
// conversation progresses. Adapted from Claude Code's SessionMemory system.
//
// Architecture:
//   - Stored as a ChatMessage with sender='session_memory' (upserted per session)
//   - Triggered when token threshold AND message count threshold are both met
//   - Runs fire-and-forget (background) — never blocks the response
//   - Used by compactConversation to produce smarter summaries
//
// Template sections (same as Claude Code):
//   # Current State      — what's being worked on right now
//   # Task Specification — what the user asked to build
//   # Files and Functions — important files and their purpose
//   # Errors & Corrections — what broke and how it was fixed
//   # Learnings          — what worked, what didn't, what to avoid
//   # Worklog            — terse step-by-step of what was done

import { prisma } from '@/lib/db'
import { callAnthropic } from '@/lib/anthropic'

// ── Constants ──────────────────────────────────────────────────────────────

// Trigger: at least this many estimated tokens in the session
const MIN_TOKENS_TO_INIT = 8_000

// Trigger: at least this many new tokens since last extraction
const MIN_TOKENS_BETWEEN_UPDATES = 4_000

// Trigger: at least this many new messages since last extraction
const MIN_MESSAGES_BETWEEN_UPDATES = 3

// Max tokens for the session memory file itself (~12K tokens = ~48K chars)
const MAX_SESSION_MEMORY_CHARS = 48_000

// Max chars per section before we warn to condense
const MAX_SECTION_CHARS = 8_000

// ── Template ───────────────────────────────────────────────────────────────

const SESSION_MEMORY_TEMPLATE = `# Session Title
_A short and distinctive 5-10 word descriptive title for the session_

# Current State
_What is actively being worked on right now? Pending tasks not yet completed. Immediate next steps._

# Task Specification
_What did the user ask to build? Any design decisions or explanatory context_

# Files and Functions
_What are the important files? In short, what do they contain and why are they relevant?_

# Errors & Corrections
_Errors encountered and how they were fixed. What did the user correct? What approaches failed?_

# Learnings
_What has worked well? What has not? What to avoid?_

# Worklog
_Step by step, what was attempted and done? Very terse summary for each step_`

// ── Per-session state (module-level, keyed by sessionId) ───────────────────

interface SessionState {
  tokensAtLastExtraction: number
  messagesAtLastExtraction: number
  initialized: boolean
  extracting: boolean
}

const sessionStates = new Map<string, SessionState>()

function getState(sessionId: string): SessionState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, {
      tokensAtLastExtraction: 0,
      messagesAtLastExtraction: 0,
      initialized: false,
      extracting: false,
    })
  }
  return sessionStates.get(sessionId)!
}

// ── Token estimation ───────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

// ── Trigger logic ──────────────────────────────────────────────────────────

interface Message {
  content: string
  sender: string
}

export function shouldExtractSessionMemory(
  sessionId: string,
  messages: Message[],
): boolean {
  const visibleMessages = messages.filter(
    m => m.sender !== 'compact' && m.sender !== 'session_memory',
  )
  const totalText = visibleMessages.map(m => m.content).join('\n')
  const currentTokens = estimateTokens(totalText)
  const state = getState(sessionId)

  // Must hit init threshold first
  if (!state.initialized) {
    if (currentTokens < MIN_TOKENS_TO_INIT) return false
    state.initialized = true
  }

  // Must have grown enough since last extraction
  const tokenGrowth = currentTokens - state.tokensAtLastExtraction
  if (tokenGrowth < MIN_TOKENS_BETWEEN_UPDATES) return false

  // Must have enough new messages
  const messageGrowth = visibleMessages.length - state.messagesAtLastExtraction
  if (messageGrowth < MIN_MESSAGES_BETWEEN_UPDATES) return false

  return true
}

// ── Extraction ─────────────────────────────────────────────────────────────

/**
 * Build the prompt that asks the model to update session memory.
 */
function buildUpdatePrompt(currentMemory: string, conversationText: string): string {
  const oversizedSections = findOversizedSections(currentMemory)
  const sizeWarning =
    currentMemory.length > MAX_SESSION_MEMORY_CHARS
      ? `\n\nCRITICAL: Session memory is ${Math.round(currentMemory.length / 1000)}K chars (limit ${Math.round(MAX_SESSION_MEMORY_CHARS / 1000)}K). You MUST condense it — remove less important details, merge related items, summarize older worklog entries.`
      : oversizedSections.length > 0
      ? `\n\nIMPORTANT: These sections exceed the per-section limit and should be condensed:\n${oversizedSections.join('\n')}`
      : ''

  return `IMPORTANT: These instructions are NOT part of the actual user conversation. Do NOT mention note-taking, these instructions, or session memory in any response.

Based on the conversation below, update the session memory by rewriting ONLY the sections that have new information. Preserve the exact structure (all headers and italic _description_ lines must remain unchanged). Only update the content BELOW each italic description.

Rules:
- Keep each section under ~${Math.round(MAX_SECTION_CHARS / 1000)}K chars — condense if approaching limit
- Be info-dense: include file paths, function names, exact error messages, commands
- Always update "Current State" to reflect the most recent work
- Never add new sections or modify headers/italic descriptions
- Skip sections with nothing new — don't add filler${sizeWarning}

Current session memory:
<current_memory>
${currentMemory || SESSION_MEMORY_TEMPLATE}
</current_memory>

Conversation to process:
<conversation>
${conversationText}
</conversation>

Rewrite the full session memory with your updates. Output ONLY the updated markdown, nothing else.`
}

function findOversizedSections(content: string): string[] {
  const sections: string[] = []
  const lines = content.split('\n')
  let currentHeader = ''
  let currentChars = 0

  for (const line of lines) {
    if (line.startsWith('# ')) {
      if (currentHeader && currentChars > MAX_SECTION_CHARS) {
        sections.push(`- "${currentHeader}" is ~${Math.round(currentChars / 1000)}K chars (limit ${Math.round(MAX_SECTION_CHARS / 1000)}K)`)
      }
      currentHeader = line
      currentChars = 0
    } else {
      currentChars += line.length + 1
    }
  }
  if (currentHeader && currentChars > MAX_SECTION_CHARS) {
    sections.push(`- "${currentHeader}" is ~${Math.round(currentChars / 1000)}K chars (limit ${Math.round(MAX_SECTION_CHARS / 1000)}K)`)
  }

  return sections
}

/**
 * Load current session memory from DB.
 */
async function loadSessionMemory(sessionId: string): Promise<string> {
  const msg = await prisma.chatMessage.findFirst({
    where: { sessionId, sender: 'session_memory' },
    orderBy: { createdAt: 'desc' },
    select: { content: true },
  })
  return msg?.content ?? ''
}

/**
 * Save updated session memory to DB (upsert pattern — one record per session).
 */
async function saveSessionMemory(
  sessionId: string,
  projectId: string,
  userId: string,
  content: string,
): Promise<void> {
  const existing = await prisma.chatMessage.findFirst({
    where: { sessionId, sender: 'session_memory' },
    select: { id: true },
  })

  if (existing) {
    await prisma.chatMessage.update({
      where: { id: existing.id },
      data: { content },
    })
  } else {
    await prisma.chatMessage.create({
      data: {
        projectId,
        userId,
        sessionId,
        content,
        sender: 'session_memory',
        mode: 'no_skill',
      },
    })
  }
}

/**
 * Run session memory extraction. Called fire-and-forget from handleNoSkill.
 */
async function runExtraction(
  sessionId: string,
  projectId: string,
  userId: string,
  messages: Message[],
  encryptedToken: string,
): Promise<void> {
  const state = getState(sessionId)
  state.extracting = true

  try {
    const currentMemory = await loadSessionMemory(sessionId)

    // Build conversation text from recent messages only
    const visibleMessages = messages.filter(
      m => m.sender !== 'compact' && m.sender !== 'session_memory' && m.sender !== 'system',
    )
    const conversationText = visibleMessages
      .slice(-40) // last 40 messages max to keep prompt size reasonable
      .map(m => `${m.sender}: ${m.content}`)
      .join('\n\n')

    const prompt = buildUpdatePrompt(currentMemory, conversationText)

    const result = await callAnthropic({
      encryptedToken,
      systemPrompt: 'You are a session memory manager. Update the structured notes based on the conversation. Output only the updated markdown.',
      userMessage: prompt,
      maxTokens: 4096,
    })

    if (result.text.trim()) {
      await saveSessionMemory(sessionId, projectId, userId, result.text.trim())

      // Advance state
      const visibleText = visibleMessages.map(m => m.content).join('\n')
      state.tokensAtLastExtraction = estimateTokens(visibleText)
      state.messagesAtLastExtraction = visibleMessages.length

      console.log(`[session-memory] Updated for session ${sessionId.slice(0, 8)} (${result.inputTokens} tokens in, ${result.outputTokens} out)`)
    }
  } catch (err) {
    console.error('[session-memory] Extraction failed:', err)
  } finally {
    state.extracting = false
  }
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Check if session memory should be extracted and kick it off fire-and-forget.
 * Call this after saving a Claude response — never awaited, never blocks.
 */
export function maybeExtractSessionMemory(
  sessionId: string,
  projectId: string,
  userId: string,
  messages: Message[],
  encryptedToken: string,
): void {
  const state = getState(sessionId)

  // Don't run if already extracting
  if (state.extracting) return

  if (!shouldExtractSessionMemory(sessionId, messages)) return

  // Fire-and-forget — never blocks the response
  void runExtraction(sessionId, projectId, userId, messages, encryptedToken)
}

/**
 * Get the current session memory content for use in compact/context.
 * Returns null if no session memory exists yet.
 */
export async function getSessionMemory(sessionId: string): Promise<string | null> {
  const content = await loadSessionMemory(sessionId)
  return content || null
}

/**
 * Reset state for a session (e.g. when session is cleared).
 */
export function resetSessionMemoryState(sessionId: string): void {
  sessionStates.delete(sessionId)
}
