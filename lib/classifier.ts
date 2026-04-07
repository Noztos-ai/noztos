// ── Message Classifier ────────────────────────────────────────────────────
//
// Uses a cheap model (GPT-4o-mini or Haiku) to classify user messages
// into the correct response mode before sending to Claude.
//
// Returns: which mode prompt to load + whether execution is involved.

const CLASSIFIER_PROMPT = `You are a message classifier for a coding assistant. Given a user message (and optionally the last few messages for context), classify it into exactly ONE mode, determine if it involves code execution, and extract 2-3 search keywords to find relevant code.

MODES (pick exactly one):

1. explaining-what — "what is X?", concepts, definitions, terms
2. explaining-how — "how does X work?", flows, processes, mechanisms
3. comparing — "X vs Y", comparing technologies, approaches, pros/cons
4. discussing-code — technical decisions, "does this make sense?", "should I use X?"
5. planning — "how would I build X?", architecture, system design, module structure
6. improving-code — fix error handling, add validation, security, performance, simplify, typing
7. refactoring — reorganize code, extract modules, split files, eliminate duplication
8. debugging — "it's broken", errors, bugs, unexpected behavior
9. testing — write tests, test strategy, coverage, mocking
10. devops — deploy, CI/CD, Docker, infrastructure, monitoring, environments
11. documentation — write README, API docs, CHANGELOG, JSDoc, CONTRIBUTING
12. none — casual conversation, greetings, unclear, doesn't fit any mode

EXECUTION — set to true if the message asks to:
- Create, edit, or delete files
- Run commands
- Build or implement something
- Apply changes to the codebase

Set to false if the message is asking about, discussing, planning, or analyzing — but not doing.

KEYWORDS — 2-3 short technical terms to search in the codebase. Pick the most specific identifiers (function names, file names, concepts). Empty array for casual/none messages.

RESPOND WITH ONLY THIS JSON, nothing else:
{"mode": "mode-name", "execution": true/false, "keywords": ["term1", "term2"]}

EXAMPLES:

"o que é WebSocket?" → {"mode": "explaining-what", "execution": false, "keywords": ["websocket", "socket"]}
"como funciona o fluxo de login?" → {"mode": "explaining-how", "execution": false, "keywords": ["login", "session", "auth"]}
"REST vs GraphQL?" → {"mode": "comparing", "execution": false, "keywords": ["graphql", "rest"]}
"faz sentido usar localStorage pra planos?" → {"mode": "discussing-code", "execution": false, "keywords": ["localStorage", "plans"]}
"quero adicionar sistema de email" → {"mode": "planning", "execution": false, "keywords": ["email", "smtp"]}
"melhora o error handling do server.js" → {"mode": "improving-code", "execution": true, "keywords": ["error", "server"]}
"refatora o auth pra separar responsabilidades" → {"mode": "refactoring", "execution": true, "keywords": ["auth", "middleware"]}
"tá dando 401 no login" → {"mode": "debugging", "execution": false, "keywords": ["401", "login", "auth"]}
"escreve testes pro approve" → {"mode": "testing", "execution": true, "keywords": ["approve", "test"]}
"como faço deploy pra produção?" → {"mode": "devops", "execution": false, "keywords": ["deploy", "production"]}
"escreve um README" → {"mode": "documentation", "execution": true, "keywords": ["readme"]}
"fala meu amigo!" → {"mode": "none", "execution": false, "keywords": []}
"cria a rota de login" → {"mode": "planning", "execution": true, "keywords": ["login", "route"]}
"analisa esse arquivo" → {"mode": "improving-code", "execution": false, "keywords": []}
"implementa isso" → {"mode": "none", "execution": true, "keywords": []}
`

export interface ClassificationResult {
  mode: string
  execution: boolean
  keywords: string[]
}

// Map mode names to file names
const MODE_TO_FILE: Record<string, string> = {
  'explaining-what': 'when-explaining-what.md',
  'explaining-how': 'when-explaining-how.md',
  'comparing': 'when-comparing.md',
  'discussing-code': 'when-discussing-code.md',
  'planning': 'when-planning.md',
  'improving-code': 'when-improving-code.md',
  'refactoring': 'when-refactoring.md',
  'debugging': 'when-debugging.md',
  'testing': 'when-testing.md',
  'devops': 'when-devops.md',
  'documentation': 'when-documentation.md',
}

export function getModeFileName(mode: string): string | null {
  return MODE_TO_FILE[mode] || null
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Classify a user message using a cheap model.
 * Falls back to 'none' if classification fails.
 * @param lastMessages - Recent conversation messages for context (optional, max 4)
 */
export async function classifyMessage(
  message: string,
  encryptedToken: string,
  lastMessages: ConversationMessage[] = []
): Promise<ClassificationResult> {
  try {
    const { decrypt } = await import('@/lib/crypto')
    const apiKey = decrypt(encryptedToken)
    if (!apiKey) return { mode: 'none', execution: false, keywords: [] }

    // Build messages array: include conversation history for context, then the classify request
    const historyContext = lastMessages.length > 0
      ? `Recent conversation (for context only):\n${lastMessages
          .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 200)}`)
          .join('\n')}\n\nNow classify this message:`
      : null

    const userContent = historyContext
      ? `${historyContext}\n${message}`
      : message

    // Use Anthropic Haiku (cheapest Claude model)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        system: CLASSIFIER_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    })

    const data = await res.json()

    if (!res.ok) {
      console.error('[classifier] API error:', data.error?.message)
      return { mode: 'none', execution: false, keywords: [] }
    }

    const raw = data.content?.[0]?.text?.trim()
    if (!raw) return { mode: 'none', execution: false, keywords: [] }

    // Strip markdown code block if Haiku wraps the JSON (e.g. ```json ... ```)
    const text = raw.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '').trim()

    // Parse JSON response
    const parsed = JSON.parse(text)
    const mode = typeof parsed.mode === 'string' ? parsed.mode : 'none'
    const execution = parsed.execution === true
    const keywords = Array.isArray(parsed.keywords)
      ? parsed.keywords.filter((k: unknown) => typeof k === 'string').slice(0, 3)
      : []

    // Validate mode exists
    if (mode !== 'none' && !MODE_TO_FILE[mode]) {
      console.warn('[classifier] Unknown mode:', mode)
      return { mode: 'none', execution, keywords }
    }

    console.log(`[classifier] "${message.slice(0, 50)}..." → mode: ${mode}, execution: ${execution}, keywords: [${keywords.join(', ')}]`)
    return { mode, execution, keywords }
  } catch (err) {
    console.error('[classifier] Failed:', err)
    return { mode: 'none', execution: false, keywords: [] }
  }
}
