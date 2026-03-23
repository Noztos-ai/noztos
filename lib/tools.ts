import { prisma } from '@/lib/db'

// Tools that Claude can use to interact with the cloned repository.
// These are passed to the Anthropic API as tool definitions, and
// executed server-side when Claude calls them.

export const REPO_TOOLS = [
  {
    name: 'read_file',
    description: 'Read the content of a file in the repository',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to repo root (e.g. src/index.ts)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file in the repository',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path relative to repo root' },
        content: { type: 'string', description: 'The full file content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'list_dir',
    description: 'List files and directories at a given path',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'Directory path (empty string for root)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_files',
    description: 'Search for a text pattern across all files in the repository',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Text to search for (case-insensitive)' },
        glob: { type: 'string', description: 'Optional file pattern filter (e.g. *.ts)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file from the repository',
    input_schema: {
      type: 'object' as const,
      properties: {
        path: { type: 'string', description: 'File path to delete' },
      },
      required: ['path'],
    },
  },
]

// ── Tool executor ──────────────────────────────────────────────────────────

interface ToolResult {
  result: string
  isError: boolean
}

export async function executeTool(
  repositoryId: string,
  toolName: string,
  input: Record<string, unknown>
): Promise<ToolResult> {
  switch (toolName) {
    case 'read_file':
      return readFile(repositoryId, input.path as string)
    case 'write_file':
      return writeFile(repositoryId, input.path as string, input.content as string)
    case 'list_dir':
      return listDir(repositoryId, input.path as string)
    case 'search_files':
      return searchFiles(repositoryId, input.query as string, input.glob as string | undefined)
    case 'delete_file':
      return deleteFile(repositoryId, input.path as string)
    default:
      return { result: `Unknown tool: ${toolName}`, isError: true }
  }
}

async function readFile(repositoryId: string, path: string): Promise<ToolResult> {
  const file = await prisma.repoFile.findUnique({
    where: { repositoryId_path: { repositoryId, path } },
    select: { content: true },
  })
  if (!file) return { result: `File not found: ${path}`, isError: true }
  return { result: file.content, isError: false }
}

async function writeFile(repositoryId: string, path: string, content: string): Promise<ToolResult> {
  await prisma.repoFile.upsert({
    where: { repositoryId_path: { repositoryId, path } },
    create: {
      repositoryId,
      path,
      content,
      originalContent: '',
      isModified: true,
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
    },
    update: {
      content,
      isModified: true,
      sizeBytes: Buffer.byteLength(content, 'utf-8'),
    },
  })
  return { result: `File written: ${path}`, isError: false }
}

async function listDir(repositoryId: string, dirPath: string): Promise<ToolResult> {
  const prefix = dirPath && dirPath !== '/' ? (dirPath.endsWith('/') ? dirPath : `${dirPath}/`) : ''

  const files = await prisma.repoFile.findMany({
    where: {
      repositoryId,
      path: prefix ? { startsWith: prefix } : undefined,
    },
    select: { path: true, isModified: true, sizeBytes: true },
    orderBy: { path: 'asc' },
  })

  // Group into files at this level and subdirectories
  const entries = new Map<string, { isDir: boolean; isModified: boolean; size: number }>()

  for (const file of files) {
    const relativePath = prefix ? file.path.slice(prefix.length) : file.path
    const slashIndex = relativePath.indexOf('/')

    if (slashIndex === -1) {
      // Direct file at this level
      entries.set(relativePath, { isDir: false, isModified: file.isModified, size: file.sizeBytes })
    } else {
      // Subdirectory
      const dirName = relativePath.slice(0, slashIndex)
      if (!entries.has(dirName)) {
        entries.set(dirName, { isDir: true, isModified: false, size: 0 })
      }
    }
  }

  const lines: string[] = []
  for (const [name, info] of entries) {
    const modified = info.isModified ? ' [modified]' : ''
    if (info.isDir) {
      lines.push(`${name}/`)
    } else {
      lines.push(`${name} (${info.size} bytes)${modified}`)
    }
  }

  return { result: lines.length > 0 ? lines.join('\n') : '(empty directory)', isError: false }
}

async function searchFiles(repositoryId: string, query: string, glob?: string): Promise<ToolResult> {
  let files = await prisma.repoFile.findMany({
    where: {
      repositoryId,
      content: { contains: query, mode: 'insensitive' },
      isBinary: false,
    },
    select: { path: true, content: true },
    take: 50,
  })

  // Apply glob filter if provided
  if (glob) {
    const pattern = glob.replace(/\*/g, '.*').replace(/\?/g, '.')
    const regex = new RegExp(pattern, 'i')
    files = files.filter((f) => regex.test(f.path))
  }

  if (files.length === 0) {
    return { result: `No matches found for "${query}"`, isError: false }
  }

  const results: string[] = []
  for (const file of files) {
    const lines = file.content.split('\n')
    const matchingLines: string[] = []
    const queryLower = query.toLowerCase()

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(queryLower)) {
        matchingLines.push(`  L${i + 1}: ${lines[i].trim()}`)
        if (matchingLines.length >= 5) break
      }
    }

    results.push(`${file.path}\n${matchingLines.join('\n')}`)
  }

  return { result: results.join('\n\n'), isError: false }
}

async function deleteFile(repositoryId: string, path: string): Promise<ToolResult> {
  const existing = await prisma.repoFile.findUnique({
    where: { repositoryId_path: { repositoryId, path } },
    select: { id: true },
  })
  if (!existing) return { result: `File not found: ${path}`, isError: true }

  await prisma.repoFile.delete({ where: { id: existing.id } })
  return { result: `File deleted: ${path}`, isError: false }
}
