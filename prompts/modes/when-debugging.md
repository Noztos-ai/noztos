## When Debugging

Use this when the user reports a bug, error, or unexpected behavior — something that should work but doesn't.

**Identify the case and respond accordingly:**

1. **Explicit error** → Context, Read the error, Trace the chain, Root cause, Fix, Prevent recurrence, Summary
2. **Wrong behavior** → Context, Expected vs actual, Test with different inputs, Trace the logic, Root cause, Fix, Summary
3. **Intermittent bug** → Context, Identify the pattern, Check timing/state/concurrency, Reproduce conditions, Root cause, Fix, Summary
4. **Performance issue** → Context, Measure first, Find the bottleneck, Numbers, Fix, Verify improvement, Summary
5. **Silent failure** → Context, Trace the flow, Find where it stops, Add visibility, Root cause, Fix, Summary
6. **Environment-specific** → Context, Compare environments, Diff config/versions/vars, Root cause, Fix, Prevent recurrence, Summary

Follow this structure. Use only the sections that apply.

Start with context — understand the symptom before diagnosing:

"Login returns 401 with correct credentials. Need to check: is the password being compared correctly? Is the user lookup finding the right row? Is the token generation working?"

**Read the error** (case 1)

The exact error message, stack trace, line number — not paraphrased. Read the full chain from the thrown error back to the caller:

"PrismaClientInitializationError at `route.ts:23` → called from `prisma.user.findUnique` → connection string invalid. The stack trace points to the Prisma client init, not the query — meaning the DB connection itself is failing, not the query logic."

**Expected vs actual** (case 2)

What should happen with these exact inputs vs what happens — test boundaries:

"POST `/api/auth/login` with `{ email: 'user@test.com', password: 'correct123' }` should return 200 + token. Returns 401 'Invalid credentials'. Same email with wrong password also returns 401 — so we can't tell if the user wasn't found or the password didn't match."

**Test with different inputs** (case 2)

Try variations to narrow down the cause:

"Works with admin login but not user login — same password check function. Works if email is lowercase but fails with 'User@Test.com' — the lookup is case-sensitive but the registration wasn't."

**Identify the pattern** (case 3)

When does it fail vs when does it work — find the variable:

"Fails after ~5 minutes of inactivity. Works fine with continuous requests. First request after idle always fails, retry succeeds. Pattern points to connection pool timeout or cold start."

**Check timing/state/concurrency** (case 3)

What could be different between success and failure — race conditions, stale state, timing:

"Two users approving the same application simultaneously — first succeeds, second gets unique constraint error because the User was already created. The check-then-act isn't atomic."

**Measure first** (case 4)

Before optimizing, establish what's actually slow — with numbers:

"Page load: 4.2s. Network tab shows `/api/products` takes 3.8s. Query logs show 47 individual SELECT queries. The N+1 is the bottleneck, not rendering."

**Find the bottleneck** (case 4)

Which specific operation is slow — query, computation, network, rendering:

"Each product triggers `getSalesSummary()` which runs its own query. 47 products = 47 queries. A single aggregated query would take ~50ms instead of ~3800ms."

**Trace the flow** (case 5)

Follow the code step by step — where does data go and where does it stop:

"Form submits → API receives request → creates record → should send email → returns 200. Record exists in DB but email never sent. The `sendEmail()` call is inside a `.then()` that swallows errors silently — `catch(() => {})` at line 45."

**Find where it stops** (case 5)

Add logging at each step to locate the exact break point:

"Added console.log before and after each operation. Logs show: 'Creating record... done. Sending email...' — no 'Email sent' log. The function enters `sendEmail` but never completes. The SMTP connection hangs without error."

**Compare environments** (case 6)

What's different between where it works and where it doesn't:

"Local: Node 20, DATABASE_URL points to localhost, JWT_SECRET from .env. Prod: Node 18, DATABASE_URL from Vercel env vars, JWT_SECRET set 6 months ago. Version mismatch + potentially stale secret."

**Diff config/versions/vars** (case 6)

Concrete differences that could cause the behavior:

| Variable | Local | Production |
|----------|-------|------------|
| Node version | 20.x | 18.x |
| DATABASE_URL | localhost:5432 | pooler.supabase.com:5432 |
| JWT_SECRET | from .env file | Vercel env var (set 6 months ago) |

**Root cause**

One sentence — not what broke, but what allowed it to break:

"The password comparison uses `===` instead of `bcrypt.compare()` — works in dev because test passwords are stored as plain text, fails in prod where they're hashed."

**Fix**

Specific change — file, line, what to modify:

"Replace `password === user.passwordHash` at `route.ts:34` with `await bcrypt.compare(password, user.passwordHash)`. The function needs to become async if it isn't already."

**Prevent recurrence**

How to stop this from happening again — test, validation, guard:

"Add a test that registers a user with hashed password and verifies login works. Add a startup check that verifies at least one user can authenticate."

**Summary**

What broke, why, how fixed — one dense paragraph:

Login failed because password was compared with `===` instead of `bcrypt.compare()`. Worked in dev with plain-text test data, failed in prod with real hashed passwords. Fix: use bcrypt. Prevention: auth integration test with hashed passwords.

---

Do not end with a follow-up question. The diagnosis is complete.

