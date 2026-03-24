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
    select: { id: true, path: true, isModified: true, originalContent: true, sizeBytes: true },
    orderBy: { path: 'asc' },
  })

  const filesWithNew = files.map((f) => ({
    id: f.id,
    path: f.path,
    isModified: f.isModified,
    isNew: f.isModified && f.originalContent === '',
    sizeBytes: f.sizeBytes,
  }))

  return NextResponse.json({ files: filesWithNew })
}

// PATCH — Revert or accept a file
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const auth = await verifyProjectAccess(id)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = (await request.json()) as {
    path: string
    action: 'revert' | 'accept' | 'create' | 'rename' | 'delete' | 'move'
    content?: string
    newName?: string
    newPath?: string
  }

  const { path, action } = body

  if (!path || !action) {
    return NextResponse.json({ error: 'path and action are required' }, { status: 400 })
  }

  const repository = await prisma.repository.findUnique({ where: { projectId: id } })
  if (!repository) return NextResponse.json({ error: 'No repository' }, { status: 400 })

  // Create — new empty file
  if (action === 'create') {
    const existing = await prisma.repoFile.findUnique({
      where: { repositoryId_path: { repositoryId: repository.id, path } },
    })
    if (existing) return NextResponse.json({ error: 'File already exists' }, { status: 409 })

    await prisma.repoFile.create({
      data: {
        repositoryId: repository.id,
        path,
        content: body.content ?? '',
        originalContent: '',
        isModified: true,
        sizeBytes: 0,
      },
    })
    return NextResponse.json({ success: true })
  }

  const file = await prisma.repoFile.findUnique({
    where: { repositoryId_path: { repositoryId: repository.id, path } },
  })

  if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 })

  // Delete
  if (action === 'delete') {
    await prisma.repoFile.delete({ where: { id: file.id } })
    return NextResponse.json({ success: true })
  }

  // Rename — change just the filename
  if (action === 'rename' && body.newName) {
    const parts = path.split('/')
    parts[parts.length - 1] = body.newName
    const newPath = parts.join('/')
    await prisma.repoFile.update({
      where: { id: file.id },
      data: { path: newPath, isModified: true },
    })
    return NextResponse.json({ success: true, newPath })
  }

  // Move — change the full path (drag and drop)
  if (action === 'move' && body.newPath) {
    const existing = await prisma.repoFile.findUnique({
      where: { repositoryId_path: { repositoryId: repository.id, path: body.newPath } },
    })
    if (existing) return NextResponse.json({ error: 'File already exists at destination' }, { status: 409 })

    await prisma.repoFile.update({
      where: { id: file.id },
      data: { path: body.newPath, isModified: true },
    })
    return NextResponse.json({ success: true, newPath: body.newPath })
  }

  // Revert
  if (action === 'revert') {
    if (!file.originalContent && !file.isModified) {
      return NextResponse.json({ error: 'Nothing to revert' }, { status: 400 })
    }
    if (file.originalContent === '') {
      await prisma.repoFile.delete({ where: { id: file.id } })
      return NextResponse.json({ success: true, deleted: true })
    }
    await prisma.repoFile.update({
      where: { id: file.id },
      data: { content: file.originalContent, isModified: false },
    })
  }

  // Accept
  if (action === 'accept') {
    await prisma.repoFile.update({
      where: { id: file.id },
      data: { originalContent: file.content, isModified: false },
    })
  }

  return NextResponse.json({ success: true })
}
