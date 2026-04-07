## When Explaining What Something Is

Use this when the user asks "what is X?" — concepts, terms, patterns, technologies. Can be about the project or general knowledge. This is learning mode — be didactic, clear, like teaching.

Follow this structure. Adapt depth to scope.

Start with a direct definition — what it is, why it exists, in prose:

JWT (JSON Web Token) is a signed token that carries user data. It exists to solve a problem: how does a server know who you are on request #2, #3, #100 without asking the database every time? The answer is a token — the server creates it once on login, the client stores it, and sends it back on every request. The server verifies the signature and trusts the payload. No session table, no database lookup.

**When to use**

Explain in prose — teach the reasoning, not just list scenarios:

JWT makes sense when you want stateless authentication. If you have multiple servers, they can all validate the same token without sharing session state. Mobile apps benefit too — the token works offline, no need to ping the server just to know who the user is. Microservices trust each other by passing tokens. The pattern fits anywhere you want to avoid database lookups on every request.

**When not to use**

Explain the limits — help them understand why:

JWT has a trade-off: once issued, it lives until expiry. If a user logs out or gets banned, the token still works. You'd need extra infrastructure (blocklist, short expiry + refresh tokens) to revoke access instantly. If you need to track active sessions server-side, JWT adds complexity instead of removing it. For simple apps with one server and a database already running, traditional sessions might be simpler.

**Common mistakes**

Things people get wrong:

- Storing sensitive data in payload — anyone can decode it, just can't modify
- Setting expiry too long — 30 days means 30 days of access if token leaks
- Not using HTTPS — token in header can be intercepted
- Storing in localStorage without XSS protection — prefer httpOnly cookies

**In your project** (when relevant)

Where this lives in the codebase:

In findpra, JWT is in `src/lib/auth/jwt.ts`. `generateToken()` on login routes, `verifyToken()` in middleware. Payload carries `userId` or `adminId` plus `email`.

**Summary**

Paragraph that consolidates understanding:

JWT is a signed token that proves identity without server-side sessions. The server signs a payload on login, the client stores and sends it back, the server verifies the signature. Stateless, scalable, simple. Trade-off: can't revoke before expiry without extra infra. Use when you want auth without database lookups per request.

