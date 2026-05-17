// Cloud Mirror — daemon-side sync of worktree filesystem state to the
// server, in the background. The server APIs at /api/companion/mirror/*
// expect content-addressed uploads (see ARCHITECTURE.md "Cloud Mirror").
//
// Wire model (per project):
//   - One MirrorSync instance per project
//   - Constructed with the project's worktreesPath + auth
//   - enqueueChange(worktreeId, relPath) is called by daemon every time
//     fs-watcher emits a change under a worktrees/ root. The same call
//     handles add/change (we'll see the file exists) and delete (stat
//     fails → mark for removal).
//   - A drain loop runs every DRAIN_INTERVAL_MS; it groups queued paths
//     by worktreeId, reads files, computes hashes, calls check-hashes
//     to dedup, uploads missing blobs, then calls commit-entries.
//   - Gated by BORNASTAR_MIRROR_ENABLED env var (off by default).
//     With the flag off, all methods are no-ops; the daemon keeps
//     running normal local flow without the mirror cost.
//
// Concurrency: a single drain in flight at a time per project. Excess
// queue events accumulate and drain on the next tick.

import { createHash } from 'node:crypto'
import { readFile, readdir, stat } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, relative, sep } from 'node:path'

const execFileP = promisify(execFile)

// Match what fs-watcher excludes — anything truly user-irrelevant (build
// artifacts, dependency caches, OS junk). Plus .git itself: we mirror the
// working tree, not the git internals (those get reconstructed in the
// cloud sandbox from the user's remote + our UnpushedCommit patches).
const IGNORED_SEGMENTS = new Set([
  '.git', '.DS_Store', 'node_modules', '.next', '.nuxt', '.turbo',
  'dist', 'build', 'out', 'target', 'vendor', '__pycache__',
  '.pytest_cache', 'venv', '.venv', 'coverage', '.team-handoff',
])

function isIgnored(relPath: string): boolean {
  // Any path segment matching an ignored dir/file → skip.
  for (const seg of relPath.split(sep)) {
    if (IGNORED_SEGMENTS.has(seg)) return true
  }
  return false
}

const DRAIN_INTERVAL_MS = 500
const MAX_HASHES_PER_CHECK = 500
const MAX_BLOB_BYTES = 10 * 1024 * 1024 // server-side cap mirrored here for early skip

// Each queued path carries enough to schedule one mirror op. We don't
// store the file content — we read it at drain time so the latest bytes
// land in the mirror (multiple changes between drains collapse to one).
interface QueueEntry {
  worktreeId: string
  relPath: string         // path inside the worktree
  enqueuedAt: number
}

interface CommitEntry {
  path: string
  hash: string
  mode: number
  status: 'tracked' | 'untracked' | 'modified'
}

export class MirrorSync {
  private queue = new Map<string, QueueEntry>() // key = `${worktreeId}::${relPath}` dedup
  private drainTimer: ReturnType<typeof setInterval> | null = null
  private draining = false
  private readonly enabled: boolean
  // Track worktrees we've kicked off initial sync for. The first time
  // the watcher OR the claude eager hook surfaces a new worktreeId, we
  // fire syncWorktreeInitial in the background. This covers worktrees
  // created AFTER the daemon started (discoverAndSyncAll only handles
  // ones already on disk at startup). Without it, the file entries
  // populate (drain works fine) but WorktreeMirror never gets created,
  // and the cloud-activation endpoint refuses with "mirror not ready".
  private knownWorktrees = new Set<string>()

  constructor(
    private readonly serverUrl: string,
    private readonly authToken: string,
    private readonly worktreesPath: string,
  ) {
    // Default ON — opt-out via BORNASTAR_MIRROR_ENABLED=false. The
    // original opt-in default was defensive while the feature was raw;
    // now that the path is wired end-to-end we default it on so users
    // don't have to set anything in the daemon's shell env to enable
    // cloud activation. The daemon process inherits env from wherever
    // it was launched (Homebrew shim, terminal, system service), which
    // is awkward to seed reliably.
    this.enabled = process.env.BORNASTAR_MIRROR_ENABLED !== 'false'
  }

  start(): void {
    if (!this.enabled) {
      console.log('[mirror] sync DISABLED (BORNASTAR_MIRROR_ENABLED is not "true")')
      return
    }
    if (this.drainTimer) return
    this.drainTimer = setInterval(() => {
      void this.drain().catch((err) => {
        console.warn('[mirror] drain failed:', err)
      })
    }, DRAIN_INTERVAL_MS)
    console.log(`[mirror] sync STARTED — worktreesPath=${this.worktreesPath} server=${this.serverUrl}`)
  }

  stop(): void {
    if (this.drainTimer) {
      clearInterval(this.drainTimer)
      this.drainTimer = null
    }
    this.queue.clear()
  }

  // Called by the daemon for each path emitted by fs-watcher with
  // source='worktrees'. The watcher's path format is
  // `<worktreeId>/<relPath>` because worktreesPath is the parent dir.
  // First segment is always the worktreeId by construction.
  enqueueFromWatcher(watcherRelPath: string): void {
    if (!this.enabled) return
    const slash = watcherRelPath.indexOf('/')
    if (slash <= 0) return // worktreeId root events — nothing to mirror
    const worktreeId = watcherRelPath.slice(0, slash)
    const relPath = watcherRelPath.slice(slash + 1)
    if (!worktreeId || !relPath) return
    this.ensureKnown(worktreeId)
    const key = `${worktreeId}::${relPath}`
    this.queue.set(key, { worktreeId, relPath, enqueuedAt: Date.now() })
  }

  // Called explicitly when claude emits a Write/Edit tool_result. We
  // could let the fs-watcher catch this, but enqueueing eagerly cuts
  // the latency from ~50ms (debounce) to ~0ms.
  enqueueClaudeEdit(worktreeId: string, relPath: string): void {
    if (!this.enabled) return
    this.ensureKnown(worktreeId)
    const key = `${worktreeId}::${relPath}`
    this.queue.set(key, { worktreeId, relPath, enqueuedAt: Date.now() })
  }

  // First time we see a worktree (either from the watcher firing for a
  // brand-new directory, or from a claude tool eager hook), fire the
  // initial sync in the background. That call populates / refreshes
  // the WorktreeMirror row (branch + commit + status='ready') which
  // the cloud-switch endpoint requires. Subsequent edits just queue
  // normally — the Set guards against re-triggering.
  private ensureKnown(worktreeId: string): void {
    if (this.knownWorktrees.has(worktreeId)) return
    this.knownWorktrees.add(worktreeId)
    console.log(`[mirror] first-seen worktree=${worktreeId.slice(0, 8)} — kicking off initial sync`)
    this.syncWorktreeInitial(worktreeId).catch((err) => {
      console.warn(`[mirror] background initial sync failed for ${worktreeId.slice(0, 8)}:`, err)
    })
  }

  private async drain(): Promise<void> {
    if (this.draining || this.queue.size === 0) return
    this.draining = true
    try {
      // Snapshot + clear: new enqueues during drain land in next batch.
      const batch = Array.from(this.queue.values())
      this.queue.clear()

      // Group by worktreeId so each /commit-entries call is per-worktree.
      const byWorktree = new Map<string, QueueEntry[]>()
      for (const e of batch) {
        const arr = byWorktree.get(e.worktreeId) ?? []
        arr.push(e)
        byWorktree.set(e.worktreeId, arr)
      }

      for (const [worktreeId, entries] of byWorktree) {
        try {
          await this.syncWorktreeBatch(worktreeId, entries)
        } catch (err) {
          console.warn(`[mirror] worktree=${worktreeId.slice(0, 8)} sync failed:`, err)
          // Don't re-enqueue — next fs event or periodic reconcile will
          // catch any drift. Re-enqueueing on failure can loop forever.
        }
      }
    } finally {
      this.draining = false
    }
  }

  private async syncWorktreeBatch(
    worktreeId: string,
    entries: QueueEntry[],
  ): Promise<void> {
    const worktreeRoot = join(this.worktreesPath, worktreeId)

    // Phase 1: stat each path to discover existence + mode.
    const upserts: CommitEntry[] = []
    const removedPaths: string[] = []
    const fileBufs = new Map<string, Buffer>()  // hash → bytes (for upload)
    const hashByPath = new Map<string, string>() // for assembling commit batch

    for (const e of entries) {
      const abs = join(worktreeRoot, e.relPath)
      let st: Awaited<ReturnType<typeof stat>>
      try {
        st = await stat(abs)
      } catch {
        // File doesn't exist → it was deleted.
        removedPaths.push(e.relPath)
        continue
      }
      if (!st.isFile()) continue // skip dirs, symlinks (handled separately later)
      if (st.size > MAX_BLOB_BYTES) {
        console.warn(`[mirror] skip oversize file ${e.relPath} (${st.size} bytes)`)
        continue
      }

      let buf: Buffer
      try {
        buf = await readFile(abs)
      } catch {
        // Race: file deleted between stat and read. Treat as removal.
        removedPaths.push(e.relPath)
        continue
      }

      const hash = createHash('sha256').update(buf).digest('hex')
      fileBufs.set(hash, buf)
      hashByPath.set(e.relPath, hash)
      upserts.push({
        path: e.relPath,
        hash,
        mode: st.mode,
        // Status is best-effort here — we don't run git status in this
        // hot path. The full reconcile job (later phase) refines this.
        status: 'modified',
      })
    }

    // Phase 2: check-hashes to find what needs uploading.
    const uniqueHashes = Array.from(fileBufs.keys())
    const missing: string[] = []
    for (let i = 0; i < uniqueHashes.length; i += MAX_HASHES_PER_CHECK) {
      const slice = uniqueHashes.slice(i, i + MAX_HASHES_PER_CHECK)
      const res = await this.post('/api/companion/mirror/check-hashes', { hashes: slice })
      if (!res || !res.ok) {
        throw new Error(`check-hashes failed: ${res?.status}`)
      }
      const body = (await res.json()) as { missing: string[] }
      missing.push(...body.missing)
    }

    // Phase 3: upload missing blobs (sequentially — concurrency tuning
    // is a later optimization once we benchmark).
    for (const hash of missing) {
      const buf = fileBufs.get(hash)
      if (!buf) continue
      const res = await this.post('/api/companion/mirror/upload', {
        hash,
        contentBase64: buf.toString('base64'),
      })
      if (!res || !res.ok) {
        throw new Error(`upload failed for ${hash.slice(0, 8)}: ${res?.status}`)
      }
    }

    // Phase 4: commit-entries (upserts + removed).
    if (upserts.length === 0 && removedPaths.length === 0) return
    const commitRes = await this.post('/api/companion/mirror/commit-entries', {
      worktreeId,
      upserts,
      removedPaths,
    })
    if (!commitRes || !commitRes.ok) {
      throw new Error(`commit-entries failed: ${commitRes?.status}`)
    }

    console.log(
      `[mirror] worktree=${worktreeId.slice(0, 8)} upserted=${upserts.length} removed=${removedPaths.length} uploaded=${missing.length}/${uniqueHashes.length}`,
    )
  }

  // Called on daemon startup to discover every existing worktree on disk
  // and trigger an initial reconcile. The watcher only emits incremental
  // events — on a fresh daemon process, the existing files need an
  // explicit walk so the mirror knows what's there.
  async discoverAndSyncAll(): Promise<void> {
    if (!this.enabled) return
    let dirs: string[]
    try {
      const entries = await readdir(this.worktreesPath, { withFileTypes: true })
      dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name)
    } catch {
      return // worktreesPath doesn't exist yet — nothing to sync
    }
    for (const worktreeId of dirs) {
      this.knownWorktrees.add(worktreeId)
      try {
        await this.syncWorktreeInitial(worktreeId)
      } catch (err) {
        console.warn(`[mirror] initial sync worktree=${worktreeId.slice(0, 8)} failed:`, err)
      }
    }
  }

  // Full reconcile for one worktree: walk the FS, enqueue every file,
  // wait for the queue to drain, then post the mirror pointer (branch,
  // commit, status='ready'). Safe to call repeatedly — same files
  // dedup at check-hashes, same entries upsert in commit-entries.
  async syncWorktreeInitial(worktreeId: string): Promise<void> {
    if (!this.enabled) return
    const worktreeRoot = join(this.worktreesPath, worktreeId)
    console.log(`[mirror] initial walk START worktree=${worktreeId.slice(0, 8)} root=${worktreeRoot}`)
    // 1. Mark warming first so cloud activation refuses to proceed mid-sync.
    const state = await this.readGitState(worktreeRoot)
    if (state) {
      await this.postState(worktreeId, state, 'warming')
    }

    // 2. Walk FS and enqueue every non-ignored file.
    let walked = 0
    await this.walkRecursive(worktreeRoot, worktreeRoot, async (abs, rel) => {
      this.queue.set(`${worktreeId}::${rel}`, {
        worktreeId,
        relPath: rel,
        enqueuedAt: Date.now(),
      })
      walked++
    })

    // 3. Drain everything we just queued (synchronously trigger one drain
    // per ~500 entries to keep memory bounded). Note: we just call drain()
    // in a loop until queue is empty — concurrent watcher events landing
    // during this loop just lengthen it, which is fine.
    while (this.queue.size > 0) {
      await this.drain()
    }

    // 4. Sync unpushed commits — these change rarely so a single pass is fine.
    await this.syncUnpushedCommits(worktreeId, worktreeRoot)

    // 5. Mark ready.
    if (state) {
      await this.postState(worktreeId, state, 'ready')
    }
    console.log(`[mirror] worktree=${worktreeId.slice(0, 8)} initial walk done files=${walked} branch=${state?.currentBranch} commit=${state?.currentCommitSha.slice(0, 8)}`)
  }

  private async readGitState(
    worktreeRoot: string,
  ): Promise<{ currentBranch: string; currentCommitSha: string } | null> {
    try {
      const [branchRes, commitRes] = await Promise.all([
        execFileP('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: worktreeRoot }),
        execFileP('git', ['rev-parse', 'HEAD'], { cwd: worktreeRoot }),
      ])
      return {
        currentBranch: branchRes.stdout.trim(),
        currentCommitSha: commitRes.stdout.trim(),
      }
    } catch (err) {
      console.warn(`[mirror] readGitState failed for ${worktreeRoot}:`, err)
      return null
    }
  }

  private async postState(
    worktreeId: string,
    state: { currentBranch: string; currentCommitSha: string },
    status: 'warming' | 'ready',
  ): Promise<void> {
    const res = await this.post('/api/companion/mirror/state', {
      worktreeId,
      currentBranch: state.currentBranch,
      currentCommitSha: state.currentCommitSha,
      status,
    })
    if (!res || !res.ok) {
      console.warn(`[mirror] state update worktree=${worktreeId.slice(0, 8)} status=${status} failed: ${res?.status}`)
    }
  }

  // Capture local commits not yet pushed to the user's remote, store as
  // git format-patch. Uses `@{push}` to find the upstream — if that
  // resolves to a SHA other than HEAD, there are unpushed commits.
  // If there's no upstream (rare), we skip — cloud reconstruction will
  // use whatever the user pushed last.
  async syncUnpushedCommits(worktreeId: string, worktreeRoot: string): Promise<void> {
    if (!this.enabled) return
    let unpushedShas: string[] = []
    try {
      const res = await execFileP(
        'git',
        ['rev-list', '@{push}..HEAD'],
        { cwd: worktreeRoot },
      )
      unpushedShas = res.stdout.trim().split('\n').filter(Boolean).reverse() // oldest first
    } catch {
      // No upstream configured, or git error — skip silently. The
      // reconcile endpoint accepts an empty list and will clear any
      // stale unpushed rows that no longer exist.
      unpushedShas = []
    }

    const commits: Array<{
      commitSha: string
      parentSha: string
      message: string
      authorName: string
      authorEmail: string
      authorDate: string
      patchBase64: string
      orderIndex: number
    }> = []

    for (let i = 0; i < unpushedShas.length; i++) {
      const sha = unpushedShas[i]
      try {
        const [showRes, patchRes] = await Promise.all([
          execFileP('git', ['show', '-s', '--format=%P%n%an%n%ae%n%aI%n%s', sha], { cwd: worktreeRoot }),
          execFileP('git', ['format-patch', '-1', sha, '--stdout'], {
            cwd: worktreeRoot,
            maxBuffer: 10 * 1024 * 1024, // 10MB cap per patch
          }),
        ])
        const lines = showRes.stdout.split('\n')
        const parentSha = (lines[0] ?? '').split(' ')[0] ?? ''
        const authorName = lines[1] ?? ''
        const authorEmail = lines[2] ?? ''
        const authorDate = lines[3] ?? ''
        const message = lines.slice(4).join('\n').trim()
        commits.push({
          commitSha: sha,
          parentSha,
          message,
          authorName,
          authorEmail,
          authorDate,
          patchBase64: Buffer.from(patchRes.stdout).toString('base64'),
          orderIndex: i,
        })
      } catch (err) {
        console.warn(`[mirror] format-patch failed for ${sha.slice(0, 8)}:`, err)
      }
    }

    const res = await this.post('/api/companion/mirror/unpushed', {
      worktreeId,
      commits,
    })
    if (!res || !res.ok) {
      console.warn(`[mirror] unpushed sync worktree=${worktreeId.slice(0, 8)} failed: ${res?.status}`)
    }
  }

  private async walkRecursive(
    root: string,
    current: string,
    onFile: (abs: string, rel: string) => Promise<void>,
  ): Promise<void> {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>
    try {
      entries = (await readdir(current, { withFileTypes: true, encoding: 'utf8' })) as unknown as typeof entries
    } catch {
      return
    }
    for (const entry of entries) {
      const abs = join(current, entry.name)
      const rel = relative(root, abs)
      if (isIgnored(rel)) continue
      if (entry.isDirectory()) {
        await this.walkRecursive(root, abs, onFile)
      } else if (entry.isFile()) {
        await onFile(abs, rel)
      }
    }
  }

  private async post(path: string, body: unknown): Promise<Response | null> {
    try {
      return await fetch(`${this.serverUrl}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.authToken}`,
        },
        body: JSON.stringify(body),
      })
    } catch (err) {
      console.warn(`[mirror] POST ${path} failed:`, err)
      return null
    }
  }
}
