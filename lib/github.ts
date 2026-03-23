import { prisma } from '@/lib/db'
import { decrypt } from '@/lib/crypto'

const GITHUB_API = 'https://api.github.com'

// Skip these paths during sync
const SKIP_DIRS = ['node_modules/', '.git/', 'dist/', 'build/', '.next/', '__pycache__/', '.venv/']
const SKIP_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.zip', '.tar', '.gz', '.pdf', '.exe', '.dll', '.so', '.dylib']
const MAX_FILE_SIZE = 500_000 // 500KB

function githubHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function shouldSkip(path: string, size: number): boolean {
  if (size > MAX_FILE_SIZE) return true
  if (SKIP_DIRS.some((d) => path.startsWith(d) || path.includes(`/${d}`))) return true
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase()
  if (SKIP_EXTENSIONS.includes(ext)) return true
  return false
}

// ── GitHub API helpers ─────────────────────────────────────────────────────

export async function getGitHubUser(encryptedToken: string) {
  const token = decrypt(encryptedToken)
  const res = await fetch(`${GITHUB_API}/user`, { headers: githubHeaders(token) })
  if (!res.ok) return null
  const data = await res.json()
  return { login: data.login, name: data.name, avatarUrl: data.avatar_url }
}

export async function listUserRepos(encryptedToken: string) {
  const token = decrypt(encryptedToken)
  const repos: { owner: string; name: string; fullName: string; defaultBranch: string; isPrivate: boolean }[] = []

  let page = 1
  while (page <= 5) { // max 500 repos
    const res = await fetch(
      `${GITHUB_API}/user/repos?per_page=100&sort=updated&page=${page}`,
      { headers: githubHeaders(token) }
    )
    if (!res.ok) break
    const data = await res.json()
    if (data.length === 0) break

    for (const repo of data) {
      repos.push({
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        defaultBranch: repo.default_branch,
        isPrivate: repo.private,
      })
    }
    page++
  }

  return repos
}

// ── Sync repo files ────────────────────────────────────────────────────────

interface TreeItem {
  path: string
  sha: string
  size: number
  type: 'blob' | 'tree'
}

export async function syncRepoFiles(
  repositoryId: string,
  encryptedToken: string,
  owner: string,
  repo: string,
  branch: string
) {
  const token = decrypt(encryptedToken)

  // 1. Get the full file tree in one API call
  const treeRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
    { headers: githubHeaders(token) }
  )
  if (!treeRes.ok) {
    throw new Error(`Failed to fetch repo tree: ${treeRes.status}`)
  }
  const treeData = await treeRes.json()
  const blobs: TreeItem[] = (treeData.tree as TreeItem[]).filter(
    (item) => item.type === 'blob' && !shouldSkip(item.path, item.size ?? 0)
  )

  // 2. Fetch file contents in batches (concurrency limit)
  const BATCH_SIZE = 10
  const files: { path: string; content: string; size: number; sha: string }[] = []

  for (let i = 0; i < blobs.length; i += BATCH_SIZE) {
    const batch = blobs.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (blob) => {
        try {
          const blobRes = await fetch(
            `${GITHUB_API}/repos/${owner}/${repo}/git/blobs/${blob.sha}`,
            { headers: githubHeaders(token) }
          )
          if (!blobRes.ok) return null
          const blobData = await blobRes.json()

          // Skip binary content
          if (blobData.encoding !== 'base64') return null

          const content = Buffer.from(blobData.content, 'base64').toString('utf-8')
          // Quick binary check: if content has null bytes it's likely binary
          if (content.includes('\0')) return null

          return { path: blob.path, content, size: blob.size, sha: blob.sha }
        } catch {
          return null
        }
      })
    )
    files.push(...results.filter((f): f is NonNullable<typeof f> => f !== null))
  }

  // 3. Get the current commit SHA
  const refRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    { headers: githubHeaders(token) }
  )
  const refData = refRes.ok ? await refRes.json() : null
  const commitSha = refData?.object?.sha ?? null

  // 4. Clear old files and insert new ones in batches (no transaction — too many files for 5s timeout)
  await prisma.repoFile.deleteMany({ where: { repositoryId } })

  const INSERT_BATCH = 20
  for (let i = 0; i < files.length; i += INSERT_BATCH) {
    const batch = files.slice(i, i + INSERT_BATCH)
    await Promise.all(
      batch.map((f) =>
        prisma.repoFile.create({
          data: {
            repositoryId,
            path: f.path,
            content: f.content,
            originalContent: f.content,
            sizeBytes: f.size,
            blobSha: f.sha,
          },
        })
      )
    )
  }

  await prisma.repository.update({
    where: { id: repositoryId },
    data: { lastSyncedSha: commitSha, lastSyncedAt: new Date() },
  })

  return { fileCount: files.length, commitSha }
}

// ── Push changes to GitHub ─────────────────────────────────────────────────

export async function pushChangesToGitHub(
  repositoryId: string,
  encryptedToken: string,
  commitMessage: string
) {
  const token = decrypt(encryptedToken)

  const repository = await prisma.repository.findUnique({
    where: { id: repositoryId },
    select: { githubOwner: true, githubRepo: true, githubBranch: true, lastSyncedSha: true },
  })
  if (!repository) throw new Error('Repository not found')

  const { githubOwner: owner, githubRepo: repo, githubBranch: branch } = repository

  // Get modified files
  const modifiedFiles = await prisma.repoFile.findMany({
    where: { repositoryId, isModified: true },
    select: { path: true, content: true },
  })

  if (modifiedFiles.length === 0) {
    return { pushed: false, message: 'No modified files to push' }
  }

  // 1. Create blobs for each modified file
  const blobShas: { path: string; sha: string }[] = []
  for (const file of modifiedFiles) {
    const blobRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/blobs`, {
      method: 'POST',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
    })
    if (!blobRes.ok) throw new Error(`Failed to create blob for ${file.path}`)
    const blobData = await blobRes.json()
    blobShas.push({ path: file.path, sha: blobData.sha })
  }

  // 2. Get current commit to use as parent
  const refRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/ref/heads/${branch}`,
    { headers: githubHeaders(token) }
  )
  if (!refRes.ok) throw new Error('Failed to get branch ref')
  const refData = await refRes.json()
  const parentSha = refData.object.sha

  // 3. Get the current tree
  const commitRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/commits/${parentSha}`,
    { headers: githubHeaders(token) }
  )
  if (!commitRes.ok) throw new Error('Failed to get parent commit')
  const commitData = await commitRes.json()
  const baseTreeSha = commitData.tree.sha

  // 4. Create new tree with modified files
  const treeItems = blobShas.map((b) => ({
    path: b.path,
    mode: '100644' as const,
    type: 'blob' as const,
    sha: b.sha,
  }))

  const newTreeRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/trees`, {
    method: 'POST',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
  })
  if (!newTreeRes.ok) throw new Error('Failed to create tree')
  const newTreeData = await newTreeRes.json()

  // 5. Create commit
  const newCommitRes = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/git/commits`, {
    method: 'POST',
    headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: commitMessage,
      tree: newTreeData.sha,
      parents: [parentSha],
    }),
  })
  if (!newCommitRes.ok) throw new Error('Failed to create commit')
  const newCommitData = await newCommitRes.json()

  // 6. Update branch ref
  const updateRefRes = await fetch(
    `${GITHUB_API}/repos/${owner}/${repo}/git/refs/heads/${branch}`,
    {
      method: 'PATCH',
      headers: { ...githubHeaders(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newCommitData.sha }),
    }
  )
  if (!updateRefRes.ok) throw new Error('Failed to update branch ref')

  // 7. Reset modified flags
  await prisma.$transaction([
    ...modifiedFiles.map((f) =>
      prisma.repoFile.updateMany({
        where: { repositoryId, path: f.path },
        data: { isModified: false, originalContent: f.content, blobSha: null },
      })
    ),
    prisma.repository.update({
      where: { id: repositoryId },
      data: { lastSyncedSha: newCommitData.sha, lastSyncedAt: new Date() },
    }),
  ])

  return { pushed: true, commitSha: newCommitData.sha, filesCount: modifiedFiles.length }
}
