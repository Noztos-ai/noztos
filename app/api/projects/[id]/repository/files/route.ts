import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyProjectAccess } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET — List all files with modification status
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const auth = await verifyProjectAccess(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const repository = await prisma.repository.findUnique({ where: { projectId: id } })
  if (!repository) return NextResponse.json({ files: [] })

  const files = await prisma.repoFile.findMany({
    where: { repositoryId: repository.id },
    select: { id: true, path: true, isModified: true, sizeBytes: true },
    orderBy: { path: 'asc' },
  })

  return NextResponse.json({ files })
}

// PATCH — Revert or accept a file
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const auth = await verifyProjectAccess(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { path, action } = (await request.json()) as { path: string; action: 'revert' | 'accept' }

  if (!path || !action) {
    return NextResponse.json({ error: 'path and action are required' }, { status: 400 })
  }

  const repository = await prisma.repository.findUnique({ where: { projectId: id } })
  if (!repository) return NextResponse.json({ error: 'No repository' }, { status: 400 })

  const file = await prisma.repoFile.findUnique({
    where: { repositoryId_path: { repositoryId: repository.id, path } },
  })

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  if (action === 'revert') {
    if (!file.originalContent && !file.isModified) {
      return NextResponse.json({ error: 'Nothing to revert' }, { status: 400 })
    }
    // If file was newly created (originalContent is empty), delete it
    if (file.originalContent === '') {
      await prisma.repoFile.delete({ where: { id: file.id } })
      return NextResponse.json({ success: true, deleted: true })
    }
    // Revert to original
    await prisma.repoFile.update({
      where: { id: file.id },
      data: { content: file.originalContent, isModified: false },
    })
  } else if (action === 'accept') {
    // Accept = new originalContent becomes current, mark as not modified
    await prisma.repoFile.update({
      where: { id: file.id },
      data: { originalContent: file.content, isModified: false },
    })
  }

  return NextResponse.json({ success: true })
}
