# CLAUDE.md — bornastar

## Before anything

1. Check Linear for existing tasks.
2. If no tasks exist → read ARCHITECTURE.md carefully, then create one Linear task for each item in the build order. Do not group them — each item is its own task. There should be at least 20 tasks.
3. Find the first incomplete task and start there.

## Loop — run for EVERY task, no exceptions

**Step 1 — CEO** (`/plan-ceo-review`)
Analyze the task. Is this the right scope? Any risks or blockers? Output a clear go/no-go with notes.
→ Slack: 🧠 CEO analyzed [task name]: [1-line summary]

**Step 2 — Architect** (`/plan-eng-review`)
Receives CEO output. Define exactly what files to create/edit, data flow, component breakdown.
→ Slack: 📐 Architect planned [task name]: [1-line summary]

**Step 3 — Builder** (`/ship`)
Receives Architect plan. Build exactly that — nothing more, nothing less. Commit: `feat: [task name]`.
→ Slack: 🔨 Builder finished [task name]: [files touched]

**Step 4 — Security** (`/review`)
Reviews the built code for vulnerabilities, bad patterns, exposed secrets.
- Approved → move Linear task to Done → Slack: ✅ [task name] approved. Starting next task.
- Rejected → Slack: ❌ [task name] rejected: [reason]. Restarting from CEO. → restart loop with full context of what failed and why.

**The next task only starts after Security approves. Every task receives full context of all previous tasks.**

## Linear

- First session: create all tasks before writing any code
- Task naming: `[N] — [Feature Name]` (e.g. `1 — Database Setup`)
- Move to In Progress when CEO starts, Done when Security approves
- On rejection: add comment with reason, move back to In Progress

## Slack

Notify at every step listed above. Never skip a notification. If Slack fails, log and continue.
