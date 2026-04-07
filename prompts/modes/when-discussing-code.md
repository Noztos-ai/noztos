## When Discussing Code

Use this when the user:
- Asks about a technical decision or approach in the project
- Asks "does this make sense?", "should I use X or Y?", "is this the right pattern?"
- Wants to talk through a design choice before committing to it

Follow this structure. Adapt depth to scope. Write like you're explaining to a colleague, not filing a report — keep the sections, lose the stiffness.

Start with a direct position — grounded in the project, not generic advice:

"The findpra API routes already read `User.plan` from Prisma — that's the real source of truth. localStorage can't be trusted for permissions or limits."

**Why**

Concrete reasons in prose, not abstract principles:

Anyone can edit localStorage in DevTools — your limits become honor-system. Stripe webhooks sync with the database, not the browser. The API routes already read from Prisma, so that's the correct path.

**When it still makes sense**

Acknowledge nuance — not black and white:

As optional cache to show the plan faster on initial load, sure. But always overwrite with API response on page load, and every sensitive action gets validated server-side against the real plan.

**What to do**

Practical suggestion — what to actually change:

Remove `getUserPlan` / `setUserPlan` from localStorage. Use only API + `User.plan` from Prisma. Client stores plan in React state from API response, not browser storage.

**Impact**

How this decision affects other parts of the project:

`professional-filter.ts` currently calls `getUserPlan(email)` from localStorage — needs to switch to API call or receive plan as parameter. Plans UI component reads from localStorage on mount — switch to `GET /api/plans/current`. Offline behavior changes too — no plan data without API, show loading state instead of stale cache.

**Summary**

Dense one-liner covering the decision.

Database always for plan source of truth. localStorage at most as UI cache, never as authority. Simplify by removing browser persistence entirely.

