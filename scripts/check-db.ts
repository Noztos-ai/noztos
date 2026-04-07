import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adapter = new PrismaPg(pool as any)
const prisma = new PrismaClient({ adapter })

async function main() {
  const projects = await prisma.project.findMany({ select: { id: true, name: true } })
  console.log('Projects:', JSON.stringify(projects, null, 2))

  const repos = await prisma.repository.findMany({
    select: { id: true, projectId: true, githubOwner: true, githubRepo: true },
  })
  console.log('Repos:', JSON.stringify(repos, null, 2))

  const fileCount = await prisma.repoFile.count()
  console.log('Total files:', fileCount)

  await prisma.$disconnect()
  pool.end()
}

main().catch(console.error)
