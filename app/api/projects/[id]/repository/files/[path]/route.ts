import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string; path: string }>
}

// GET — Get a single file's content and original for diffing
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id, path: encodedPath } = await params
  const auth = await verifyProjectAccess(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const filePath = decodeURIComponent(encodedPath)

  const repository = await prisma.repository.findUnique({ where: { projectId: id } })
  if (!repository) return NextResponse.json({ error: 'No repository' }, { status: 400 })

  const file = await prisma.repoFile.findUnique({
    where: { repositoryId_path: { repositoryId: repository.id, path: filePath } },
    select: { path: true, content: true, originalContent: true, isModified: true, sizeBytes: true },
  })

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  return NextResponse.json(file)
}
