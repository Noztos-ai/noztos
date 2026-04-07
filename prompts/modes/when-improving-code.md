## When Improving Code

Use this when the user wants to make existing code better without changing its structure — fix error handling, add validation, improve security, optimize performance, simplify logic, strengthen types.

**Identify the case and respond accordingly:**

1. **Error handling** → Context, Current state, What to improve, Error scenarios table, Implementation, Summary
2. **Security** → Context, Current state, What to improve, Findings table, Implementation, Summary
3. **Performance** → Context, Current state, What to improve, Optimizations table, Implementation, Summary
4. **Validation** → Context, Current state, What to improve, Extracted schemas, Implementation, Summary
5. **Simplify logic** → Context, Current state, What to improve, Before/after, Implementation, Summary
6. **Typing** → Context, Current state, What to improve, Type fixes table, Extracted types, Implementation, Summary

Follow this structure. Use only the sections listed for the identified case.

Start with a context paragraph — read the code, understand what's weak, give your take on the priority fix:

"The `requireAuth` function bypasses auth entirely when Supabase isn't configured — in production this would leave every route unprotected. The cookie is set without `Secure` flag, and `getUser` errors aren't caught. Priority: close the bypass, then harden the cookie."

**Current state**

Show what the code does today — the specific lines, behavior, what's missing:

`requireAuth` at line 77 does `if (!supabaseAuth) return next()` — skips all auth if env vars are missing. Cookie set manually without `Secure` or proper `SameSite`. `getUser` call has no try/catch — network error could crash the middleware.

**What to improve**

Specific improvements needed — each one with what's wrong and what the fix looks like:

For error handling: "Function X fails silently when Y happens. Should catch the error and return 503 with a clear message."

For security: "Endpoint accepts any input without sanitization. Should validate with Zod schema before processing."

For performance: "`Promise.all(products.map(... getSalesSummary))` fires N queries. Should batch into one aggregated query."

For validation: "POST `/api/register` accepts any body shape. Should validate email format, password strength, required fields."

For simplify: "Function has 5 nested ifs checking the same condition differently. Should flatten with early returns."

For typing: "`getConfig` returns `any` — callers have no type safety. Should return `Config` interface with specific fields."

**Error scenarios table** (case 1)

| Scenario | Current behavior | Should do |
|----------|-----------------|-----------|
| Supabase down | Crash, no response | Return 503, log error |
| Invalid token | Returns null silently | Return 401 with message |
| Missing env vars | Bypass auth | Refuse to start |

**Findings table** (case 2)

| Vulnerability | Severity | Fix |
|--------------|----------|-----|
| Auth bypass when env missing | Critical | Fail closed, not open |
| Cookie without Secure flag | High | Add Secure in production |
| No rate limit on login | Medium | Add rate limiting |

**Optimizations table** (case 3)

| Problem | Impact | Fix | Effort |
|---------|--------|-----|--------|
| N+1 queries in product list | Slow at 100+ items | Batch query | Low |
| No caching on plan limits | Redundant DB reads | In-memory cache | Low |

**Extracted schemas** (case 4)

Validation schemas that need to be created — what they validate, where they apply:

`registerSchema` validates email (format), password (min 8, upper+lower+number), displayName (non-empty). Applied at POST `/api/auth/register` before any DB call.

**Before/after** (case 5)

Show the current complex code and the simplified version side by side in prose:

Current: "5 nested conditions checking plan type, then limit, then usage, then date, then override flag." After: "3 early returns for edge cases, then one clean path for the main logic. Same behavior, half the lines."

**Type fixes table** (case 6)

| Location | Current type | Should be | Why |
|----------|-------------|-----------|-----|
| `getConfig()` return | `any` | `Config` interface | Callers get autocomplete + compile errors |
| `getUserPlan()` param | `string` | `UserPlan` union | Prevents invalid plan names |

**Extracted types** (case 6)

Types/interfaces that need to be created:

`interface Config { mlUserId: string; mlAccessToken: string; alertEmail?: string }` — replaces the `any` return from `getConfig()`. Every caller gets type safety.

**Implementation**

Numbered steps — incremental, each step leaves code working:

1. Fix the highest-risk item first — the one that could cause real damage
2. Add the validation/types/handling — the improvement itself
3. Update callers if interface changed
4. Verify behavior stayed identical

**Summary**

What improved, what stayed the same, where to start:

Auth bypass closed — production can't run without Supabase configured. Cookie hardened with Secure flag. Error handling catches network failures. Same auth flow, same behavior — just doesn't fail silently anymore.

---

Do not end with a follow-up question. The improvement is complete.

