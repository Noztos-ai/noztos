'use client'

import { useState, useEffect, useRef } from 'react'

// ── Types ──────────────────────────────────────────────────────────────────

interface FileEntry {
  id: string
  path: string
  isModified: boolean
  sizeBytes: number
}

interface HiredEmployee {
  id: string
  name: string
  color: string
  role: string
}

interface TeamInfo {
  id: string
  name: string
  memberIds: string[]
  hasBuilder: boolean
  order: string[]
  canRecreateTasks: Record<string, string>
}

interface Message {
  id: string
  content: string
  sender: string
  mode: string
  activeSkillId: string | null
  createdAt: string
}

type ChatMode = 'no_skill' | 'skill' | 'team'

interface WorkPanelProps {
  projectId: string
  initialMessages: Message[]
  hiredEmployees: HiredEmployee[]
  teams: TeamInfo[]
}

export function WorkPanel({ projectId, initialMessages, hiredEmployees, teams }: WorkPanelProps) {
  const [activeMode, setActiveMode] = useState<ChatMode>('no_skill')
  const [activeSkillId, setActiveSkillId] = useState<string | null>(null)
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null)
  const [chatMessages, setChatMessages] = useState<Message[]>(initialMessages)
  const [teamRunState, setTeamRunState] = useState<unknown>(null)
  const [teamRunActive, setTeamRunActive] = useState(false)

  const activeEmployee = hiredEmployees.find((e) => e.id === activeSkillId)
  const activeTeam = teams.find((t) => t.id === activeTeamId)

  // On mount: check if there's an active team run and restore state
  useEffect(() => {
    fetch(`/api/projects/${projectId}/team-run`)
      .then((r) => r.json())
      .then((data) => {
        if (data.active && data.lastRun) {
          setTeamRunState(data.lastRun.state)
          setTeamRunActive(true)
          setActiveMode('team')
        } else if (data.lastRun?.status === 'completed' || data.lastRun?.status === 'failed' || data.lastRun?.status === 'timed_out') {
          setTeamRunState(data.lastRun.state)
          setTeamRunActive(false)
        }
      })
      .catch(() => {})
  }, [projectId])

  // Listen for team run state updates from polling
  useEffect(() => {
    function handleUpdate(e: Event) {
      const detail = (e as CustomEvent).detail
      if (detail) {
        setTeamRunState(detail)
        setTeamRunActive(true)
      }
    }
    window.addEventListener('teamrun-update', handleUpdate)
    return () => window.removeEventListener('teamrun-update', handleUpdate)
  }, [])

  function handleSelectEmployee(emp: HiredEmployee) {
    setActiveMode('skill')
    setActiveSkillId(emp.id)
    setActiveTeamId(null)
  }

  function handleSelectTeam(team: TeamInfo) {
    setActiveMode('team')
    setActiveTeamId(team.id)
    setActiveSkillId(null)
  }

  function handleClearSelection() {
    setActiveMode('no_skill')
    setActiveSkillId(null)
    setActiveTeamId(null)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: File tree */}
      <div className="flex w-[35%] shrink-0">
        <FileTree projectId={projectId} />
      </div>

      {/* Center: Chat */}
      <div className="flex flex-1">
        <ChatPanel
          projectId={projectId}
          messages={chatMessages}
          setMessages={setChatMessages}
          activeMode={activeMode}
          activeSkillId={activeSkillId}
          activeTeamId={activeTeamId}
          activeEmployee={activeEmployee}
          activeTeam={activeTeam}
          hiredEmployees={hiredEmployees}
          teams={teams}
          onSelectEmployee={handleSelectEmployee}
          onSelectTeam={handleSelectTeam}
          onClearSelection={handleClearSelection}
        />
      </div>

      {/* Right: Mini map */}
      <MiniMap
        activeMode={activeMode}
        activeEmployee={activeEmployee}
        activeTeam={activeTeam}
        messages={chatMessages}
        hiredEmployees={hiredEmployees}
        teamRunState={teamRunState}
        teamRunActive={teamRunActive}
      />
    </div>
  )
}

// ── File Tree ──────────────────────────────────────────────────────────────

function FileTree({ projectId }: { projectId: string }) {
  const [files, setFiles] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/projects/${projectId}/repository/files`)
      .then((r) => r.json())
      .then((data) => { setFiles(data.files ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectId])

  const modifiedFiles = files.filter((f) => f.isModified)
  const tree = buildTree(files)

  return (
    <div className="flex w-full flex-col border-r border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-200 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Explorer</span>
        {modifiedFiles.length > 0 && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            {modifiedFiles.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {loading ? (
          <p className="px-3 py-2 text-xs text-zinc-400">Loading...</p>
        ) : files.length === 0 ? (
          <p className="px-3 py-2 text-xs text-zinc-400">No files</p>
        ) : (
          <TreeNode node={tree} depth={0} selectedPath={selectedPath} onSelect={setSelectedPath} />
        )}
      </div>
    </div>
  )
}

// ── Tree helpers ───────────────────────────────────────────────────────────

interface TreeNodeData { name: string; path: string; isFile: boolean; isModified: boolean; children: TreeNodeData[] }

function buildTree(files: FileEntry[]): TreeNodeData {
  const root: TreeNodeData = { name: '', path: '', isFile: false, isModified: false, children: [] }
  for (const file of files) {
    const parts = file.path.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1
      let child = current.children.find((c) => c.name === part)
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join('/'), isFile: isLast, isModified: isLast ? file.isModified : false, children: [] }
        current.children.push(child)
      }
      current = child
    }
  }
  function sortNode(node: TreeNodeData) {
    node.children.sort((a, b) => { if (a.isFile !== b.isFile) return a.isFile ? 1 : -1; return a.name.localeCompare(b.name) })
    node.children.forEach(sortNode)
  }
  sortNode(root)
  return root
}

function TreeNode({ node, depth, selectedPath, onSelect }: { node: TreeNodeData; depth: number; selectedPath: string | null; onSelect: (p: string) => void }) {
  const [expanded, setExpanded] = useState(depth < 2)
  return (
    <>
      {node.children.map((child) => (
        <div key={child.path}>
          {child.isFile ? (
            <button
              onClick={() => onSelect(child.path)}
              className={`flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs hover:bg-zinc-100 ${selectedPath === child.path ? 'bg-zinc-100 text-zinc-900' : ''}`}
              style={{ paddingLeft: `${depth * 12 + 8}px` }}
            >
              {child.isModified && <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />}
              <span className={child.isModified ? 'text-amber-600' : 'text-zinc-600'}>{child.name}</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex w-full items-center gap-1 px-2 py-0.5 text-left text-xs text-zinc-700 hover:bg-zinc-100"
                style={{ paddingLeft: `${depth * 12 + 8}px` }}
              >
                <svg className={`h-3 w-3 shrink-0 text-zinc-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                {child.name}
              </button>
              {expanded && <TreeNode node={child} depth={depth + 1} selectedPath={selectedPath} onSelect={onSelect} />}
            </>
          )}
        </div>
      ))}
    </>
  )
}

// ── Chat Panel ─────────────────────────────────────────────────────────────

function ChatPanel({
  projectId,
  messages,
  setMessages,
  activeMode,
  activeSkillId,
  activeTeamId,
  activeEmployee,
  activeTeam,
  hiredEmployees,
  teams,
  onSelectEmployee,
  onSelectTeam,
  onClearSelection,
}: {
  projectId: string
  messages: Message[]
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>
  activeMode: ChatMode
  activeSkillId: string | null
  activeTeamId: string | null
  activeEmployee?: HiredEmployee
  activeTeam?: TeamInfo
  hiredEmployees: HiredEmployee[]
  teams: TeamInfo[]
  onSelectEmployee: (e: HiredEmployee) => void
  onSelectTeam: (t: TeamInfo) => void
  onClearSelection: () => void
}) {
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showSelector, setShowSelector] = useState(false)
  const [selectorTab, setSelectorTab] = useState<'employees' | 'teams'>('employees')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const [slashFilter, setSlashFilter] = useState('')
  const [slashMatch, setSlashMatch] = useState<HiredEmployee | TeamInfo | null>(null)
  const [openedViaButton, setOpenedViaButton] = useState(false)

  // Detect / at the START of input
  useEffect(() => {
    // Only trigger slash behavior if / is at position 0
    if (input.startsWith('/') && input.indexOf('/') === 0) {
      const filter = input.slice(1).toLowerCase().trim()
      setSlashFilter(filter)

      const allNames = [
        ...hiredEmployees.map((e) => e.name.toLowerCase()),
        ...teams.map((t) => t.name.toLowerCase()),
      ]
      const hasMatch = filter === '' || allNames.some((n) => n.includes(filter))

      // Check for exact match — auto-select immediately
      const exactEmp = hiredEmployees.find((e) => e.name.toLowerCase() === filter)
      const exactTeam = teams.find((t) => t.name.toLowerCase() === filter)

      if (exactEmp) {
        onSelectEmployee(exactEmp)
        setShowSelector(false)
        setSlashFilter('')
        setSlashMatch(null)
        setOpenedViaButton(false)
        // Remove the /name from input, keep anything after
        const rest = input.slice(1 + exactEmp.name.length).trimStart()
        setInput(rest)
        return
      }
      if (exactTeam) {
        onSelectTeam(exactTeam)
        setShowSelector(false)
        setSlashFilter('')
        setSlashMatch(null)
        setOpenedViaButton(false)
        const rest = input.slice(1 + exactTeam.name.length).trimStart()
        setInput(rest)
        return
      }

      setSlashMatch(null)

      if (hasMatch) {
        setShowSelector(true)
      } else {
        setShowSelector(false)
        setSlashFilter('')
      }
    } else if (!openedViaButton) {
      if (slashFilter !== '') setSlashFilter('')
      if (slashMatch) setSlashMatch(null)
    }
  }, [input])

  const [teamProcessing, setTeamProcessing] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current) }
  }, [])

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    const content = input.trim()
    if (!content || sending || teamProcessing) return

    const userMsg: Message = {
      id: `temp-${Date.now()}`,
      content,
      sender: 'user',
      mode: activeMode,
      activeSkillId: activeSkillId,
      createdAt: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setSending(true)

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          mode: activeMode,
          activeSkillId: activeSkillId ?? undefined,
          activeTeamId: activeTeamId ?? undefined,
          teamConfig: activeTeam ? {
            order: activeTeam.order,
            canRecreateTasks: activeTeam.canRecreateTasks,
            hasBuilder: activeTeam.hasBuilder,
          } : undefined,
        }),
      })

      if (res.ok) {
        const data = await res.json()

        if (data.processing) {
          // Team mode — start polling for new messages
          setTeamProcessing(true)
          setSending(false)
          const pollAfter = new Date().toISOString()
          const seenIds = new Set<string>()
          const pollStartTime = Date.now()
          const POLL_TIMEOUT = 5 * 60 * 1000 // 5 minutes

          pollingRef.current = setInterval(async () => {
            // Timeout check
            if (Date.now() - pollStartTime > POLL_TIMEOUT) {
              if (pollingRef.current) clearInterval(pollingRef.current)
              pollingRef.current = null
              setTeamProcessing(false)
              setMessages((prev) => [...prev, {
                id: `timeout-${Date.now()}`,
                content: 'Team processing timed out. Please try again.',
                sender: 'system',
                mode: 'team',
                activeSkillId: null,
                createdAt: new Date().toISOString(),
              }])
              return
            }

            try {
              // Poll for new chat messages
              const pollRes = await fetch(`/api/projects/${projectId}/chat/status?after=${pollAfter}`)
              if (pollRes.ok) {
                const pollData = await pollRes.json()

                // Filter: show employee responses in chat, keep plan/step for mini map
                const allNewMsgs = (pollData.messages ?? []).filter((m: Message) => {
                  if (seenIds.has(m.id) || m.sender === 'user') return false
                  seenIds.add(m.id)
                  return true
                })

                // Add all to messages (mini map reads plan/step, chat filters them out)
                if (allNewMsgs.length > 0) {
                  setMessages((prev) => [...prev, ...allNewMsgs.map((m: Message) => ({
                    ...m,
                    createdAt: m.createdAt ?? new Date().toISOString(),
                  }))])
                }

                // Also poll TeamRun state for mini map
                const runRes = await fetch(`/api/projects/${projectId}/team-run`)
                if (runRes.ok) {
                  const runData = await runRes.json()
                  if (runData.lastRun?.state) {
                    // Update parent state via a custom event (will be picked up by WorkPanel)
                    window.dispatchEvent(new CustomEvent('teamrun-update', { detail: runData.lastRun.state }))
                  }
                }

                // Check if team is done
                const isDone = allNewMsgs.some((m: Message) => m.sender === 'team')
                if (isDone) {
                  if (pollingRef.current) clearInterval(pollingRef.current)
                  pollingRef.current = null
                  setTeamProcessing(false)
                }
              }
            } catch { /* ignore polling errors */ }
          }, 1500)

          return
        }

        // Sync mode (no_skill / skill)
        if (data.replies) {
          const newMsgs = data.replies.map((r: ChatReplyRaw) => ({
            id: r.id,
            content: r.content,
            sender: r.sender,
            mode: r.mode,
            activeSkillId: r.activeSkillId,
            createdAt: new Date().toISOString(),
          }))
          setMessages((prev) => [...prev, ...newMsgs])
        }
      }
    } catch { /* ignore */ }
    setSending(false)
  }

  const hasAnyone = hiredEmployees.length > 0 || teams.length > 0

  // Get color for sender
  function getSenderColor(sender: string): string {
    const emp = hiredEmployees.find((e) => e.name === sender)
    if (emp) return emp.color
    if (sender === 'Builder') return 'from-red-600 to-red-700'
    return ''
  }

  return (
    <div className="flex flex-1 flex-col border-r border-zinc-200 bg-zinc-50">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-zinc-400">Send a message or type <strong>/</strong> to select a skill</p>
          </div>
        )}
        {messages.filter((msg) => msg.sender !== 'plan' && msg.sender !== 'step').map((msg) => (
          <div key={msg.id} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
              msg.sender === 'user'
                ? 'bg-zinc-800 text-white'
                : msg.sender === 'system'
                ? 'bg-amber-50 border border-amber-200 text-amber-800 text-xs italic'
                : 'bg-white border border-zinc-200 text-zinc-700'
            }`}>
              {msg.sender !== 'user' && msg.sender !== 'system' && msg.sender !== 'claude' && (
                <div className="mb-1 flex items-center gap-1.5">
                  <span className={`inline-block rounded bg-gradient-to-br ${getSenderColor(msg.sender)} px-1.5 py-0.5 text-[9px] font-bold text-white`}>
                    {msg.sender}
                  </span>
                </div>
              )}
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {teamProcessing && (
          <div className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2">
            <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            <p className="text-xs text-zinc-500">Team is working...</p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area with selector */}
      <div className="relative shrink-0 border-t border-zinc-200 bg-white">
        {/* Selector popup — opens ABOVE the input */}
        {showSelector && (
          <div className="absolute bottom-full left-0 right-0 z-10 border-t border-zinc-200 bg-white p-3 shadow-lg">
            {!hasAnyone ? (
              <p className="text-xs text-zinc-500">No employees or teams yet. Go to <strong>My Team</strong> to hire and create teams.</p>
            ) : (
              <>
                <div className="mb-2 flex gap-2">
                  <button
                    onClick={() => setSelectorTab('employees')}
                    className={`rounded px-2 py-1 text-[10px] font-medium ${selectorTab === 'employees' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-600'}`}
                  >
                    Employees
                  </button>
                  <button
                    onClick={() => setSelectorTab('teams')}
                    className={`rounded px-2 py-1 text-[10px] font-medium ${selectorTab === 'teams' ? 'bg-zinc-800 text-white' : 'bg-zinc-100 text-zinc-600'}`}
                  >
                    Teams
                  </button>
                </div>

                {selectorTab === 'employees' && (() => {
                  const filtered = hiredEmployees.filter((e) => !slashFilter || e.name.toLowerCase().includes(slashFilter))
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      {filtered.length === 0 ? (
                        <p className="text-xs text-zinc-400">{hiredEmployees.length === 0 ? 'No employees hired yet.' : 'No match.'}</p>
                      ) : (
                        filtered.map((emp) => (
                          <button
                            key={emp.id}
                            onClick={() => { onSelectEmployee(emp); setShowSelector(false); setInput(''); setSlashFilter('') }}
                            className={`rounded-lg bg-gradient-to-br ${emp.color} px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-transform hover:scale-105`}
                          >
                            {emp.name}
                          </button>
                        ))
                      )}
                    </div>
                  )
                })()}

                {selectorTab === 'teams' && (() => {
                  const filtered = teams.filter((t) => !slashFilter || t.name.toLowerCase().includes(slashFilter))
                  return (
                    <div className="space-y-1.5">
                      {filtered.length === 0 ? (
                        <p className="text-xs text-zinc-400">{teams.length === 0 ? 'No teams created yet.' : 'No match.'}</p>
                      ) : (
                        filtered.map((team) => (
                          <button
                            key={team.id}
                            onClick={() => { onSelectTeam(team); setShowSelector(false); setInput(''); setSlashFilter('') }}
                            className="flex w-full items-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-left transition-colors hover:bg-zinc-700"
                          >
                            <span className="text-xs font-semibold text-white">{team.name}</span>
                            <span className="text-[10px] text-zinc-400">{team.order.length} members</span>
                            {!team.hasBuilder && (
                              <span className="rounded bg-amber-500/20 px-1 py-0.5 text-[9px] text-amber-400">no builder</span>
                            )}
                          </button>
                        ))
                      )}
                    </div>
                  )
                })()}
              </>
            )}
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={sendMessage} className="p-3">
          <div className="flex items-end gap-2">
            <div className="flex flex-1 flex-col rounded-xl border border-zinc-300 bg-white focus-within:border-zinc-500">
              {/* Active skill badge row */}
              {activeMode !== 'no_skill' && (
                <div className="flex items-center gap-1.5 px-3 pt-2.5">
                  {activeMode === 'skill' && activeEmployee && (
                    <div className="flex items-center gap-1">
                      <span className={`rounded bg-gradient-to-br ${activeEmployee.color} px-2 py-0.5 text-[10px] font-semibold text-white`}>
                        {activeEmployee.name}
                      </span>
                      <button type="button" onClick={onClearSelection} className="text-zinc-400 hover:text-zinc-600">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                  {activeMode === 'team' && activeTeam && (
                    <div className="flex items-center gap-1">
                      <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold text-white">
                        {activeTeam.name}
                      </span>
                      <button type="button" onClick={onClearSelection} className="text-zinc-400 hover:text-zinc-600">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Input row with / button inside */}
              <div className="flex items-center px-2 py-2">
                <button
                  type="button"
                  onClick={() => { setShowSelector(!showSelector); setOpenedViaButton(!showSelector) }}
                  className="mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-zinc-100 text-xs font-bold text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-700"
                >
                  /
                </button>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={activeMode === 'team' ? `Message ${activeTeam?.name ?? 'team'}...` : activeMode === 'skill' ? `Message ${activeEmployee?.name ?? 'employee'}...` : 'Message Claude...'}
                  disabled={sending || teamProcessing}
                  className="flex-1 bg-transparent px-1 py-1 text-sm text-zinc-800 placeholder-zinc-400 outline-none disabled:opacity-50"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={sending || teamProcessing || !input.trim()}
              className="flex h-[46px] items-center justify-center rounded-xl bg-zinc-800 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-30"
            >
              {sending ? '...' : teamProcessing ? 'Working...' : 'Send'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

interface ChatReplyRaw {
  id: string
  content: string
  sender: string
  mode: string
  activeSkillId: string | null
}

// ── Mini Map (right panel) ─────────────────────────────────────────────────

interface EtapaPlan {
  name: string
  objective: string
  members: string[]
}

interface EtapaState {
  name: string
  objective: string
  members: { name: string; status: 'pending' | 'active' | 'done' | 'recreated'; redirectedTo?: string }[]
  status: 'pending' | 'active' | 'done'
}

function MiniMap({
  activeMode,
  activeEmployee,
  activeTeam,
  messages,
  hiredEmployees,
  teamRunState,
  teamRunActive,
}: {
  activeMode: ChatMode
  activeEmployee?: HiredEmployee
  activeTeam?: TeamInfo
  messages: Message[]
  hiredEmployees: HiredEmployee[]
  teamRunState: unknown
  teamRunActive: boolean
}) {
  function getColor(name: string): string {
    const emp = hiredEmployees.find((e) => e.name === name)
    if (emp) return emp.color
    if (name === 'Builder') return 'from-red-600 to-red-700'
    return 'from-zinc-500 to-zinc-600'
  }

  // Build etapas state from TeamRun DB state (persisted) or from messages (live)
  function buildEtapasFromMessages(): EtapaState[] {
    // First try to use the persisted TeamRun state (survives page reload)
    if (teamRunState && Array.isArray(teamRunState) && teamRunState.length > 0) {
      return teamRunState as EtapaState[]
    }

    // Fallback: build from plan messages (live session)
    const planMsg = messages.find((m) => m.sender === 'plan' && m.mode === 'team')
    if (!planMsg) return []

    let plan: { etapas: EtapaPlan[] }
    try {
      plan = JSON.parse(planMsg.content)
    } catch {
      return []
    }

    // Parse step messages
    const stepMsgs = messages.filter((m) => m.sender === 'step' && m.mode === 'team')
    const steps: { type: string; etapaIndex: number; employeeName?: string; etapaName?: string; rejectedBy?: string; redirectedTo?: string }[] = []
    for (const msg of stepMsgs) {
      try { steps.push(JSON.parse(msg.content)) } catch { /* skip */ }
    }

    return plan.etapas.map((etapa, ei) => {
      const etapaStarted = steps.some((s) => s.type === 'etapa_start' && s.etapaIndex === ei)
      const etapaDone = steps.some((s) => s.type === 'etapa_done' && s.etapaIndex === ei)

      const members = etapa.members.map((name) => {
        const employeeDone = steps.some((s) => s.type === 'employee_done' && s.etapaIndex === ei && s.employeeName === name)
        const employeeActive = steps.some((s) => s.type === 'employee_start' && s.etapaIndex === ei && s.employeeName === name) && !employeeDone
        const rejection = steps.find((s) => s.type === 'rejection' && s.etapaIndex === ei && s.rejectedBy === name)

        let status: 'pending' | 'active' | 'done' | 'recreated' = 'pending'
        if (rejection) status = 'recreated'
        else if (employeeDone) status = 'done'
        else if (employeeActive) status = 'active'

        return { name, status, redirectedTo: rejection?.redirectedTo }
      })

      let etapaStatus: 'pending' | 'active' | 'done' = 'pending'
      if (etapaDone) etapaStatus = 'done'
      else if (etapaStarted) etapaStatus = 'active'

      return { name: etapa.name, objective: etapa.objective, members, status: etapaStatus }
    })
  }

  const etapasState = activeMode === 'team' ? buildEtapasFromMessages() : []
  const isDone = messages.some((m) => m.sender === 'team' && m.mode === 'team')
  const hasPlan = messages.some((m) => m.sender === 'plan' && m.mode === 'team')

  const statusDot: Record<string, string> = {
    pending: 'bg-zinc-300',
    active: 'bg-blue-500 animate-pulse',
    done: 'bg-emerald-500',
    recreated: 'bg-amber-500',
  }

  return (
    <div className="flex w-72 shrink-0 flex-col bg-white">
      <div className="border-b border-zinc-200 px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
          {activeMode === 'team' ? 'Pipeline' : activeMode === 'skill' ? 'Active' : 'Status'}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {/* No skill */}
        {activeMode === 'no_skill' && (
          <div className="flex h-full items-center justify-center">
            <p className="px-3 text-center text-xs text-zinc-400">Select an employee or team with /</p>
          </div>
        )}

        {/* Skill mode */}
        {activeMode === 'skill' && activeEmployee && (
          <div className="px-3 py-2">
            <div className={`rounded-lg bg-gradient-to-br ${activeEmployee.color} px-3 py-3 shadow-sm`}>
              <p className="text-xs font-bold text-white">{activeEmployee.name}</p>
              <p className="text-[9px] text-white/60">{activeEmployee.role}</p>
            </div>
          </div>
        )}

        {/* Team mode — etapas with sub-pipelines */}
        {activeMode === 'team' && etapasState.length > 0 && (
          <div className="px-2 py-2 space-y-3">
            {isDone && (
              <div className="mx-1 flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <p className="text-[10px] font-medium text-emerald-700">All stages complete</p>
              </div>
            )}
            {etapasState.map((etapa, ei) => (
              <div key={ei} className={`rounded-lg border px-2 py-2 ${
                etapa.status === 'active' ? 'border-blue-300 bg-blue-50/30' :
                etapa.status === 'done' ? 'border-emerald-200 bg-emerald-50/20' :
                'border-zinc-200 bg-zinc-50/50'
              }`}>
                {/* Etapa header */}
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[8px] font-bold ${
                    etapa.status === 'done' ? 'bg-emerald-500 text-white' :
                    etapa.status === 'active' ? 'bg-blue-500 text-white' :
                    'bg-zinc-300 text-zinc-600'
                  }`}>
                    {etapa.status === 'done' ? '✓' : ei + 1}
                  </span>
                  <p className="text-[10px] font-semibold text-zinc-700 truncate">{etapa.name}</p>
                </div>

                {/* Members pipeline */}
                <div className="space-y-0.5 pl-1">
                  {etapa.members.map((member, mi) => (
                    <div key={`${member.name}-${mi}`} className="flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${statusDot[member.status]}`} />
                      <div className={`flex-1 rounded bg-gradient-to-br ${getColor(member.name)} px-1.5 py-0.5 ${
                        member.status === 'pending' ? 'opacity-25' : member.status === 'active' ? 'shadow-sm ring-1 ring-blue-400/40' : ''
                      }`}>
                        <p className="text-[8px] font-semibold text-white">{member.name}</p>
                        {member.status === 'recreated' && member.redirectedTo && (
                          <p className="text-[7px] text-amber-200">rejected → {member.redirectedTo}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Team mode — waiting for plan */}
        {activeMode === 'team' && !hasPlan && (activeTeam || teamRunActive) && (
          <div className="px-3 py-2 space-y-1">
            <div className="mb-2 flex items-center gap-1.5">
              {teamRunActive && <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />}
              <p className="text-[10px] text-zinc-400">{teamRunActive ? 'Team is working...' : 'Waiting for message...'}</p>
            </div>
            {(activeTeam?.order ?? []).filter((id) => id !== 'builder').map((id) => {
              const emp = hiredEmployees.find((e) => e.id === id)
              const name = emp?.name ?? id
              return (
                <div key={id} className={`rounded-md bg-gradient-to-br ${getColor(name)} px-2 py-1 opacity-25`}>
                  <p className="text-[9px] font-semibold text-white">{name}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
