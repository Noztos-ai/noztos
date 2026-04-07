## When Writing Documentation

Use this when the user wants to create or update documentation — text that explains, not logic that executes. Covers .md files and code comments (JSDoc/TSDoc).

**Identify the case and respond accordingly:**

1. **README** → Context, Audience, Sections needed, Content, Summary
2. **API docs** → Context, Endpoints list, Per-endpoint detail, Auth, Errors, Summary
3. **Architecture docs** → Context, System overview, Components, Data flow, Decisions, Summary
4. **Module docs** → Context, Purpose, API surface, Usage examples, Summary
5. **Code comments** → Context, What needs documenting, JSDoc/TSDoc per function, Summary
6. **CHANGELOG** → Context, Version, Changes grouped by type, Summary
7. **CONTRIBUTING** → Context, Setup steps, Conventions, PR process, Summary

Follow this structure. Use only the sections that apply.

Start with context — understand who will read this and what they need. Always identify the audience first: developer? end user? new team member? contributor? The audience shapes everything — depth, tone, what to include, what to skip.

"README for an open-source Next.js app. Audience: developers who want to run it locally or deploy it. Need: what it does, how to install, how to configure, how to run."

**Sections needed** (case 1)

What the README must cover based on the project:

"Project description (one paragraph), tech stack, prerequisites, installation, environment setup, running locally, deploy instructions, project structure overview, license."

**Endpoints list** (case 2)

Table of all endpoints with method, path, auth, description:

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | None | Login with email + password |
| GET | `/api/professionals` | API key | Search professionals |
| PATCH | `/api/applications/:id/approve` | Admin JWT | Approve application |

**Environment variables** (cases 1, 2, 7)

Table of all env vars with required/optional and purpose:

| Variable | Required | Purpose |
|----------|----------|---------|
| DATABASE_URL | Yes | PostgreSQL connection |
| JWT_SECRET | Yes (prod) | Token signing — `openssl rand -base64 32` |
| ACTION_API_KEY | For API | External integrations auth |

Security: never commit `.env`. Use strong secrets in production. Define in host dashboard, not in code.

**Per-endpoint detail** (case 2)

For each endpoint: params, body schema, response shape, error codes:

"POST `/api/auth/login` — body: `{ email: string, password: string }`. Returns `{ token: string, user: { id, email, plan } }`. Errors: 401 invalid credentials, 400 missing fields."

**System overview** (case 3)

High-level architecture in prose + ASCII diagram when helpful:

"Next.js handles HTTP + rendering. Prisma talks to PostgreSQL. Auth via JWT stored client-side. Three user types: professional (portal), admin (backoffice), external (ChatGPT Actions via API key)."

**Decisions** (case 3)

Why the architecture is the way it is — not just what, but why:

"JWT instead of sessions because the app is stateless on Vercel serverless. Three tables for application lifecycle (Application, User, DeletedApplication) instead of status flags because it keeps queries clean and data separated."

**Purpose** (case 4)

What this module does, why it exists, one paragraph:

"`src/lib/plans/policy.ts` is the single source of truth for plan definitions — types, limits, prices. Pure functions, no side effects, importable from server and client. Exists to eliminate the duplication that was in three files."

**API surface** (case 4)

Every exported function with signature and one-line description:

- `getContactUnlockLimit(plan: UserPlan): number` — returns monthly limit for plan
- `isUnlimitedPlan(plan: UserPlan): boolean` — true for Pro
- `parseUserPlan(raw: string): UserPlan` — normalizes string to valid plan type

**What needs documenting** (case 5)

Identify which functions need docs — only exported/public API. Internal helpers don't need JSDoc.

"All exported functions in `lib/auth/` and `lib/plans/` — these are used across the codebase. Focus on public API: what it receives, what it returns, when it throws."

**JSDoc/TSDoc per function** (case 5)

The actual comment to add — params, returns, throws, example:

"Add to `generateToken`: `@param user — { id, email }`, `@returns JWT string valid for 7 days`, `@throws if JWT_SECRET is not set`."

**Changes grouped by type** (case 6)

Organize by: Added, Changed, Fixed, Removed:

"Added: email notifications on approve/reject. Changed: plans validation centralized in `policy.ts`. Fixed: login case-sensitivity bug. Removed: localStorage plan storage."

**Setup steps** (case 7)

How to get the project running from zero — clone to first request:

"Clone repo, `npm install`, copy `.env.example` to `.env`, fill in DATABASE_URL + JWT_SECRET, `npx prisma migrate dev`, `npm run dev`, open localhost:3000."

**Conventions** (case 7)

Code style, commit format, branch naming, PR expectations:

"Commits: `feat:`, `fix:`, `docs:` prefix. Branches: `feature/`, `fix/`, `docs/`. PRs: description of what changed and why, link to issue if exists. Tests required for new API routes."

**PR process** (case 7)

How to submit, what reviewers look for, how to get merged:

"Fork → branch → implement → PR against main. Reviewer checks: tests pass, no type errors, follows conventions, description clear. Merge: squash and merge after approval."

**Security notes** (cases 1, 2, 3, 7)

What to protect, what not to expose in docs:

"Never include real secrets in examples — use placeholders. Mention `.env` in `.gitignore`. Note which vars must be strong random in production. Flag any endpoints that need auth."

**Content**

The actual documentation text — ready to paste or commit. Write it complete, not as outline.

**Summary**

What was documented, for whom, where it lives.

---

Write documentation that a developer reading it for the first time can follow without asking questions. Every section must be actionable — not "configure the database" but "set DATABASE_URL in `.env` to your PostgreSQL connection string."

Do not end with a follow-up question. The documentation is complete.

