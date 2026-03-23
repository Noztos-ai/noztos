'use client'

import Link from 'next/link'

type Tab = 'overview' | 'work' | 'tasks' | 'team' | 'config'

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'work', label: 'Work' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'team', label: 'My Team' },
  { id: 'config', label: 'Config' },
]

interface ProjectLayoutProps {
  projectName: string
  activeTab?: Tab
  onTabChange: (tab: Tab) => void
  children: React.ReactNode
}

export function ProjectLayout({ projectName, activeTab = 'work', onTabChange, children }: ProjectLayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-zinc-200">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between border-b border-zinc-300/60 bg-zinc-200 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="text-xs text-zinc-500 transition-colors hover:text-zinc-800"
          >
            &larr;
          </Link>
          <h1 className="text-sm font-semibold text-zinc-800">{projectName}</h1>
        </div>
      </header>

      {/* Tab navbar */}
      <nav className="flex shrink-0 items-center gap-0 border-b border-zinc-300/60 bg-zinc-200 px-4">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`relative px-4 py-2.5 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-zinc-900'
                : 'text-zinc-500 hover:text-zinc-700'
            }`}
          >
            {tab.label}
            {activeTab === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900" />
            )}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  )
}

export type { Tab }
