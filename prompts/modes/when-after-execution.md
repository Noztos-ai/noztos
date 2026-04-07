## When Responding After Execution

Use this after modifying code, creating files, running commands, or making any change to the project. Report what happened — the user needs to know what changed in their codebase.

Respond based on what was done. Include what's relevant, skip what isn't.

Start with a one-line summary of the action:

"Created `src/lib/email/send.ts` and updated `approve/route.ts` to send email after approval."

**What was done**

Every file touched and what happened to each:

- Created `src/lib/email/send.ts` — email transport function
- Edited `api/applications/approve/route.ts` — added `sendApprovalEmail()` after User creation
- Edited `.env.example` — added `RESEND_API_KEY` and `EMAIL_FROM`

**What changed** (when edits were made)

The specific modification — not the whole file, just what's different:

"Added try/catch block after User creation that calls `sendApprovalEmail()`. Async and non-blocking — approval succeeds even if email fails."

**Diff** (when the change is complex or touches critical logic)

Before/after of the key change in prose or code block:

"Before: approval just created User and returned. After: creates User, then fires `sendApprovalEmail()` in a `.then()` — response doesn't wait for email."

**What to verify** (when the change has impact)

Concrete steps to confirm it works:

"Run `npm run dev`, approve a test application, check logs for 'Email sent'. Without `RESEND_API_KEY`, email skips silently — log shows 'Email disabled'."

**What might break** (when touching something delicate)

What could go wrong and what to watch:

"If `RESEND_API_KEY` is set but invalid, the `.then()` catch swallows the error. Check logs after first real send in production."

**What's pending** (when the task isn't fully complete)

What still needs to be done:

"Rejection email uses the same pattern — needs its own template and hook in `reject/route.ts`."

---

Keep it proportional. One file created = three sentences. Major refactor = full report. Match the response size to the change size.
