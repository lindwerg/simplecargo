# SimpleCargo — Architecture (DECIDED)

> Status: **locked for Phase 1**. This is the authoritative engineering design for SimpleCargo,
> the PWA for rail-wagon freight forwarder "Приоритет Логистика". Decisions here override any
> conflicting statement in the research dossier. Where the research findings contradicted each
> other, the contradiction is resolved below and the resolution is final.

---

## 0. Scope discipline (read this first)

The product brief states the MVP explicitly: **user auth + login to a dashboard only.** The research
dossier designed the entire email-ingestion / AI-agent / matching / report-generation engine. That
work is correct but **premature**. We phase it.

| Phase | Deliverable | Services live |
|---|---|---|
| **P1 (MVP — ship now)** | Auth + login → dashboard shell, health check, migrations wired, canonical (empty) schema seeded with station dictionary | `web`, `Postgres` |
| **P1.5 (highest ROI, no AI)** | One-time importer of the existing `Отчет ПВ Приоритет Логистика.xlsx` → `deals`; manual deal CRUD; xlsx export | `web`, `Postgres` |
| **P2** | Manual file upload + one source parser (start Source C), validation, staging→commit; `worker` + `Redis` introduced | `web`, `worker`, `Postgres`, `Redis` |
| **P3** | Station/road resolution, matching engine, lifecycle state machine, turnover automation across all 4 sources | all four |
| **P4** | Gmail Pub/Sub ingestion + Claude extraction agent + SSE realtime + full observability/security hardening | all four |

The four-service topology (web + worker + Postgres + Redis) described below is the **P2+ target**.
P1 deploys only `web` + `Postgres`. Everything else is scaffolded (schema, env-var names, config
skeletons) but not instantiated. This prevents the single largest schedule risk: building the
ingestion cathedral before the login door.

---

## 1. Tech stack (final)

| Layer | Decision | Notes |
|---|---|---|
| Web framework | **Next.js 15.x (App Router) + TypeScript 5.5+ strict** | Pinned to 15.x. **No PPR**, **no Node-runtime middleware** at launch (see §6). `output: "standalone"` for Railway. |
| Package manager | **pnpm ≥ 9** | Single package in P1. Monorepo only when `worker` is born (P2). |
| Styling | **Tailwind CSS v4 + shadcn/ui** | shadcn components copied locally (we own the code). Design per ECC web design-quality rules — not a default template. |
| ORM | **Drizzle ORM + `node-postgres` (`pg`)** | `pg`, not `postgres.js` — no prepared statements, PgBouncer-safe. Plain `.sql` migrations in VCS. |
| Database | **Railway-managed Postgres** | Single source of truth. `TIMESTAMPTZ` everywhere; store UTC, display MSK (see §10). |
| Cache / queue broker | **Railway-managed Redis** | **Not provisioned in P1.** Introduced at P2 for the worker. Auth does **not** depend on it. |
| Auth | **Better Auth (email/password, Postgres sessions)** | Argon2id, built-in rate limiting + CSRF. Env vars use **`BETTER_AUTH_*`** names everywhere. |
| Background worker | **Python + ARQ** (asyncio, Redis-backed) | **DECIDED — see §2.** Not BullMQ, not Celery. |
| Excel parsing | **Python: pandas + openpyxl (`.xlsx`) + xlrd ≥ 2.0.1 (`.xls`)** | Lives only in the Python worker, never in the web bundle. |
| Realtime | **SSE from a Next.js Route Handler + Redis Pub/Sub, per-instance subscriber + in-process fan-out** | P4. See §5. |
| PWA | **Serwist `@serwist/next`** | Manifest + meta in P1; service worker enabled P4 (verified under CSP first — see §6). |
| Object storage | **Railway bucket (S3-compatible)** | For raw dislocation files + versioned report artifacts. **Never local volumes** (see §7). |
| Error tracking | **Sentry (web + worker)** | Wired the day before real users (end of P1.5). |
| Logs | Railway stdout (JSON) → **structlog** on worker, **pino** on web | Built-in Railway logs suffice for MVP. |
| Deploy | **Railway, Railpack builder, GitHub auto-deploy** | CI gate (typecheck + matching tests) required before `main` deploy (see §8). |

### 1.1 Why these and not the alternatives

- **Next.js over SvelteKit/Nuxt/React-Router-7**: deepest React/AI ecosystem (the P4 Claude layer is
  React/Node-native), shadcn data-grid story for wagon tables, official Railway Postgres path, RSC
  removes client fetch waterfalls on the data-heavy dashboard.
- **Drizzle over Prisma 7**: direct parameterized SQL for bulk wagon-movement upserts, readable `.sql`
  migrations committed to VCS, first-class Postgres types (`numeric`, partial indexes, generated cols),
  one-line Railway pre-deploy migrate.
- **Better Auth over Auth.js/NextAuth**: email/password is the *primary* path here (OAuth is future);
  Better Auth owns the full credentials stack (Argon2id, rate limit, CSRF) where NextAuth treats
  credentials as second-class.

---

## 2. The worker-language decision (resolves dossier contradiction)

The dossier contradicted itself three ways: `[jobs]` = BullMQ/Node, `[email-agents]` = Celery/Python,
`[observability]` = ARQ/Python. **Decision: the worker is Python, on ARQ.** Final.

**Rationale**
- The legacy `.xls` (Source D) requires `xlrd ≥ 2.0.1`; the JS `xlsx`/CFB path is flaky on old BIFF and
  is SheetJS's attack surface.
- The column-shift correction (Source B) and heterogeneous parsing are pandas/openpyxl's home turf.
- The P4 Claude extraction layer is Python-native (Anthropic SDK, Pydantic structured outputs).
- ARQ over Celery: asyncio-native, lighter, already what observability assumed (`arq:health-check`).
- **BullMQ is dropped entirely.** Its *concepts* are ported to ARQ: DLQ pattern, job-id dedup for
  report rebuild (debounce bursts), per-job concurrency tiers, exponential backoff.

**Consequence we accept:** no shared TypeScript types between `web` and `worker`. The contract between
them is **(a) the Postgres schema and (b) the Redis pub/sub JSON envelope**, which is *versioned and
validated on both ends* — **Pydantic** in the worker, **Zod** in the web app. This validated envelope
is the real "shared package"; we do **not** build a TS monorepo shared-types package.

### 2.1 REVISION (2026-06-06) — mail.ru ingestion worker is Node/TS, no Redis

> This supersedes the Python/ARQ + Redis + Gmail Pub/Sub decision **for the mail ingestion channel
> only**, per the approved design in [`MAIL_AI_INTEGRATION.md`](./MAIL_AI_INTEGRATION.md). The original
> §2 decision assumed Source-D `.xls` parsing and a Gmail Pub/Sub trigger. The product actually uses a
> shared **mail.ru** inbox, which changes the constraints:

- **Channel:** mail.ru IMAP (poll-based; mail.ru has **no push webhook** and unreliable IDLE), **not**
  Gmail Pub/Sub.
- **Runner:** the mail-ingestion worker is **Node/TypeScript** (`tsx src/worker/mail-worker.ts`),
  **not** Python/ARQ. Rationale: the intake/extraction layer the worker drives
  (`src/lib/requests/extraction.ts`, `xlsx.ts`, the OpenRouter client) is already TypeScript and shares
  **Zod** schemas with `web`. A Python worker would force duplicating that whole layer on Pydantic. The
  legacy-`.xls` concern from the original §2 is moot here — request tables arrive as `.xlsx` (SheetJS in
  `xlsx.ts`), not BIFF `.xls`.
- **Realtime / cross-process events:** **Postgres `LISTEN/NOTIFY`** via the existing `pg` driver,
  **not** Redis pub/sub. Redis is not provisioned (§1: "Not provisioned in P1"; auth uses Postgres
  sessions). The §5 SSE design ("per-instance subscriber + in-process fan-out") is preserved verbatim —
  only the transport changes from Redis to a dedicated `pg.Client` running `LISTEN`.
- **Topology:** still a separate always-on private service (**1 replica** — multiple IMAP connections
  get banned by mail.ru), same repo, `startCommand: pnpm worker`, no `healthcheckPath`, empty preDeploy
  (migrations run on `web`). Node instead of Python; the "separate worker service" spirit of §3 holds.

The Python/ARQ decision **remains in force for any future bulk `.xls` / Source-D dislocation pipeline**
if that work lands — the two workers can coexist. This revision narrows §2 to the mail channel; it does
not delete it.

---

## 3. Railway deployment topology

One Railway **project**, two **environments** (`production` ← `main`, `staging` ← `staging`), with
**PR environments enabled** (focused — only changed services spin up).

```
Railway Project: simplecargo
└── Environment: production            (auto-deploy: main)
    ├── web        Next.js PWA + API routes + SSE + auth     (public)   [P1]
    ├── worker     Python/ARQ — parse, normalize, match      (private)  [P2+]
    ├── Postgres   managed                                              [P1]
    ├── Redis      managed — ARQ broker + pub/sub + cache     (private)  [P2+]
    └── bucket     S3-compatible — raw files + report artifacts         [P1.5+]
```

- **P1 reality:** only `web` + `Postgres` exist. `worker`, `Redis`, `bucket` are created when their
  phase lands.
- All inter-service traffic uses private `*.railway.internal` URLs. No public Redis/Postgres exposure.
- **No PgBouncer in P1/P2.** A single `web` replica with a pg pool of 5 stays far under Postgres's
  100-connection cap. PgBouncer (transaction mode) is added only when we scale replicas; migrations
  will still bypass it (see §4).

### 3.1 `web` — `railway.json` (P1)

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "RAILPACK" },
  "deploy": {
    "startCommand": "node .next/standalone/server.js",
    "preDeployCommand": ["pnpm db:migrate"],
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  },
  "environments": {
    "pr": { "deploy": { "preDeployCommand": [] } }
  }
}
```

- `pnpm db:migrate` runs against **`DATABASE_URL_DIRECT`** (the direct Postgres URL), never the pooler
  (see §4). It boot-asserts the URL is not the pooler host.
- PR environments skip migrations (blank DB).

### 3.2 `worker` — `railway.json` (P2+)

```json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": { "builder": "RAILPACK" },
  "deploy": {
    "startCommand": "arq simplecargo_worker.WorkerSettings",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

- No healthcheck path (it's a queue consumer, not HTTP). Liveness is verified via the
  `arq:health-check` Redis key, alerted from `web` (see §9).
- No `preDeployCommand` — migrations are owned solely by `web` to avoid a race.

### 3.3 Builder

**Railpack** (Railway's default Go builder). Auto-detects Node for `web` and Python for `worker` from
`requirements.txt`/`pyproject.toml`. Switch to a Dockerfile only if a system lib is missing — not
expected. If we ever pin the worker runtime, the Dockerfile would install `python3`, `xlrd`, `openpyxl`.

---

## 4. Database & migrations (resolves migration-vs-pooler conflict)

**Two URLs, non-negotiable separation:**

| Variable | Points at | Used by |
|---|---|---|
| `DATABASE_URL` | Postgres direct (P1/P2) or **PgBouncer** (when pooling is added) | app runtime queries |
| `DATABASE_URL_DIRECT` | **Always** Postgres direct | `drizzle-kit migrate` only |

- DDL through a transaction-mode pooler intermittently breaks (advisory locks, multi-statement
  migrations). Migrations therefore **always** use `DATABASE_URL_DIRECT`. A startup assertion refuses
  to boot the migrate script if its URL contains the pooler host.
- `CREATE INDEX CONCURRENTLY` **cannot** run inside Drizzle's transactional migration wrapper. Such
  indexes are written as **separate, hand-authored, non-transactional** migration steps (or created
  out-of-band). The big `wagon_movements` indexes are created concurrently to avoid blocking ingestion.
- A **readiness probe** (separate from liveness `/api/health`) asserts the applied schema version
  matches the expected `max(id) FROM __drizzle_migrations` — prevents a green deploy over a
  half-migrated schema.

### 4.1 `drizzle.config.ts`

```ts
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./drizzle/migrations",
  dbCredentials: { url: process.env.DATABASE_URL_DIRECT! }, // direct, never pooler
  migrations: { table: "__drizzle_migrations", schema: "public" },
  strict: true,   // prompt on destructive changes
  verbose: true,
});
```

### 4.2 Canonical schema scaffolded in P1 (empty tables)

Defined now so later phases don't trigger a schema rewrite. Core tables:
`stations`, `station_aliases`, `road_codes`, `counterparties`, `wagons`, `wagon_movements`,
`deals`, `ingested_files`, `quarantine_rows`. Auth tables (`user`, `session`, `account`,
`verification`) are generated by Better Auth.

**Two domain-correctness rules baked into the schema from day one** (from the domain critique):

1. **`margin` is exported, not blindly stored.** `deals.margin` is a generated column
   `revenue_ua - cost_owner`, but the **report-export query is the only path that emits a row**, and it
   filters `revenue_ua IS NOT NULL AND cost_owner IS NOT NULL`. A half-filled deal never reaches a sheet.
2. **`turnover_days` is cross-row, not intra-row** (see §11). The column exists, but is populated by the
   lifecycle layer with access to the wagon's prior trip, never by `trip_end - load_arrival` of a single row.

### 4.3 Station/ESR dictionary seed is a launch blocker, not optional

The RZhD ESR base classifier import is a **verified migration** seeded in P1 (a real report row cannot
resolve without it). **No ESR or road codes are hardcoded from memory** — the dossier's invented codes
(three different ESRs for "Асбест") are rejected. Source A carries ESR inline; we trust the file. The
dictionary is seeded only from (a) the RZhD classifier import and (b) ESR codes observed in real
Source A files. First occurrence of each report place-name is operator-confirmed.

---

## 5. Realtime (P4)

**SSE + Redis Pub/Sub.** Not WebSockets (dashboard is read-only to the browser), not polling (defeats
"live" and burns Postgres). Browser uses native `EventSource` (free auto-reconnect via `Last-Event-ID`).

**Critical correction (from stack-fit critique):** per-instance Redis subscriber + **in-process
`EventEmitter` fan-out from day one** — not "later". One Redis `SUBSCRIBE` per Next.js *instance*,
fanned out to all local SSE streams. A per-tab Redis subscriber would exhaust Railway's single-node
Redis connection cap and take down auth + jobs simultaneously. ~20 extra lines, removes the scariest
shared-failure mode.

Route Handler essentials: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, header
`X-Accel-Buffering: no` (defeats Railway proxy buffering), 25 s heartbeat, cleanup on `req.signal` abort.
The worker publishes a **versioned, Zod-validated** `wagon:update` envelope.

---

## 6. Security

| Control | Decision |
|---|---|
| Secrets | Railway Variables + reference variables (`${{Postgres.DATABASE_URL}}`). Never in code/Dockerfile. Internal `.railway.internal` URLs in prod. |
| Auth secret naming | **`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL`** everywhere (the dossier's `NEXTAUTH_*` is wrong for Better Auth and fails to boot). |
| Session validation | **Optimistic signed-cookie check in middleware** (no store hit); **authoritative `getSession()` in the Server Component / route handler**. We do **not** put a DB/Redis read in middleware, and we do **not** use the experimental Node-runtime middleware on the hot path. |
| CSP | Nonce-per-request via middleware (`script-src 'self' 'nonce-…'`, no `unsafe-inline`/`unsafe-eval`). `worker-src 'self'` + `manifest-src 'self'` for PWA. **Verified that the Serwist service worker registers under this CSP in a production build before claiming PWA support** (it silently fails to register otherwise). |
| Security headers | HSTS (2y, preload), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` locked down. Set in `next.config.ts`. |
| Rate limiting | **Better Auth's built-in** limiter on auth endpoints (login lives in the Next app, not Python — SlowAPI cannot protect a route it doesn't serve). Python-side limiting only on the future ingestion webhook. |
| Excel input (P2+) | Python worker only, **always async** (validate size/zip-ratio synchronously, queue the parse). `data_only=True` (no formula eval) + `defusedxml` (no XXE) + `xlrd ≥ 2.0.1` (no macros). 10 MB cap, zip-bomb ratio guard. Formula-injection sanitize on every outbound xlsx cell. |
| Ingestion webhook (P4) | HMAC signature, constant-time compare, private service (no public domain). |
| RBAC / Postgres RLS | Deferred to when >1 role exists and real margin data is loaded. Designed (`admin`/`operator`/`viewer` + RLS safety net) but not built in P1. |

---

## 7. Object storage & report versioning

- Any file touched by more than one service (raw dislocation attachments, quarantined files,
  generated reports) lives in a **Railway bucket (S3-compatible)**, **never a Railway volume** — volumes
  are per-service, single-instance, and not shared across `web`/`worker`. Local-volume cross-service
  access is a guaranteed "file not found" bug.
- **Generated reports are versioned, never overwritten.** Each regeneration writes a timestamped key
  (`reports/2026-08/<iso8601>.xlsx`). A parser regression cannot destroy the last good report; rollback
  is selecting the prior key.

---

## 8. CI/CD

GitHub-connected, Railway native auto-deploy:
- push `main` → production redeploy (watch paths per service once monorepo exists);
- push `staging` → staging; open PR → focused PR environment; merge/close → teardown.

**A CI gate is required before `main` deploys** (this is a financial-margin tool — auto-deploying `main`
with zero CI is how a column-shift regression reaches prod). Minimum merge gate, GitHub Actions:
1. `pnpm type-check` (`tsc --noEmit`)
2. `pnpm test` — the **dedup + matching + turnover** unit tests (the load-bearing correctness logic)
3. (P2+) worker `pytest` for parsers/normalizers, incl. the **Source A∩C cross-source overlap** test

Backups: Railway Postgres daily backups, 7-day retention, **and a documented, tested restore** (an
untested backup is not a backup).

---

## 9. Observability

- **Logs:** structured JSON to stdout (Railway ingests it). `pino` on web, `structlog` on worker with
  request-id / `wagon_number` / `source` context binding. Per-row ingestion at DEBUG; one
  `ingestion_complete` INFO per file (respects Railway's 500 lines/s/replica cap).
- **Errors:** Sentry on both services (`RAILWAY_GIT_COMMIT_SHA` as release), wired at end of P1.5.
- **Health:** `web` `/api/health` (DB ping, liveness gate) + `/api/ready` (schema-version readiness).
  Worker liveness via `arq:health-check` Redis key, checked by a `web` endpoint + Sentry Uptime probe
  (Railway's deploy healthcheck is deploy-time only — Sentry Uptime covers live monitoring for $0).
- **Metrics (P3+):** custom counters — `ingestion_total{source,status}`, `wagons_active`,
  `wagon_turnover_days` histogram, `deal_match_total{status}`. Exposed at `/metrics`; scraped by Grafana
  Cloud free tier when historical trends are needed. MVP logs key events as JSON instead.

---

## 10. Cross-cutting correctness invariants (locked, from critiques)

These are non-negotiable and have unit tests as the CI gate:

1. **Timezone:** parse all source dates as **MSK**, store **UTC** in `TIMESTAMPTZ`, display MSK. A naive
   parse corrupts `turnover_days` by ±1 day at month boundaries and moves a deal into the wrong monthly
   sheet.
2. **One date utility.** openpyxl returns `datetime` directly — do not re-interpret numerics as serials
   unless the cell is genuinely numeric. xlrd path **must** pass `book.datemode` (1900 vs 1904). Every
   parsed date asserted within `[2015-01-01, today+30d]` or quarantined.
3. **Wagon number:** canonical 8-digit zero-padded string: `str(int(float(raw))).zfill(8)`. Checksum
   (Luhn-11) is **advisory WARNING + `needs_review`, never a CRITICAL drop** — never silently remove a
   real revenue row, and the dossier's weight vector is unverified.
4. **Cross-source event identity** = `(wagon_number, operation_code, operation_datetime rounded to
   15 min)`. Everything else is provenance. The same movement in Source A (full) and Source C (subset)
   has different file/row hashes but is one physical event; the A∩C overlap is the case that silently
   double-counts margin — it has a dedicated test. Dedup hashes `COALESCE` NULL `operation_dt` to a
   sentinel (SQL NULLs aren't equal in UNIQUE constraints → silent dup rows otherwise).
5. **Source B column-shift:** correct by **content-signature column typing**, never positional offset
   arithmetic. Locate the load-state column by `^(ГРУЖ|ПОР|ГРУЖЕН|ПОРОЖ)$`, the waybill by its real
   pattern (2 Cyrillic letters + digits, e.g. `ЭУ477040`, OR pure digits — the pure-`\d{8,}` rule would
   reject the canonical example). **Never fabricate a waybill from a date column.** If the waybill can't
   be located, set `NULL` and route to date-window matching; quarantine if load-state + cargo can't both
   be found.
6. **Source A load state:** there is no Груж/Порож column. Derive primarily from `Вес груза (кг) > 0`
   and presence of `Номер накладной` (a loaded leg has a waybill); use `Тип парка`/mnemonic only as
   tie-breakers. Treat РП/НРП as serviceability metadata, **not** load state.
7. **`Клиент` is never auto-filled** from dislocation data (the consignee is not the paying client in a
   forwarder model). It comes only from the commercial deal record; leave NULL and alert.

---

## 11. Turnover (`оборот, сут`) — the single most important formula

The dossier defined this three ways, two of them wrong. **Locked definition:**

> **оборот = full wagon cycle**, measured loading-event to *next* loading-event:
> `turnover_days = T_arrive_loading[trip N+1] − T_arrive_loading[trip N]`,
> where the loading event is the wagon's transition to ГРУЖ at the loading station
> (≈ "дата прибытия на станцию погрузки").

- This is a **cross-row** computation requiring the wagon's prior trip — report rows are therefore built
  **per-wagon, time-ordered**, carrying `prev_loading_ts`. No layer may compute `trip_end − load_arrival`
  of a single row as the final value (that is trip *duration*, not turnover — it omits the empty-return
  leg and undercounts by ~30–50%; the sample row оборот=11 for the ~1-day Асбест→Голышманово haul is only
  sensible as a full cycle).
- A single-trip approximation (`T_trip_end − T_arrive_loading[N]`) is allowed **only** flagged
  `turnover_provisional = TRUE` and **excluded from KPI averages** — it is never written as a final
  оборот.
- Rounding: whole days. Convention to be confirmed against a real sheet before lock (ceil inflates the
  KPI by ~1 day); default to round-half-up pending confirmation.
- Month-sheet bucketing default = month of `trip_end_dt`; **must be verified against a real report sheet**
  (it may bucket by dispatch date col [9]) before committing — mis-bucketing moves margin between months.

---

## 12. Repo structure

### 12.1 P1 — single package (no monorepo)

```text
simplecargo/
├── package.json
├── pnpm-lock.yaml
├── next.config.ts
├── drizzle.config.ts
├── railway.json
├── tsconfig.json
├── .github/workflows/ci.yml
├── docs/
│   └── planning/
│       └── ARCHITECTURE.md          ← this file
├── drizzle/
│   └── migrations/                  ← committed .sql + concurrent-index steps
├── public/
│   ├── manifest.json
│   └── icons/
└── src/
    ├── app/
    │   ├── layout.tsx
    │   ├── login/page.tsx
    │   ├── dashboard/page.tsx        ← server-gated
    │   └── api/
    │       ├── health/route.ts       ← DB ping (liveness)
    │       ├── ready/route.ts         ← schema-version (readiness)
    │       └── auth/[...all]/route.ts ← Better Auth handler
    ├── components/
    │   ├── ui/                        ← shadcn (owned)
    │   └── dashboard/
    ├── lib/
    │   ├── auth.ts
    │   ├── auth-client.ts
    │   └── env.ts                     ← Zod-validated env at boot
    ├── db/
    │   ├── client.ts                  ← pg pool (DATABASE_URL)
    │   ├── migrate.ts                 ← uses DATABASE_URL_DIRECT, asserts not pooler
    │   ├── seed/stations.ts           ← RZhD ESR classifier import
    │   └── schema/
    │       ├── index.ts
    │       ├── auth.ts
    │       ├── stations.ts
    │       ├── wagons.ts
    │       ├── movements.ts
    │       └── deals.ts
    └── middleware.ts                  ← optimistic cookie + nonce CSP
```

### 12.2 P2+ — promoted to pnpm monorepo (when `worker` is born)

```text
simplecargo/
├── pnpm-workspace.yaml               # packages: ['packages/*']
├── packages/
│   ├── web/                          # the P1 tree, moved here
│   │   ├── railway.json              # watch: packages/web/**
│   │   └── src/lib/realtime/envelope.ts   # Zod schema for wagon:update
│   └── worker/                       # Python (own venv, not pnpm)
│       ├── pyproject.toml            # pandas, openpyxl, xlrd>=2.0.1, arq, pydantic, anthropic
│       ├── railway.json              # builder RAILPACK (Python), watch: packages/worker/**
│       └── simplecargo_worker/
│           ├── worker.py             # WorkerSettings, cron jobs
│           ├── intake.py             # SHA-256 fingerprint idempotency
│           ├── parsers/{a,b,c,d}.py  # per-source; B = content-signature typing
│           ├── normalize.py          # wagon no., dates(MSK→UTC), load-state
│           ├── lifecycle.py          # cross-row turnover state machine
│           ├── matching.py           # deal match by (wagon, waybill, date-window)
│           ├── report.py             # openpyxl export → versioned bucket key
│           └── envelope.py           # Pydantic schema for wagon:update (mirrors web Zod)
└── docs/planning/ARCHITECTURE.md
```

The web/worker contract = Postgres schema + the versioned `wagon:update` envelope (Pydantic ⇄ Zod).
No shared TS package.

---

## 13. Config sketches

### 13.1 `package.json` (P1, web)

```json
{
  "name": "simplecargo",
  "private": true,
  "engines": { "node": ">=20.9.0", "pnpm": ">=9.0.0" },
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "node .next/standalone/server.js",
    "type-check": "tsc --noEmit",
    "test": "vitest run",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "tsx src/db/migrate.ts",
    "db:seed": "tsx src/db/seed/stations.ts"
  },
  "dependencies": {
    "next": "^15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "better-auth": "^1.6.0",
    "drizzle-orm": "^0.40.0",
    "pg": "^8.13.0",
    "zod": "^3.24.0",
    "pino": "^9.0.0",
    "date-fns": "^4.1.0",
    "date-fns-tz": "^3.0.0",
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/pg": "^8.11.0",
    "drizzle-kit": "^0.29.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.3.0",
    "vitest": "^2.0.0"
  }
}
```

> `tsx` is in **`dependencies`** (Railway prunes dev deps before `preDeployCommand` runs `db:migrate`).
> `xlsx`/SheetJS is **absent** — all Excel I/O is in the Python worker. PWA deps (`@serwist/next`,
> `serwist`) are added at P4.

### 13.2 `next.config.ts` (P1)

```ts
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",          // required for Railway
  // NO experimental.ppr — boring stable SSR at launch
  headers: async () => [{ source: "/(.*)", headers: securityHeaders }],
};

export default nextConfig;       // withSerwist wrapper added at P4, after CSP verification
```

### 13.3 `src/db/migrate.ts` (boot-asserts direct URL)

```ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.DATABASE_URL_DIRECT;
if (!url) throw new Error("DATABASE_URL_DIRECT is required for migrations");
if (/pgbouncer|pooler/i.test(url)) throw new Error("Refusing to migrate through a pooler URL");

const pool = new Pool({ connectionString: url });
await migrate(drizzle(pool), { migrationsFolder: "drizzle/migrations" });
await pool.end();
```

### 13.4 Environment variables

**`web` (P1):**
```bash
DATABASE_URL=${{Postgres.DATABASE_URL}}          # runtime (direct in P1/P2; pooler later)
DATABASE_URL_DIRECT=${{Postgres.DATABASE_URL}}   # migrations only — always direct
BETTER_AUTH_SECRET=<openssl rand -hex 32>
BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
NODE_ENV=production
APP_TZ_DISPLAY=Europe/Moscow
```

**Added at P2+ (`web` and `worker`):**
```bash
REDIS_URL=${{Redis.REDIS_URL}}
BUCKET_ENDPOINT=...   BUCKET_KEY=...   BUCKET_SECRET=...   BUCKET_NAME=simplecargo-files
SENTRY_DSN=...
# worker, P4:
ANTHROPIC_API_KEY=...
GMAIL_CLIENT_ID=...  GMAIL_CLIENT_SECRET=...  GMAIL_REFRESH_TOKEN=...
INGESTION_HMAC_SECRET=<openssl rand -hex 32>
```

> Redis client on Railway: set `family: 0` (IPv4/IPv6 dual-stack) and `maxRetriesPerRequest: null`,
> or the worker silently fails to connect.

---

## 14. Decisions ledger (one line each)

1. Worker = **Python/ARQ**; BullMQ and Celery rejected. Web↔worker contract = Postgres schema + versioned Pydantic⇄Zod pub/sub envelope.
2. MVP = **auth + dashboard only** (`web` + `Postgres`); ingestion/AI/realtime are P2–P4. Manual deal CRUD + historical-xlsx import (P1.5) ship before any email/AI ingestion.
3. Migrations **always** use `DATABASE_URL_DIRECT`; concurrent indexes are out-of-band; readiness probe checks schema version. **No PgBouncer until replica scaling.**
4. Auth = **Better Auth** (`BETTER_AUTH_*` names), optimistic cookie in middleware + authoritative `getSession()` in RSC. **No PPR, no Node-runtime middleware on the hot path.**
5. Realtime = SSE + Redis pub/sub with **per-instance subscriber + in-process fan-out from day one**.
6. **оборот = loading→next-loading cross-row cycle**; single-trip value only as `turnover_provisional`, excluded from KPIs.
7. Source B fixed by **content-signature typing**, never positional shift; waybill never fabricated from a date column.
8. No hardcoded ESR/road codes — trust Source A inline ESR + RZhD classifier seed (a verified P1 migration). Wagon checksum is advisory, never a CRITICAL drop. `Клиент` never auto-filled.
9. Cross-service files + versioned reports in a **Railway bucket**, never local volumes; reports timestamped, never overwritten.
10. **CI gate** (typecheck + dedup/matching/turnover tests) required before `main` deploys; UTC store / MSK display; tested backup restore.
