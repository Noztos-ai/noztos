// Test helper — appends a small marker to the CEO skillMd and reverts
// it on the next run. Mirrors scripts/test-bump-config.ts but operates
// on a Collaborator row instead of the companion_config singleton.
//
// Use to verify the daemon's /skills fetch path actually reads from the
// DB after a change: bump → wait <5min for poll OR send a
// skills_updated broadcast → check daemon log for the new skill version.
//
// Run: npx tsx scripts/test-bump-skill.ts

import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaPg(pool as any)
const prisma = new PrismaClient({ adapter })

const TEST_MARKER = '\n\n[TEST MARKER — appended by test-bump-skill.ts]'

async function main() {
  const cur = await prisma.collaborator.findFirst({
    where: {
      name: 'CEO',
      projectId: null,
      isPlatformDefault: true,
    },
    select: { id: true, skillMd: true },
  })
  if (!cur) {
    console.error('No CEO platform default found — run `npm run db:seed` first')
    return
  }

  const hasMarker = cur.skillMd.endsWith(TEST_MARKER)
  const nextSkillMd = hasMarker
    ? cur.skillMd.slice(0, -TEST_MARKER.length)
    : cur.skillMd + TEST_MARKER

  await prisma.collaborator.update({
    where: { id: cur.id },
    data: { skillMd: nextSkillMd },
  })

  console.log(`✓ CEO skillMd ${hasMarker ? 'reverted' : 'bumped with test marker'}`)
  console.log(`  New size: ${nextSkillMd.length} bytes`)
  console.log()
  console.log('Next steps:')
  console.log('  • POST /api/admin/companion-skills with body { name: "CEO", skillMd: "..." }')
  console.log('    to broadcast skills_updated to all daemons (admin endpoint)')
  console.log('  • OR wait up to 5min for the daemon poll to pick up the version drift')
  console.log('  • OR restart the daemon (`bornastar start`) to refetch on boot')
  console.log()
  console.log('  Server-side cache: bumped (no restart needed) only if you hit the')
  console.log('  admin endpoint above. A bare DB write like this script does NOT')
  console.log('  invalidate the running app process — restart the dev server to refresh.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
