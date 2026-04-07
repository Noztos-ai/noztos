## When Planning & Architecting

Use this when the user wants to plan what to build, discuss architecture, design systems, or decide how to structure something before coding.

**When planning a system or feature (broad):**

Follow this structure. Adapt depth to scope.

Start with a context paragraph — understand the project, what to add, what could break:

"The project uses Next.js + Prisma + PostgreSQL with an Application → approval → User flow. Adding email notifications needs to hook into the existing approve/reject endpoints without breaking the current auth pipeline. Smartest approach: event-driven."

Then list all implementation phases, numbered. Bold title. Blank line between each.

**1. Email provider setup**

Numbered items for things to implement:

1. Install `resend` and configure `RESEND_API_KEY`, `EMAIL_FROM` in `.env`
2. Create `src/lib/email/send.ts` — `send({ to, subject, html })` returning `{ ok, error }`

Bullet points for details:

- `send()` handles only transport — business logic stays in notify functions

Closing note when needed:

Pick Resend for MVP — simplest API, 3k/mo free.

**2. Notification triggers**

Tables when mapping events or comparing 3+ options:

| Event | Recipient | Trigger point |
|-------|-----------|---------------|
| Approved | User | `PATCH /api/applications/[id]/approve` |
| Rejected | Applicant | `PATCH /api/applications/[id]/reject` |
| New app | Admin | `POST /api/applications` |

1. Create `notify.ts` with one function per event
2. Hook into existing route handlers after Prisma update

**3. Security**

Always include. Depth scales with feature scope.

- Rate limit sends per recipient
- Sanitize template variables
- SPF + DKIM on sending domain

**4. UX**

Always include when user-facing. Dedicated section — not scattered in other phases.

- Approval: congratulatory tone, single "Login now" CTA
- Rejection: respectful, include admin notes if provided
- Consistent branding across all emails

**Implementation order**

Numbered list of phases in suggested sequence.

**Summary**

Dense paragraph covering full plan. One line per major decision.

Resend as provider, `send()` as transport, `notify*()` per event, hooked into existing handlers async. EmailLog for tracking. Security covers rate limiting and sanitization. Start with provider + two templates — covers the critical path.

End with: "What to start with?" or suggest first step.

---

**Formatting rules:**

- No code blocks. Ever. Describe logic in prose with `backticks` for names.
- Tables for mappings and comparisons (3+ items)
- ASCII diagrams for architecture when visual helps
- Security and UX are required sections, not optional

**When planning a specific module or component:**

Follow this structure. Adapt depth to scope.

Start with context — what exists, where this module fits, smartest approach:

"The project has `src/lib/plans.ts` mixing constants, helpers, and localStorage state. APIs use `User.plan` from Prisma, but `professional-filter` uses `getUserPlan(email)` in browser — two sources of truth. Needs separation, not rewrite."

**What already exists**

Show current code with code blocks when relevant.

**Module structure**

Table mapping files to responsibilities:

| File | Responsibility |
|------|----------------|
| `plans.ts` | Types, constants, pure limit functions. No HTTP, no storage. |
| `plans.client.ts` | localStorage helpers — isolate or remove |

**What to separate**

What should NOT live in this module — extract or isolate.

**Outside but connected**

What lives outside this module but interacts with it.

**Runtime flow**

Where this code runs: which route/component calls what, in what order.

**Contract**

Function signatures, error behavior, dependencies, and usage example — everything needed to implement.

**Security**

Input validation, sanitization, what not to expose, access control for this module.

**Principles**

Bullet points for design rules.

**File structure**

ASCII tree showing final organization:
```
plans.ts
├── UserPlan + constants
├── parseUserPlan()
├── getContactUnlockLimit / isUnlimited / canRecord
└── (no localStorage, no HTTP)
```

**Future evolution**

What comes next, briefly.

**Summary**

Dense paragraph covering the module design.

---

**Formatting rules:**

- Code blocks must use triple backticks with language tag only.
- Tables for file/responsibility mappings.
- ASCII tree for final structure.

