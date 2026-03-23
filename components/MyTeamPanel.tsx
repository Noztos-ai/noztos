'use client'

import { useState, useCallback } from 'react'

interface Employee {
  id: string
  role: string
  name: string
  description: string
  color: string
}

const AVAILABLE_EMPLOYEES: Employee[] = [
  {
    id: 'ceo',
    role: 'Planner',
    name: 'CEO',
    description: 'Questions if it\'s the right problem. Challenges scope, finds risks, gives go/no-go decisions.',
    color: 'from-violet-500 to-purple-600',
  },
  {
    id: 'architect',
    role: 'Planner',
    name: 'Architect',
    description: 'Defines architecture, data flow, component breakdown. Your technical blueprint before any code.',
    color: 'from-blue-500 to-cyan-600',
  },
  {
    id: 'designer',
    role: 'Planner',
    name: 'Designer',
    description: 'Reviews UI/UX, catches AI slop, ensures hierarchy and interaction states are solid.',
    color: 'from-pink-500 to-rose-600',
  },
  {
    id: 'security',
    role: 'Reviewer',
    name: 'Security',
    description: 'OWASP Top 10, STRIDE threat modeling. Finds vulnerabilities before they reach production.',
    color: 'from-red-500 to-orange-600',
  },
]

const BUILDER_EMPLOYEE: Employee = {
  id: 'builder',
  role: 'Builder',
  name: 'Builder',
  description: 'Writes the code. Executes the plan, edits files, creates features.',
  color: 'from-red-600 to-red-700',
}

function getEmployee(id: string): Employee | undefined {
  if (id === 'builder') return BUILDER_EMPLOYEE
  return AVAILABLE_EMPLOYEES.find((e) => e.id === id)
}

// ── Team type ──────────────────────────────────────────────────────────────

interface Team {
  name: string
  memberIds: string[]
  hasBuilder: boolean
  order: string[]
  canRecreateTasks: Record<string, string> // employeeId → redirectTo employeeId
}

// ── Main Panel ─────────────────────────────────────────────────────────────

interface MyTeamPanelProps {
  projectId: string
  hiredIds: string[]
  onHire: (ids: string[]) => void
}

export function MyTeamPanel({ projectId, hiredIds, onHire }: MyTeamPanelProps) {
  const [showHireModal, setShowHireModal] = useState(false)
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])

  const hiredEmployees = AVAILABLE_EMPLOYEES.filter((e) => hiredIds.includes(e.id))
  const hasAnyHired = hiredEmployees.length > 0

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Left: Employees — 50% */}
      <div className="flex w-1/2 flex-col border-r border-zinc-300/60 bg-zinc-100 p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-800">Employees</h2>
          <button
            onClick={() => setShowHireModal(true)}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
          >
            + Hire
          </button>
        </div>

        {!hasAnyHired ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="rounded-full bg-zinc-200 p-4">
              <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-700">Hire your first employee</p>
              <p className="mt-1 text-xs text-zinc-400">Build your AI team to start working on code</p>
            </div>
            <button
              onClick={() => setShowHireModal(true)}
              className="rounded-full bg-zinc-800 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Hire employees
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <EmployeeCard employee={BUILDER_EMPLOYEE} isAutomatic />
            {hiredEmployees.map((emp) => (
              <EmployeeCard key={emp.id} employee={emp} />
            ))}
          </div>
        )}
      </div>

      {/* Right: Teams — 50% */}
      <div className="flex w-1/2 flex-col bg-zinc-50 p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-800">My Teams</h2>
          <button
            onClick={() => setShowTeamModal(true)}
            className="rounded-lg bg-zinc-800 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
          >
            + Create
          </button>
        </div>

        {teams.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-4">
            <div className="rounded-full bg-zinc-200 p-4">
              <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-zinc-700">Create your first team</p>
              <p className="mt-1 text-xs text-zinc-400">Organize employees into teams with execution order</p>
            </div>
            <button
              onClick={() => setShowTeamModal(true)}
              className="rounded-full bg-zinc-800 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Create team
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {teams.map((team, i) => (
              <TeamCard key={i} team={team} />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showHireModal && (
        <HiringModal
          hiredIds={hiredIds}
          onConfirm={(ids) => { onHire(ids); setShowHireModal(false) }}
          onClose={() => setShowHireModal(false)}
        />
      )}
      {showTeamModal && (
        <TeamBuilderModal
          hiredIds={hiredIds}
          onConfirm={(team) => { setTeams((prev) => [...prev, team]); setShowTeamModal(false) }}
          onClose={() => setShowTeamModal(false)}
        />
      )}
    </div>
  )
}

// ── Employee Card ──────────────────────────────────────────────────────────

function EmployeeCard({ employee, isAutomatic }: { employee: Employee; isAutomatic?: boolean }) {
  return (
    <div className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${employee.color} px-3 py-2.5 shadow-sm`}>
      {isAutomatic && (
        <span className="absolute right-2 top-2 rounded bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-white/80">
          auto
        </span>
      )}
      <p className="text-sm font-bold text-white">{employee.name}</p>
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/60">{employee.role}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-white/80">{employee.description}</p>
    </div>
  )
}

// ── Mini Employee Card (for small displays) ────────────────────────────────

function MiniCard({ employee, highlight }: { employee: Employee; highlight?: boolean }) {
  return (
    <div className={`rounded-lg bg-gradient-to-br ${employee.color} px-3 py-2 shadow-sm ${highlight ? 'ring-2 ring-white/50' : ''}`}>
      <p className="text-xs font-bold text-white">{employee.name}</p>
      <p className="text-[9px] text-white/60">{employee.role}</p>
    </div>
  )
}

// ── Team Card (right side) ─────────────────────────────────────────────────

function TeamCard({ team }: { team: Team }) {
  return (
    <div className="overflow-hidden rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-bold text-white">{team.name}</p>
        <span className="rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium text-zinc-400">{team.order.length} members</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {team.order.map((id, i) => {
          const emp = getEmployee(id)
          if (!emp) return null
          return (
            <div key={id} className="flex items-center gap-1">
              <span className={`rounded-md bg-gradient-to-br ${emp.color} px-2 py-1 text-[10px] font-semibold text-white shadow-sm`}>
                {emp.name}
              </span>
              {i < team.order.length - 1 && (
                <svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              )}
            </div>
          )
        })}
      </div>
      {Object.keys(team.canRecreateTasks).length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-2">
          {Object.entries(team.canRecreateTasks).map(([fromId, toId]) => {
            const from = getEmployee(fromId)
            const to = getEmployee(toId)
            return (
              <p key={fromId} className="text-[10px] text-zinc-500">
                {from?.name} can reject → restarts from {to?.name}
              </p>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Hiring Modal ───────────────────────────────────────────────────────────

function HiringModal({
  hiredIds,
  onConfirm,
  onClose,
}: {
  hiredIds: string[]
  onConfirm: (ids: string[]) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(hiredIds))

  function toggle(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">
        <h2 className="mb-1 text-xl font-semibold text-zinc-800">Hire Employees</h2>
        <p className="mb-6 text-sm text-zinc-500">Select who you want on your team. The Builder is hired automatically.</p>

        <div className="space-y-3">
          {AVAILABLE_EMPLOYEES.map((emp) => {
            const isSelected = selected.has(emp.id)
            return (
              <button
                key={emp.id}
                onClick={() => toggle(emp.id)}
                className={`flex w-full items-start gap-4 overflow-hidden rounded-xl border-2 bg-gradient-to-br ${emp.color} p-4 text-left transition-all ${
                  isSelected ? 'border-white/30 shadow-lg' : 'border-transparent opacity-70 hover:opacity-90'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white">{emp.name}</p>
                    <span className="rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/80">{emp.role}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-white/80">{emp.description}</p>
                </div>
                <div className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                  isSelected ? 'border-white bg-white/30' : 'border-white/40'
                }`}>
                  {isSelected && (
                    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => onConfirm([...selected])}
            className="flex h-10 flex-1 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Confirm ({selected.size} selected)
          </button>
          <button
            onClick={onClose}
            className="flex h-10 items-center justify-center rounded-full px-5 text-sm text-zinc-500 hover:text-zinc-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Team Builder Modal ─────────────────────────────────────────────────────

type TeamStep = 'select' | 'no-builder-warning' | 'order' | 'recreate'

function TeamBuilderModal({
  hiredIds,
  onConfirm,
  onClose,
}: {
  hiredIds: string[]
  onConfirm: (team: Team) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<TeamStep>('select')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [order, setOrder] = useState<string[]>([])
  const [canRecreateTasks, setCanRecreateTasks] = useState<Record<string, string>>({})
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [teamName, setTeamName] = useState('')

  const noHires = hiredIds.length === 0

  // All hired + builder in the selection list
  const selectableEmployees = noHires ? [] : [
    ...AVAILABLE_EMPLOYEES.filter((e) => hiredIds.includes(e.id)),
    BUILDER_EMPLOYEE,
  ]

  const hasBuilder = selectedIds.has('builder')

  function toggleSelect(id: string) {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  function handleContinueFromSelect() {
    if (selectedIds.size === 0 || !teamName.trim()) return
    if (!hasBuilder) {
      setStep('no-builder-warning')
    } else {
      setOrder([...selectedIds])
      setStep('order')
    }
  }

  function handleConfirmNoBuilder() {
    setOrder([...selectedIds])
    setStep('order')
  }

  function handleDragStart(index: number) {
    setDragIndex(index)
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const newOrder = [...order]
    const [dragged] = newOrder.splice(dragIndex, 1)
    newOrder.splice(index, 0, dragged)
    setOrder(newOrder)
    setDragIndex(index)
  }

  function handleDragEnd() {
    setDragIndex(null)
  }

  function toggleRecreate(id: string) {
    const next = { ...canRecreateTasks }
    if (next[id]) {
      delete next[id]
    } else {
      const first = order.find((o) => o !== id && o !== 'builder')
      next[id] = first ?? order[0]
    }
    setCanRecreateTasks(next)
  }

  function setRedirectTarget(fromId: string, toId: string) {
    setCanRecreateTasks((prev) => ({ ...prev, [fromId]: toId }))
  }

  function handleConfirm() {
    onConfirm({
      name: teamName || `Team ${Date.now().toString(36)}`,
      memberIds: [...selectedIds].filter((id) => id !== 'builder'),
      hasBuilder,
      order,
      canRecreateTasks,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl bg-white p-8 shadow-xl">

        {/* Step 1: Select members (including Builder) */}
        {step === 'select' && (
          <>
            <h2 className="mb-1 text-xl font-semibold text-zinc-800">Create Team</h2>
            <p className="mb-4 text-sm text-zinc-500">Select employees for this team.</p>

            {noHires ? (
              <>
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
                  <p className="text-sm font-medium text-amber-800">No employees hired yet</p>
                  <p className="mt-1 text-xs text-amber-700">You need to hire employees first before creating a team. Go to the Employees section and hire your team.</p>
                </div>
                <div className="mt-6">
                  <button onClick={onClose} className="flex h-10 w-full items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-white transition-colors hover:bg-zinc-700">
                    Got it
                  </button>
                </div>
              </>
            ) : (
              <>
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  placeholder="Team name *"
                  className="mb-4 block w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none"
                />

                <div className="space-y-2">
                  {selectableEmployees.map((emp) => {
                    const isSelected = selectedIds.has(emp.id)
                    return (
                      <button
                        key={emp.id}
                        onClick={() => toggleSelect(emp.id)}
                        className={`flex w-full items-center gap-3 rounded-xl bg-gradient-to-br ${emp.color} p-3 text-left transition-all ${
                          isSelected ? 'shadow-lg ring-2 ring-white/30' : 'opacity-60 hover:opacity-80'
                        }`}
                      >
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-white">{emp.name}</p>
                          <p className="text-[10px] text-white/70">{emp.role} — {emp.description}</p>
                        </div>
                        <div className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${
                          isSelected ? 'border-white bg-white/30' : 'border-white/40'
                        }`}>
                          {isSelected && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                            </svg>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>

                <div className="mt-6 flex gap-3">
                  <button
                    onClick={handleContinueFromSelect}
                    disabled={selectedIds.size === 0 || !teamName.trim()}
                    className="flex h-10 flex-1 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-30"
                  >
                    Continue
                  </button>
                  <button onClick={onClose} className="flex h-10 items-center justify-center rounded-full px-5 text-sm text-zinc-500 hover:text-zinc-800">
                    Cancel
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* No Builder Warning */}
        {step === 'no-builder-warning' && (
          <>
            <h2 className="mb-4 text-xl font-semibold text-zinc-800">No Builder selected</h2>

            <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 px-5 py-4">
              <p className="text-sm font-medium text-amber-800">This team won't be able to build.</p>
              <p className="mt-1 text-xs text-amber-700">Without a Builder, this team can only make decisions, have discussions, and review code — it cannot write or edit files.</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleConfirmNoBuilder}
                className="flex h-10 flex-1 items-center justify-center rounded-full border border-zinc-300 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                Continue without Builder
              </button>
              <button
                onClick={() => setStep('select')}
                className="flex h-10 flex-1 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
              >
                Go back and add Builder
              </button>
            </div>

            <button onClick={onClose} className="mt-3 w-full text-center text-sm text-zinc-400 hover:text-zinc-600">
              Cancel
            </button>
          </>
        )}

        {/* Step 2: Execution Order (drag) */}
        {step === 'order' && (
          <>
            <h2 className="mb-1 text-xl font-semibold text-zinc-800">Execution Order</h2>
            <p className="mb-4 text-sm text-zinc-500">Drag to set the order your team works in. First to last.</p>

            <div className="space-y-2">
              {order.map((id, index) => {
                const emp = getEmployee(id)
                if (!emp) return null
                return (
                  <div
                    key={id}
                    draggable
                    onDragStart={() => handleDragStart(index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`flex cursor-grab items-center gap-3 rounded-xl bg-gradient-to-br ${emp.color} p-3 shadow-sm transition-transform active:cursor-grabbing ${
                      dragIndex === index ? 'scale-105 shadow-lg' : ''
                    }`}
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-white">{emp.name}</p>
                      <p className="text-[10px] text-white/70">{emp.role}</p>
                    </div>
                    <svg className="ml-auto h-4 w-4 text-white/40" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
                    </svg>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setStep('recreate')}
                className="flex h-10 flex-1 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
              >
                Continue
              </button>
              <button onClick={() => setStep('select')} className="flex h-10 items-center justify-center rounded-full px-5 text-sm text-zinc-500 hover:text-zinc-800">
                Back
              </button>
            </div>

            <button onClick={onClose} className="mt-2 w-full text-center text-sm text-zinc-400 hover:text-zinc-600">
              Cancel
            </button>
          </>
        )}

        {/* Step 3: Who can recreate tasks */}
        {step === 'recreate' && (
          <>
            <h2 className="mb-1 text-xl font-semibold text-zinc-800">Task Recreation</h2>
            <p className="mb-4 text-sm text-zinc-500">Select who can reject and recreate tasks, and who the task redirects to.</p>

            <div className="space-y-3">
              {order.map((id, index) => {
                const emp = getEmployee(id)
                if (!emp) return null
                const isBuilder = id === 'builder'
                const isEnabled = !isBuilder && !!canRecreateTasks[id]

                return (
                  <div key={id} className={`rounded-xl border p-3 ${isBuilder ? 'border-zinc-200/50 bg-zinc-100' : 'border-zinc-200 bg-zinc-50'}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-bold text-zinc-500">
                        {index + 1}
                      </span>
                      {isBuilder ? (
                        <div className={`flex items-center gap-2 rounded-lg bg-gradient-to-br ${emp.color} px-3 py-1.5 opacity-40`}>
                          <span className="text-xs font-semibold text-white">{emp.name}</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => toggleRecreate(id)}
                          className={`flex items-center gap-2 rounded-lg bg-gradient-to-br ${emp.color} px-3 py-1.5 transition-all ${
                            isEnabled ? 'shadow-sm' : 'opacity-50'
                          }`}
                        >
                          <div className={`flex h-4 w-4 items-center justify-center rounded border ${
                            isEnabled ? 'border-white bg-white/30' : 'border-white/40'
                          }`}>
                            {isEnabled && (
                              <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-white">{emp.name}</span>
                        </button>
                      )}
                      <span className="text-xs text-zinc-400">
                        {isBuilder ? 'cannot recreate' : 'can recreate tasks'}
                      </span>
                    </div>

                    {isEnabled && !isBuilder && (
                      <div className="mt-2 flex items-center gap-2 pl-8">
                        <span className="text-xs text-zinc-500">Redirects to:</span>
                        <select
                          value={canRecreateTasks[id] ?? ''}
                          onChange={(e) => setRedirectTarget(id, e.target.value)}
                          className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-700 focus:border-zinc-500 focus:outline-none"
                        >
                          {order.filter((o) => o !== id).map((o) => {
                            const target = getEmployee(o)
                            return target ? <option key={o} value={o}>{target.name}</option> : null
                          })}
                        </select>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleConfirm}
                className="flex h-10 flex-1 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
              >
                Create Team
              </button>
              <button onClick={() => setStep('order')} className="flex h-10 items-center justify-center rounded-full px-5 text-sm text-zinc-500 hover:text-zinc-800">
                Back
              </button>
            </div>

            <button onClick={onClose} className="mt-2 w-full text-center text-sm text-zinc-400 hover:text-zinc-600">
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  )
}
