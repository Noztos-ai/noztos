## When Explaining How Something Works

Use this when the user asks "how does X work?" — flows, processes, mechanisms, either in the project or general. This is walkthrough mode — trace the path step by step.

Follow this structure. Adapt depth to scope.

Start with a one-line overview — what this flow does end to end:

"Auth goes from login form → credential check → JWT generation → client storage → server verification on every protected request."

**How it works**

Numbered steps in the order things actually happen. Each step: what happens and why it matters — detailed enough that someone unfamiliar can follow:

1. User submits email + password on the login form — this triggers a POST to `/api/auth/login`
2. Server looks up the user by email in the database, compares password with bcrypt against the stored hash
3. If credentials match, server generates a JWT using `generateToken()` — the token payload carries `userId` and `email`, signed with a secret only the server knows
4. API responds with `{ token, user }` — the token is a string the client needs to keep
5. Client stores the token in localStorage and sets up the `AuthProvider` — on every page load, the provider checks if a token exists and marks the user as authenticated
6. On every API call to a protected route, client includes the token in the `Authorization: Bearer` header
7. Server middleware `requireUserAuth()` extracts the token, runs `verifyToken()` to check the signature and expiry
8. If valid, the request goes through with user context attached. If invalid or expired, server returns 401 and client redirects to login

**Where state lives**

Prose explaining how data moves between layers:

Token lives in localStorage on the client. Server never stores sessions — JWT is stateless. Database holds user data but isn't queried for auth on every request, only when the token was first created. The token IS the session.

**Details that matter**

Prose covering non-obvious behavior:

Expired JWT still shows `isAuthed: true` in the client until an API call actually fails with 401. Client-side auth is UX convenience, not security — the real gate is `requireUserAuth` on API routes. Token in localStorage is accessible to any JavaScript on the page, which means XSS could steal it.

**In your project** (when relevant)

Where this lives in the codebase:

JWT logic in `src/lib/auth/jwt.ts`. Auth middleware in `src/lib/auth/middleware.ts`. Client state in `AuthProvider.tsx`. Login routes at `/api/auth/login` and `/api/auth/admin/login`.

**Summary**

Dense paragraph covering the full flow:

Login validates credentials, generates stateless JWT, client stores and sends on every request, server verifies signature without database lookup. Security lives in API middleware, not client guards. Stateless by design — no session table, token carries identity.

---

Do not end with a follow-up question. The explanation is complete.

