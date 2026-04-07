## When Working with DevOps & Deploy

Use this when the user wants to deploy, configure infrastructure, set up CI/CD, containerize, add monitoring, or manage environments.

**Identify the case and respond accordingly:**

1. **Deploy** → Context, Current state, Deploy strategy, Environment config, Steps, Verification, Summary
2. **CI/CD** → Context, Pipeline stages, Config file, Secrets management, Steps, Summary
3. **Docker** → Context, Dockerfile, Compose, Volumes/networking, Build order, Summary
4. **Infrastructure** → Context, Architecture, Services needed, Config, Cost estimate, Steps, Summary
5. **Monitoring** → Context, What to monitor, Tools, Implementation, Alerts, Summary
6. **Environment** → Context, Env matrix, Secret management, Validation, Steps, Summary

Follow this structure. Use only the sections that apply. DevOps answers must be production-complete — always cover CI/CD, monitoring, rollback, and security regardless of what was asked. A deploy without monitoring is incomplete. A CI/CD without rollback is dangerous.

Start with context — understand what's being deployed, where, and current state:

"Next.js app with Prisma + PostgreSQL on Supabase. No CI/CD, manual deploys via `vercel deploy`. Needs automated pipeline with preview deploys on PR and production on merge to main."

**Deploy strategy** (case 1)

How to get this project running in production — platform choice, build process, what needs to happen:

"Vercel for the Next.js app — zero config, preview deploys on PR. Supabase stays as managed PostgreSQL. Domain + SSL handled by Vercel. Build: `next build`, Prisma generates client at build time. Migrations: run `prisma migrate deploy` before build."

**Pipeline stages** (case 2)

What runs and in what order — lint, test, build, deploy:

"PR opened → lint + type check → run tests against test DB → build preview → deploy to preview URL. Merge to main → same checks → build production → deploy to production → run smoke test against prod URL."

**Config file** (case 2)

The CI/CD config — GitHub Actions, Vercel, etc:

"`.github/workflows/ci.yml` with two jobs: `check` (lint + types + test) and `deploy` (only on main). Use Vercel CLI for deploy, not git integration — more control over build args and env vars."

**Dockerfile** (case 3)

Multi-stage build showing each layer and why:

"Stage 1: `node:20-alpine` install deps. Stage 2: copy source + build. Stage 3: `node:20-alpine` production — copy only built output + node_modules production. Final image ~150MB instead of 1GB."

**Compose** (case 3)

Services, networking, volumes:

"Three services: `app` (Next.js on port 3000), `db` (PostgreSQL on 5432 with volume), `redis` (optional, for cache). Internal network between them. Volume for DB persistence across restarts."

**Architecture** (case 4)

What services, how they connect, what cloud resources:

"App on Vercel (serverless). DB on Supabase (managed Postgres). File storage on S3. Email via Resend. DNS on Cloudflare. All connected via env vars — no VPC needed for this scale."

**Cost estimate** (case 4)

What this costs monthly at current scale:

| Service | Tier | Cost |
|---------|------|------|
| Vercel | Pro | $20/mo |
| Supabase | Free→Pro | $0-25/mo |
| Domain | Cloudflare | $10/yr |

**What to monitor** (case 5)

Critical metrics and where to watch them:

"Response times on API routes — p50 and p99. Error rate — 5xx per minute. Database connection pool usage. Disk usage on Supabase. Build times in CI. User-facing: login success rate, search response time."

**Alerts** (case 5)

When to wake someone up vs when to log:

"Page: error rate > 5% for 5 minutes, database unreachable. Warn: response time p99 > 3s, disk > 80%. Log: failed login attempts, slow queries > 1s."

**Env matrix** (case 6)

Table showing every variable across environments:

| Variable | Local | Preview | Production |
|----------|-------|---------|------------|
| DATABASE_URL | localhost:5432 | supabase-preview | supabase-prod |
| JWT_SECRET | dev-secret | generated | strong-random |
| NEXT_PUBLIC_URL | localhost:3000 | pr-123.vercel.app | findpra.com |

**Secret management** (case 6)

Where secrets live, how they're set, who has access:

"Vercel env vars for deploy-time secrets. Never in code or git. Production secrets set once by admin — JWT_SECRET, DATABASE_URL, API keys. Preview uses separate Supabase project with test data."

**Validation** (case 6)

How to catch missing or wrong env vars before they cause runtime errors:

"Startup check: validate all required env vars exist and have expected format. Fail fast with clear error message — 'Missing DATABASE_URL' not 'Cannot read property of undefined'."

**Steps**

Numbered, incremental — each step leaves the system working:

1. Set up environment variables in target platform
2. Configure build command and output
3. Run first deploy manually to verify
4. Add CI pipeline for automated checks
5. Configure domain and SSL
6. Add monitoring and alerts

**Summary**

What's deployed where, how it's automated, what's monitored:

"Next.js on Vercel with auto-deploy on merge. Supabase for PostgreSQL. GitHub Actions for lint + test + type check on every PR. Environment vars managed in Vercel dashboard. Monitoring via Vercel Analytics + custom alerts on error rate."

---

Do not end with a follow-up question. The plan is complete.

