import { Sandbox } from '@e2b/code-interpreter'
import type { ComputeProvider, SandboxInfo, ExecResult } from './compute'

// ── E2B Compute Provider ──────────────────────────────────────────────────
//
// Uses E2B Code Interpreter SDK for sandbox management.
// Each sandbox is an isolated Linux container with:
//   - Node.js, Python, Git pre-installed
//   - Full terminal access
//   - Filesystem operations

// Cache running sandboxes to avoid re-creating
const sandboxCache = new Map<string, Sandbox>()

export class E2BProvider implements ComputeProvider {
  async createSandbox(repoUrl?: string): Promise<SandboxInfo> {
    console.log('[e2b] Creating sandbox, API key present:', !!process.env.E2B_API_KEY)
    const sandbox = await Sandbox.create({
      apiKey: process.env.E2B_API_KEY,
      timeoutMs: 300000, // 5 min sandbox lifetime
    })

    const id = sandbox.sandboxId
    console.log('[e2b] Sandbox created:', id)
    sandboxCache.set(id, sandbox)

    // Clone repo if provided
    if (repoUrl) {
      console.log('[e2b] Cloning repo...')
      try {
        const cloneResult = await sandbox.commands.run(`git clone --depth 1 ${repoUrl} /home/user/project`, { timeoutMs: 60000 })
        console.log('[e2b] Clone done, exit:', cloneResult.exitCode)
        if (cloneResult.stderr) console.log('[e2b] Clone stderr:', cloneResult.stderr.slice(0, 200))
      } catch (err) {
        console.error('[e2b] Clone failed:', err)
        // Sandbox still usable, just no repo
      }
    }

    return { id, status: 'running' }
  }

  async exec(sandboxId: string, command: string): Promise<ExecResult> {
    const sandbox = await this.getSandbox(sandboxId)
    console.log('[e2b] Executing:', command)

    try {
      // Try project dir first, fallback to home
      const result = await sandbox.commands.run(command, {
        cwd: '/home/user/project',
        timeoutMs: 30000,
      })

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      }
    } catch (err) {
      console.error('[e2b] Exec error:', err)
      // Try without cwd
      try {
        const result = await sandbox.commands.run(command, { timeoutMs: 30000 })
        return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode }
      } catch (err2) {
        return { stdout: '', stderr: `Execution failed: ${err2 instanceof Error ? err2.message : 'Unknown error'}`, exitCode: 1 }
      }
    }
  }

  async stopSandbox(sandboxId: string): Promise<void> {
    const sandbox = sandboxCache.get(sandboxId)
    if (sandbox) {
      await sandbox.kill()
      sandboxCache.delete(sandboxId)
    }
  }

  async isRunning(sandboxId: string): Promise<boolean> {
    try {
      const sandbox = await this.getSandbox(sandboxId)
      return !!sandbox
    } catch {
      return false
    }
  }

  async listFiles(sandboxId: string, path: string): Promise<string[]> {
    const result = await this.exec(sandboxId, `ls -1 ${path}`)
    return result.stdout.split('\n').filter(Boolean)
  }

  async readFile(sandboxId: string, path: string): Promise<string> {
    const sandbox = await this.getSandbox(sandboxId)
    const content = await sandbox.files.read(path)
    return typeof content === 'string' ? content : new TextDecoder().decode(content as ArrayBuffer)
  }

  async writeFile(sandboxId: string, path: string, content: string): Promise<void> {
    const sandbox = await this.getSandbox(sandboxId)
    await sandbox.files.write(path, content)
  }

  private async getSandbox(sandboxId: string): Promise<Sandbox> {
    let sandbox = sandboxCache.get(sandboxId)
    if (sandbox) return sandbox

    // Try to reconnect
    sandbox = await Sandbox.connect(sandboxId, { apiKey: process.env.E2B_API_KEY })
    sandboxCache.set(sandboxId, sandbox)
    return sandbox
  }
}
