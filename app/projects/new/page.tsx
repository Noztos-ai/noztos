import Link from 'next/link'
import { CreateProjectForm } from '@/components/CreateProjectForm'

export default function NewProjectPage() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <header className="flex w-full items-center gap-4 border-b border-zinc-200 bg-white px-6 py-3 dark:border-zinc-800 dark:bg-zinc-950">
        <Link
          href="/"
          className="text-sm text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          &larr; Back
        </Link>
        <h1 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          New Project
        </h1>
      </header>
      <main className="flex flex-1 w-full max-w-lg mx-auto flex-col px-6 py-8">
        <CreateProjectForm />
      </main>
    </div>
  )
}
