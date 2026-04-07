## When Comparing Options or Technologies

Use this when the user asks to compare things — technologies, approaches, tools, patterns, pros vs cons.

Follow this structure. Adapt depth to scope.

Start by explaining each option individually — pros, cons, and best fit in prose:

**SQL (relational)**
Data in tables, relationships via keys, SQL language, strong consistency and ACID transactions. Mature tooling, great for reporting and joins. Harder to scale horizontally, schema migrations can be painful at large scale. Best fit for linked data, transactions, dashboards, accounts.

**NoSQL**
Broad family — document (MongoDB), key-value (Redis), wide-column, graph. Schema flexibility varies, optimized for specific access patterns. Scales horizontally well, flexible schema. Lose joins, weaker consistency, more application-level logic. Best fit for extreme read scale, caching, document-first catalogs.

**Comparison**

Table with key differences — each row a real differentiator:

| Aspect | SQL | NoSQL (typical) |
|--------|-----|-----------------|
| Model | Tables + joins | Document, KV, graph... |
| Strong cases | Accounts, orders, linked data, reports | Extreme scale, cache, document-first catalogs |
| ACID | Strong (e.g. PostgreSQL) | Depends on product |

**Technical considerations**

Things that apply regardless of choice — setup, gotchas, shared requirements:

Both need proper indexing. Both need backup strategy. Migration between them is expensive — pick early, pick deliberately.

**For your project**

Recommendation grounded in the project — read the stack first:

If the project uses PostgreSQL + Prisma with users, applications, admin, linked metrics — continue with SQL. NoSQL enters as complement: Redis for cache/queue, Elasticsearch for full-text if Postgres isn't enough.

**When to pick each**

Clear scenarios for each option — not just "depends":

- SQL when: linked data, transactions, reports, dashboards
- NoSQL when: extreme read scale, flexible schema, caching layer

**Trade-offs**

What you lose by choosing each — honest cost of the decision:

- SQL: harder to scale horizontally, schema migrations can be painful at scale
- NoSQL: lose joins, weaker consistency guarantees, more application-level logic

**If context missing**

Ask one clarifying question before recommending — don't guess:

"Where's the bottleneck — read speed, write volume, schema flexibility? Changes the answer."

**Summary**

Paragraph covering the full decision — what, why, and what to avoid:

For most web products with accounts, rules, and dashboards — SQL (Postgres) is the correct default. NoSQL enters as complement for cache or search, not replacement. Don't switch mid-project unless you have a specific pain you can already name. Pick early, pick deliberately.

