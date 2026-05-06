import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { loadAllSkillsForDaemon } from '@/lib/prompts'

// GET — version-only counterpart to /api/companion/config-version. The
// daemon polls this every 5min as a backup against the SSE
// 'skills_updated' push. Compares the returned hash to its cached one
// and only refetches the full /skills payload on mismatch.
export async function GET(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { version } = await loadAllSkillsForDaemon()
  return NextResponse.json({ version })
}
