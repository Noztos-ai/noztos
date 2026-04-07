## When Refactoring

Use this when the user wants to reorganize code without changing behavior — extract modules, split files, reorganize folders, eliminate duplication.

**Identify the case and respond accordingly:**

1. **File too large** → Context, Current problem, Target structure (modules), What moves where, Shared state, Refactor order, Safety check, Summary
2. **Mixed responsibilities** → Context, Current problem, Target structure (layers), What moves where, Refactor order, Safety check, Summary
3. **Messy folder structure** → Context, Current problem, Target structure (domains), What moves where, Refactor order, Safety check, Summary
4. **Duplicated code** → Context, Current problem, What moves where, Shared state, Extracted API, Refactor order, Safety check, Summary

Always prefer the approach with least impact — if the framework offers a way to reorganize without changing URLs or breaking imports, use it. Read the framework docs mentally before proposing moves. Don't propose moving what already works well.

Follow this structure. Use only the sections listed for the identified case.

Start with a context paragraph — read the code, understand what's tangled, give your take on the best fix. Embed the guiding principle:

"The project has `server.js` at 600 lines mixing HTTP, sync, and cron — can't test sync without starting Express. The fix: one module per concern, entry point becomes just composition."

**Current problem**

What's wrong, specifically — files, lines, what's mixed, why it hurts:

File too large: `server.js` handles routes, sync, cron, and shared state in 600 lines — adding a route means scrolling past sync code. Mixed responsibilities: `middleware.ts` combines HTTP parsing with JWT validation — can't unit test without mocking NextRequest. Messy folders: `profile/`, `settings/`, `plans/` all at root level when they're all user concerns. Duplicated code: same plan limit check in `professional-filter.ts`, `smart-search.ts`, and `api/plans/usage`.

**Target structure** (cases 1, 2, 3)

For splitting a large file — modules by concern:
```
server.js      # ~30 lines: bootstrap
app.js         # HTTP + middleware
services/      # business logic
jobs/          # cron scheduling
```

For separating layers — one concern per file:
```
lib/auth/
├── jwt.ts       # sign/verify only
├── http.ts      # extract Bearer from request
├── guards.ts    # requireUserAuth / requireAdminAuth
```

For regrouping folders — by domain and access level:
```
routes/
├── auth/        # login, register
├── user/        # profile, settings, plans
├── admin/       # applications
└── public/      # search, contact
```

**What moves where** (all cases)

| From | To | Why |
|------|----|-----|
| `server.js` — sync logic | `services/sync.js` | Testable without Express |
| `middleware.ts` — token + JWT | `auth/http.ts` + `auth/guards.ts` | One layer each |
| `profile/`, `settings/` flat | `routes/user/` grouped | Same domain, same auth |
| Plan check in 3 files | `plans/policy.ts` | Single source of truth |

**Shared state** (cases 1, 4)

For globals multiple modules need: `isSyncing` and `manuallyUpdatedProducts` become exports from `state/syncState.js` — same behavior, one owner.

For duplicated logic: `parseUserPlan()` and `PLAN_LIMITS` go in `policy.ts` — every file imports from one place instead of reimplementing.

**Extracted API** (case 4)

The shared function that replaces duplication — what it does, who calls it:

`canRecordContact(plan: UserPlan, usedThisMonth: number): boolean` — pure function, no DB. Returns true if under limit. Replaces inline checks in `professional-filter.ts`, `smart-search.ts`, and `api/plans/usage`. Each file changes from custom logic to one import + call.

**Refactor order**

Incremental, app works after each step. Verify after each:

1. Extract shared code first — lowest risk, highest dedup value
2. Split mixed responsibilities — one concern per file
3. Regroup folders — move files, update imports
4. Slim down large files — extract to services
5. Delete old files — grep for remaining references first

**Safety check**

Verify the refactor doesn't break security or expose vulnerabilities. Auth middleware still protecting the same routes after the move? API keys and secrets still loaded from the same env vars? Rate limiting still applied? If auth logic was split, does the composition still reject unauthorized requests the same way? If routes moved, are previously protected endpoints still protected in their new location?

**Summary**

What changes, what stays, where to start:

Same behavior throughout. Large files split by concern. Mixed responsibilities separated into layers. Folders grouped by domain. Duplicated logic extracted to shared modules. Start with the smallest extraction — it proves the pattern and unblocks the rest.

---

Do not end with a follow-up question. The analysis is complete.

