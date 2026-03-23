'use client'

import Link from 'next/link'
import { CreateProjectButton } from './CreateProjectForm'

interface Project {
  id: string
  name: string
  createdAt: Date
}

interface ProjectListProps {
  projects: Project[]
}

export function ProjectList({ projects }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="rounded-full bg-zinc-200 p-4 dark:bg-zinc-800">
          <svg
            className="h-8 w-8 text-zinc-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.5v15m7.5-7.5h-15"
            />
          </svg>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
            No projects yet
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Select a GitHub repository to get started.
          </p>
        </div>
        <div className="mt-2">
          <CreateProjectButton />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Your Projects
        </h2>
        <CreateProjectButton />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {projects.map((project) => (
          <Link
            key={project.id}
            href={`/projects/${project.id}`}
            className="rounded-xl border border-zinc-200/60 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
          >
            <h3 className="font-medium text-zinc-900 dark:text-zinc-50">
              {project.name}
            </h3>
            <p className="mt-1 text-xs text-zinc-400">
              Created {new Date(project.createdAt).toISOString().split('T')[0]}
            </p>
          </Link>
        ))}
      </div>
    </div>
  )
}
