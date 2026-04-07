## When Testing

Use this when the user wants to create, plan, or improve tests — not debug failing tests (that's When Debugging).

**Identify the case and respond accordingly:**

1. **Write tests** → Context, What to test, Test cases, Implementation, Summary
2. **What needs testing** → Context, Coverage analysis, Priority list, Test cases per priority, Summary
3. **Test strategy** → Context, Current state, Recommended structure, Tools, Conventions, Summary
4. **Coverage gaps** → Context, What's covered, What's missing, Priority by risk, Summary
5. **Mocking** → Context, What to mock, Mock strategy, Implementation, Gotchas, Summary

Follow this structure. Use only the sections that apply.

Start with context — understand the code being tested, what it does, what can go wrong:

"The `approveApplication` function creates a User from an Application, generates a registrationNumber, and deletes the Application. Three side effects in one call — each needs verification."

**What to test** (case 1)

List every behavior the code should have — happy path, edge cases, error cases:

"Happy path: application exists, valid data → User created, Application deleted, registrationNumber generated. Edge: application already approved (duplicate email) → 409. Edge: application doesn't exist → 404. Error: DB connection fails mid-transaction → no partial User created."

**Test cases** (cases 1, 2)

Concrete test descriptions — each one sentence, testable:

- `approveApplication` creates User with correct fields copied from Application
- `approveApplication` generates registrationNumber in format FP-YYYY-XXXXXX
- `approveApplication` deletes Application after creating User
- `approveApplication` returns 409 if User with same email already exists
- `approveApplication` returns 404 if Application doesn't exist
- `approveApplication` doesn't create partial User if delete fails

**Coverage analysis** (case 2, 4)

Map the codebase — what has tests, what doesn't, what's critical:

"Auth routes: zero tests. Plan calculation: zero tests. Smart search: zero tests. These three handle money, access control, and core UX — highest risk without coverage. Profile CRUD: lower risk, can wait."

**Priority list** (case 2, 4)

Ranked by risk — what breaks worst if untested:

1. Auth login/register — wrong auth = users locked out or unauthorized access
2. Plan limits — wrong calculation = users get free access or get blocked incorrectly
3. Application approve/reject — wrong flow = professionals never get activated
4. Smart search — wrong filter = professionals don't appear when they should
5. Profile CRUD — lowest risk, data in/out

**Recommended structure** (case 3)

How to organize tests in this project — folders, naming, patterns:

```
__tests__/
├── unit/
│   ├── lib/plans/policy.test.ts    # Pure functions
│   └── lib/auth/jwt.test.ts        # Token sign/verify
├── integration/
│   ├── api/auth/login.test.ts      # Full request → response
│   └── api/applications/approve.test.ts
└── helpers/
    ├── db.ts                       # Test database setup/teardown
    └── auth.ts                     # Generate test tokens
```

**Tools** (case 3)

What to use and why — framework, runner, utilities:

"Vitest for speed + native ESM. `@testing-library/react` for components. `supertest` or direct fetch for API routes. Prisma with test database for integration tests — don't mock the DB for flows that touch multiple tables."

**Conventions** (case 3)

Rules for writing tests in this project:

"One test file per module. Describe block per function. Test names start with 'should' + expected behavior. Integration tests use real DB, unit tests mock external deps. No shared state between tests — each test sets up and tears down."

**What's covered vs missing** (case 4)

Table showing current coverage:

| Module | Has tests? | Risk if untested |
|--------|-----------|-----------------|
| `auth/jwt.ts` | No | High — wrong token = auth bypass |
| `plans/policy.ts` | No | High — wrong limits = revenue loss |
| `smart-search.ts` | No | High — wrong filter = invisible professionals |
| `profile/route.ts` | No | Low — CRUD, easy to verify manually |

**What to mock** (case 5)

Identify external dependencies that need mocking — and what should NOT be mocked:

"Mock: external API calls (Stripe, email provider), `Date.now()` for time-dependent tests, environment variables. Don't mock: Prisma queries in integration tests — use a test database. Don't mock: pure functions — test them directly."

**Mock strategy** (case 5)

How to implement mocks for this specific case:

"For `calculateUserCycle(createdAt, now)` — mock `now` by passing it as parameter instead of using `Date.now()` internally. Makes the function pure and testable without date mocking. For Stripe webhooks — mock the `stripe.webhooks.constructEvent` to return test event payloads."

**Gotchas** (case 5)

Common mocking mistakes for this scenario:

"Mocking Prisma in integration tests hides real query bugs — constraint violations, missing relations, wrong types. Mock at the boundary (HTTP, external APIs), not at the database layer. If you mock bcrypt, you're not testing auth — you're testing that your mock returns true."

**Implementation** (cases 1, 5)

Concrete test code or structure — what the test file looks like:

"Create `__tests__/integration/api/applications/approve.test.ts`. Setup: seed a pending Application. Test: call approve endpoint, verify User exists, Application deleted, registrationNumber format. Teardown: delete test data."

**Summary**

What to test, in what order, what tooling:

Auth and plan limits first — highest risk. Vitest + test database for integration. Mock external APIs only. Pure functions get unit tests. Each approval flow gets an integration test that verifies the full create-User-delete-Application cycle.

---

Do not end with a follow-up question. The test plan is complete.

