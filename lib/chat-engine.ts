import { prisma } from '@/lib/db'
import { callAnthropic } from '@/lib/anthropic'

// ── Skills ─────────────────────────────────────────────────────────────────

const SKILLS: Record<string, { name: string; systemPrompt: string }> = {
  ceo: {
    name: 'CEO',
    systemPrompt: `You are the CEO. Strategic: challenge assumptions, question scope, ensure the right problem is being solved.
- Ask "Is this the right problem?"
- Identify risks and blockers
- Give clear go/no-go with reasoning
- Think in user outcomes
- Be direct and decisive
Always start your response with "CEO:"`,
  },
  architect: {
    name: 'Architect',
    systemPrompt: `You are the Lead Architect. Define exactly what needs to be built.
- List every file to create or edit with reason
- Define data flow with ASCII diagrams
- Specify key interfaces and types
- Identify edge cases
- Be precise — your output is the builder's contract
Always start your response with "Architect:"`,
  },
  designer: {
    name: 'Designer',
    systemPrompt: `You are the Lead Designer. Review UI/UX and catch AI slop.
- Evaluate information hierarchy
- Check all interaction states
- Identify edge cases
- Ensure simplicity
- Flag complexity without user value
Always start your response with "Designer:"`,
  },
  security: {
    name: 'Security',
    systemPrompt: `You are the Security Reviewer. Find vulnerabilities before production.
- Check injection vectors
- Verify authorization boundaries
- Check secrets handling
- Verify input validation
- OWASP Top 10 + STRIDE
- Rate findings: High/Medium/Low with remediation
Always start your response with "Security:"`,
  },
}

// ── Types ──────────────────────────────────────────────────────────────────

interface TeamConfig {
  order: string[]
  canRecreateTasks: Record<string, string>
  hasBuilder: boolean
}

interface ChatRequest {
  projectId: string
  userId: string
  content: string
  mode: 'no_skill' | 'skill' | 'team'
  activeSkillId?: string
  activeTeamId?: string
  teamConfig?: TeamConfig
}

interface ChatReply {
  id: string
  content: string
  sender: string
  mode: string
  activeSkillId: string | null
}

interface ChatResult {
  userMessage: ChatReply
  replies: ChatReply[]
}

// TeamRun state shape (stored as JSON in DB)
interface EtapaState {
  name: string
  objective: string
  members: { name: string; status: 'pending' | 'active' | 'done' | 'recreated'; redirectedTo?: string }[]
  status: 'pending' | 'active' | 'done'
}

// ── Sync entry (no_skill + skill) ──────────────────────────────────────────

export async function processChatSync(req: ChatRequest): Promise<ChatResult> {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { anthropicToken: true },
  })

  if (!user?.anthropicToken) {
    const userMsg = await saveMessage(req, 'user', req.content)
    const errMsg = await saveMessage(req, 'system', 'Connect your Claude API key first.')
    return { userMessage: userMsg, replies: [errMsg] }
  }

  const userMessage = await saveMessage(req, 'user', req.content)

  if (req.mode === 'skill') {
    return handleSkill(req, user.anthropicToken, userMessage)
  }
  return handleNoSkill(req, user.anthropicToken, userMessage)
}

// ── Async entry (team) ─────────────────────────────────────────────────────

export async function processChat(req: ChatRequest): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { anthropicToken: true },
  })

  if (!user?.anthropicToken) {
    await saveMessage(req, 'system', 'Connect your Claude API key first.')
    return
  }

  if (req.mode === 'team') {
    await handleTeam(req, user.anthropicToken)
  }
}

// ── No Skill ───────────────────────────────────────────────────────────────

async function handleNoSkill(req: ChatRequest, token: string, userMessage: ChatReply): Promise<ChatResult> {
  let content: string
  try {
    const result = await callAnthropic({
      encryptedToken: token,
      systemPrompt: 'You are a helpful AI assistant. Be concise and direct. If the user asks to build something, confirm first: ask which employee or team to use. Do NOT build without confirmation.',
      userMessage: req.content,
    })
    content = result.text
  } catch {
    content = 'Sorry, I encountered an error. Please try again.'
  }

  const reply = await saveMessage(req, 'claude', content)
  return { userMessage, replies: [reply] }
}

// ── Skill ──────────────────────────────────────────────────────────────────

async function handleSkill(req: ChatRequest, token: string, userMessage: ChatReply): Promise<ChatResult> {
  const skillId = req.activeSkillId
  if (!skillId || !SKILLS[skillId]) {
    const reply = await saveMessage(req, 'system', 'No employee selected.')
    return { userMessage, replies: [reply] }
  }

  const skill = SKILLS[skillId]
  let content: string
  try {
    const result = await callAnthropic({
      encryptedToken: token,
      systemPrompt: `${skill.systemPrompt}\n\nThis is a CONVERSATION only. Do NOT write code.`,
      userMessage: req.content,
    })
    content = result.text
    if (!content.startsWith(`${skill.name}:`)) content = `${skill.name}: ${content}`
  } catch {
    content = `${skill.name}: Sorry, error. Try again.`
  }

  const reply = await saveMessage(req, skill.name, content)
  return { userMessage, replies: [reply] }
}

// ── Team ───────────────────────────────────────────────────────────────────

async function handleTeam(req: ChatRequest, token: string): Promise<void> {
  const config = req.teamConfig
  if (!config || config.order.length === 0) {
    await saveMessage(req, 'system', 'No team configuration provided.')
    return
  }

  const orderedMembers = config.order
    .filter((id) => id !== 'builder')
    .map((id) => SKILLS[id])
    .filter((s): s is NonNullable<typeof s> => !!s)

  if (orderedMembers.length === 0) {
    await saveMessage(req, 'system', 'Team has no conversation members.')
    return
  }

  // Create TeamRun record
  const teamRun = await prisma.teamRun.create({
    data: {
      projectId: req.projectId,
      userId: req.userId,
      teamConfigJson: JSON.parse(JSON.stringify(config)),
      userMessage: req.content,
      status: 'running',
    },
  })

  try {
    // ── Step 1: Create the etapas plan ─────────────────────────────────

    let etapas: { name: string; objective: string }[] = []
    try {
      const planResult = await callAnthropic({
        encryptedToken: token,
        systemPrompt: `You analyze requests and break them into execution stages for maximum precision.

If complex (multiple parts, large scope): split into as many stages as needed (up to 5) for maximum quality.
If simple (one question, one topic): use 1 stage.

Each stage must have a clear, specific objective that can be independently analyzed.

Respond ONLY in JSON:
{"etapas":[{"name":"Stage name","objective":"Specific objective for this stage"}]}`,
        userMessage: req.content,
      })
      try {
        const parsed = JSON.parse(planResult.text)
        etapas = parsed.etapas ?? [{ name: 'Analysis', objective: req.content }]
      } catch {
        etapas = [{ name: 'Analysis', objective: req.content }]
      }
    } catch {
      etapas = [{ name: 'Analysis', objective: req.content }]
    }

    // Build initial state
    const memberNames = orderedMembers.map((m) => m.name)
    const initialState: EtapaState[] = etapas.map((e) => ({
      name: e.name,
      objective: e.objective,
      members: memberNames.map((n) => ({ name: n, status: 'pending' as const })),
      status: 'pending' as const,
    }))

    // Save plan to TeamRun and as message
    const planData = {
      etapas: etapas.map((e) => ({ name: e.name, objective: e.objective, members: memberNames })),
    }
    await prisma.teamRun.update({
      where: { id: teamRun.id },
      data: { plan: JSON.parse(JSON.stringify(planData)), state: JSON.parse(JSON.stringify(initialState)) },
    })
    await saveMessage(req, 'plan', JSON.stringify(planData))

    // ── Step 2: Execute each etapa ─────────────────────────────────────

    let previousEtapaResult = ''
    const state = initialState

    for (let ei = 0; ei < etapas.length; ei++) {
      const etapa = etapas[ei]
      state[ei].status = 'active'
      await updateTeamRunState(teamRun.id, state)

      let previousOutput = etapa.objective
      if (previousEtapaResult) {
        previousOutput = `Context from previous stage: ${previousEtapaResult}\n\nCurrent stage objective: ${etapa.objective}`
      }

      let restartCount = 0
      const MAX_RESTARTS = 2

      for (let i = 0; i < orderedMembers.length; i++) {
        const member = orderedMembers[i]
        const memberId = member.name.toLowerCase()

        // Update state: mark active
        state[ei].members[i].status = 'active'
        await updateTeamRunState(teamRun.id, state)

        const canRecreate = !!config.canRecreateTasks[memberId]

        const teamContext = `STAGE: "${etapa.name}"
OBJECTIVE: ${etapa.objective}
${previousEtapaResult ? `PREVIOUS STAGE RESULT: ${previousEtapaResult}` : ''}

Previous team member said:
${previousOutput}

${canRecreate
  ? 'You can REJECT if critical issues. Start with "REJECT:" and explain. Otherwise "APPROVED:" with analysis.'
  : 'Analyze and pass conclusions to next member. Be specific.'
}

CONVERSATION only. Do NOT write code.`

        let content: string
        try {
          const result = await callAnthropic({
            encryptedToken: token,
            systemPrompt: `${member.systemPrompt}\n\n${teamContext}`,
            userMessage: previousOutput,
          })
          content = result.text
          if (!content.startsWith(`${member.name}:`)) content = `${member.name}: ${content}`
        } catch {
          content = `${member.name}: [Error]`
        }

        await saveMessage(req, member.name, content)

        // Update state: mark done
        state[ei].members[i].status = 'done'
        await updateTeamRunState(teamRun.id, state)

        // Check rejection
        if (canRecreate && content.toUpperCase().includes('REJECT:') && restartCount < MAX_RESTARTS) {
          state[ei].members[i].status = 'recreated'

          const redirectToId = config.canRecreateTasks[memberId]
          const redirectToIndex = orderedMembers.findIndex((m) => m.name.toLowerCase() === redirectToId)
          const restartIndex = redirectToIndex !== -1 ? redirectToIndex : 0
          const redirectToName = orderedMembers[restartIndex]?.name ?? orderedMembers[0].name

          state[ei].members[i].redirectedTo = redirectToName

          // Add new members for restart
          for (let j = restartIndex; j < orderedMembers.length; j++) {
            state[ei].members.push({ name: orderedMembers[j].name, status: 'pending' })
          }

          await updateTeamRunState(teamRun.id, state)
          await saveMessage(req, 'system', `${member.name} rejected. Redirected to ${redirectToName}.`)

          previousOutput = `REJECTED by ${member.name}: ${content}\n\nRe-analyze with this feedback.`
          i = restartIndex - 1
          restartCount++
          continue
        }

        previousOutput = content
      }

      state[ei].status = 'done'
      await updateTeamRunState(teamRun.id, state)
      previousEtapaResult = previousOutput
    }

    // ── Step 3: Conclusion ─────────────────────────────────────────────

    let conclusion: string
    try {
      const conclusionResult = await callAnthropic({
        encryptedToken: token,
        systemPrompt: 'Summarize the team discussion. Highlight key decisions, action items, and concerns. Start with "Team Conclusion:"',
        userMessage: `Original request: ${req.content}\n\nFinal result: ${previousEtapaResult}`,
      })
      conclusion = conclusionResult.text
      if (!conclusion.startsWith('Team Conclusion:')) conclusion = `Team Conclusion: ${conclusion}`
    } catch {
      conclusion = 'Team Conclusion: Discussion complete.'
    }

    await saveMessage(req, 'team', conclusion)
    await prisma.teamRun.update({
      where: { id: teamRun.id },
      data: { status: 'completed' },
    })

  } catch (err) {
    console.error('[chat-engine] Team run failed:', err)
    await prisma.teamRun.update({
      where: { id: teamRun.id },
      data: { status: 'failed' },
    })
    await saveMessage(req, 'system', 'Team processing failed. Please try again.')
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function updateTeamRunState(teamRunId: string, state: EtapaState[]): Promise<void> {
  await prisma.teamRun.update({
    where: { id: teamRunId },
    data: { state: JSON.parse(JSON.stringify(state)) },
  })
}

async function saveMessage(req: ChatRequest, sender: string, content: string): Promise<ChatReply> {
  const msg = await prisma.chatMessage.create({
    data: {
      projectId: req.projectId,
      userId: req.userId,
      content,
      sender,
      mode: req.mode,
      activeSkillId: req.activeSkillId ?? null,
    },
    select: { id: true, content: true, sender: true, mode: true, activeSkillId: true },
  })
  return msg
}
