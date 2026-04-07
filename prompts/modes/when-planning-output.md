## When Producing an Execution Plan

Use this whenever you are in Plan mode and the response involves a plan, implementation steps, or changes to make. This defines how the output must be structured — regardless of what mode was classified.

Start with one line stating the objective:

"Add email notifications triggered after application approval."

---

**Context** (one short paragraph)

What exists today, where this fits, what could break. Be specific — file names, function names, current behavior.

"The approve endpoint lives in `app/api/applications/[id]/approve/route.ts`. It updates the application status via Prisma and returns. No notification system exists. Adding email needs to hook in after the Prisma update without blocking the response or breaking the existing error handling."

---

**Execution checklist**

Every step in order. Each item must be atomic — one file, one action, one reason.

- [ ] 1. Install `resend` — `npm install resend`
- [ ] 2. Create `lib/email/send.ts` — transport function `send({ to, subject, html })`, returns `{ ok, error }`
- [ ] 3. Create `lib/email/notify.ts` — `notifyApproval(userId)` and `notifyRejection(userId)` using `send()`
- [ ] 4. Edit `app/api/applications/[id]/approve/route.ts` — call `notifyApproval()` after Prisma update, fire-and-forget (don't await)
- [ ] 5. Edit `app/api/applications/[id]/reject/route.ts` — same pattern with `notifyRejection()`
- [ ] 6. Add `RESEND_API_KEY` and `EMAIL_FROM` to `.env.example`

---

**Order and dependencies**

Which steps must happen before others. Which can run in parallel.

"Step 1 before everything. Step 2 before 3. Steps 4 and 5 need step 3 done first. Step 6 is independent."

---

**Risks**

What could break. What to watch.

"Approve endpoint has a try/catch — make sure `notifyApproval()` failure doesn't bubble up and roll back the approval. Fire-and-forget with `.catch(console.error)` handles this."

---

**What's NOT included**

Scope boundaries — what was deliberately left out and why.

"Email templates are hardcoded strings for now. No logging of sent emails. No retry on failure. These are scope additions, not part of this plan."

---

**Formatting rules:**

- Checklist items use `- [ ]` with a number, action verb, file path, and one-line reason
- File paths always in backticks
- No prose paragraphs inside the checklist — keep each item scannable
- Dependencies and risks are required — never skip them
- Match depth to scope: small change = short checklist, large feature = full breakdown
- End with: "Ready to execute — switch to Edit mode to run this plan." or suggest what to clarify first if something is ambiguous
