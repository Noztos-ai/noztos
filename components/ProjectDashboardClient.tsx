'use client'

import { useState } from 'react'
import { ProjectLayout } from './ProjectLayout'
import { WorkPanel } from './WorkPanel'
import { MyTeamPanel } from './MyTeamPanel'
import { TasksPanel } from './TasksPanel'
import { SourceControl } from './SourceControl'
import type { Tab } from './ProjectLayout'

// Employee color map — must match MyTeamPanel
const EMPLOYEE_COLORS: Record<string, { color: string; role: string }> = {
  ceo: { color: 'from-violet-500 to-purple-600', role: 'Planner' },
  architect: { color: 'from-blue-500 to-cyan-600', role: 'Planner' },
  designer: { color: 'from-pink-500 to-rose-600', role: 'Planner' },
  security: { color: 'from-red-500 to-orange-600', role: 'Reviewer' },
  builder: { color: 'from-red-600 to-red-700', role: 'Builder' },
}

const EMPLOYEE_NAMES: Record<string, string> = {
  ceo: 'CEO',
  architect: 'Architect',
  designer: 'Designer',
  security: 'Security',
  builder: 'Builder',
}

interface Project { id: string; name: string }
interface Collaborator { id: string; name: string; description: string; phase: string; skillMd: string }
interface Team { id: string; name: string; collaboratorOrder: { collaboratorIds: string[] } }
interface Task { id: string; name: string; status: string; pausedAtEmployee: string | null }

interface Props {
  project: Project
  collaborators: Collaborator[]
  teams: Team[]
  tasks: Task[]
}

export function ProjectDashboardClient({ project, collaborators, teams, tasks }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('work')
  const [hiredIds, setHiredIds] = useState<string[]>([])
  const [localTeams, setLocalTeams] = useState<{ name: string; memberIds: string[]; hasBuilder: boolean; order: string[]; canRecreateTasks: Record<string, string> }[]>([])

  // Build hired employees list for WorkPanel
  const hiredEmployees = hiredIds.map((id) => ({
    id,
    name: EMPLOYEE_NAMES[id] ?? id,
    color: EMPLOYEE_COLORS[id]?.color ?? 'from-zinc-500 to-zinc-600',
    role: EMPLOYEE_COLORS[id]?.role ?? 'Unknown',
  }))

  // Build team infos for WorkPanel
  const teamInfos = localTeams.map((t, i) => ({
    id: `local-team-${i}`,
    name: t.name,
    memberIds: t.memberIds,
    hasBuilder: t.hasBuilder,
    order: t.order,
    canRecreateTasks: t.canRecreateTasks,
  }))



  return (
    <ProjectLayout projectName={project.name} activeTab={activeTab} onTabChange={setActiveTab}>
      {activeTab === 'overview' && (
        <div className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: '#111116' }}>
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-lg font-semibold text-zinc-200">Overview</h2>
            <div className="grid grid-cols-3 gap-4">
              <StatCard label="Files" value="-" />
              <StatCard label="Tasks" value={String(tasks.length)} />
              <StatCard label="Employees" value={String(hiredIds.length)} />
            </div>
            <SourceControl projectId={project.id} />
          </div>
        </div>
      )}

      {activeTab === 'work' && (
        <WorkPanel
          projectId={project.id}
          hiredEmployees={hiredEmployees}
          teams={teamInfos}
        />
      )}

      {activeTab === 'tasks' && (
        <TasksPanel projectId={project.id} />
      )}

      {activeTab === 'team' && (
        <MyTeamPanel
          projectId={project.id}
          hiredIds={hiredIds}
          onHire={setHiredIds}
        />
      )}

      {activeTab === 'config' && (
        <div className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: '#111116' }}>
          <div className="mx-auto max-w-3xl">
            <h2 className="text-lg font-semibold text-zinc-200">Configuration</h2>
            <p className="mt-2 text-sm text-zinc-500">Project settings will appear here.</p>
          </div>
        </div>
      )}
    </ProjectLayout>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4">
      <p className="text-2xl font-semibold text-zinc-200">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  )
}
