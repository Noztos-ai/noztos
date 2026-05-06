// Skill prompt loader — mirrors prompt-config.ts but for the per-agent
// system prompts (CEO, Architect, Tester, Builder…). Same lifecycle:
//   1. fetch on startup → seed in-memory skill store
//   2. SSE 'skills_updated' push → refresh
//   3. 5-min poll on /skills-version → refresh on drift
//
// Privacy stays the same — never written to disk, RAM only. On reboot
// we fetch fresh; if offline we serve nothing (callers fall back to
// the bare mode prompt and the chat behaves as if no skill was selected
// rather than crashing).
//
// Versioning is a SHA-256 of (name|prompt) tuples computed server-side
// — no separate version column to keep in sync. Any edit to any
// skillMd row flips the version automatically.

import { setActiveSkills, getActiveSkillsVersion } from './claude-bridge.js'
import { loadConfig } from './config.js'

const POLL_INTERVAL_MS = 5 * 60 * 1000
let pollTimer: ReturnType<typeof setInterval> | null = null

interface SkillsPayload {
  skills: Array<{ name: string; prompt: string }>
  version: string
}

function validate(payload: unknown): SkillsPayload | null {
  if (!payload || typeof payload !== 'object') return null
  const p = payload as Record<string, unknown>
  if (typeof p.version !== 'string' || p.version.length === 0) return null
  if (!Array.isArray(p.skills)) return null
  for (const s of p.skills) {
    if (!s || typeof s !== 'object') return null
    const sr = s as Record<string, unknown>
    if (typeof sr.name !== 'string' || typeof sr.prompt !== 'string') return null
  }
  return { skills: p.skills as Array<{ name: string; prompt: string }>, version: p.version }
}

export async function refreshSkillConfig(trigger: 'startup' | 'sse-push' | 'poll-drift' | 'manual' = 'manual'): Promise<boolean> {
  const local = loadConfig()
  if (!local.authToken) {
    console.log(`[skill-config] refresh trigger=${trigger} skipped — daemon has no authToken yet`)
    return false
  }

  console.log(`[skill-config] refresh trigger=${trigger} fetching /skills...`)
  try {
    const res = await fetch(`${local.serverUrl}/api/companion/skills`, {
      headers: { Authorization: `Bearer ${local.authToken}` },
    })
    if (!res.ok) {
      console.log(`[skill-config] refresh trigger=${trigger} status=${res.status} — keeping current cache`)
      return false
    }
    const payload: unknown = await res.json()
    const next = validate(payload)
    if (!next) {
      console.warn(`[skill-config] refresh trigger=${trigger} payload failed validation — keeping current cache`)
      return false
    }
    setActiveSkills(next.skills, next.version)
    console.log(`[skill-config] refresh trigger=${trigger} OK active version=${next.version} skills=${next.skills.length}`)
    return true
  } catch (err) {
    console.log(`[skill-config] refresh trigger=${trigger} failed: ${(err as Error).message} — keeping current cache`)
    return false
  }
}

async function checkVersionDrift(currentVersion: string): Promise<void> {
  const local = loadConfig()
  if (!local.authToken) return
  try {
    const res = await fetch(`${local.serverUrl}/api/companion/skills-version`, {
      headers: { Authorization: `Bearer ${local.authToken}` },
    })
    if (!res.ok) return
    const { version } = (await res.json()) as { version?: string }
    if (typeof version === 'string' && version !== currentVersion) {
      console.log(`[skill-config] poll: drift cached=${currentVersion} server=${version} — refreshing`)
      await refreshSkillConfig('poll-drift')
    } else {
      console.log(`[skill-config] poll: in sync version=${currentVersion}`)
    }
  } catch {
    // Best-effort — SSE push is the primary channel.
  }
}

export function startSkillConfigPolling(): void {
  if (pollTimer) return
  pollTimer = setInterval(() => {
    void checkVersionDrift(getActiveSkillsVersion())
  }, POLL_INTERVAL_MS)
  if (pollTimer && typeof pollTimer.unref === 'function') pollTimer.unref()
}

export function stopSkillConfigPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}
