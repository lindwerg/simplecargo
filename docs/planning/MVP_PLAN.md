# SimpleCargo — MVP Plan & Phased Build Roadmap

> PWA for a rail-wagon freight **forwarder** ("Приоритет Логистика"). We rent gondola
> wagons (ПВ) from owners at a fixed cost and resell transport to clients; profit = margin.
> The system's long-term job is to auto-maintain **"Отчет ПВ Приоритет Логистика.xlsx"**
> (monthly sheets, 17 columns, one row per completed wagon trip/deal) from heterogeneous
> dislocation files that arrive by email.

This document is the **single source of build order**. It supersedes any sequencing implied
by the individual research findings. Where the research designed the full ingestion engine,
this plan defers it. **The stated MVP is "user auth + login to a dashboard only."**

---

## 0. Locked Decisions (read before anything)

These resolve the contradictions the adversarial critics found. They are non-negotiable for
the whole project unless a later ADR explicitly overrides them.

| # | Decision | Rationale / critic resolved |
|---|----------|------------------------------|
| D1 | **Web = Next.js 15 (App Router) + TypeScript.** One service. | stack-fit |
| D2 | **Worker = Python (ARQ on Redis), added in Phase 2 — NOT now.** Drop BullMQ entirely. Python wins because `.xls` needs `xlrd>=2.0.1`, column-shift correction wants pandas/openpyxl, and the future AI extraction layer is Python-native. | stack-fit C1 |
| D3 | **No shared TypeScript types across web/worker.** The contract between them is the Postgres schema + a **versioned Redis pub/sub JSON envelope** (Zod on web, Pydantic on worker). No monorepo shared-types package. | stack-fit C1 |
| D4 | **Auth = Better Auth, email/password.** Names: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` everywhere (never `NEXTAUTH_*`). | stack-fit, auth |
| D5 | **Middleware does optimistic cookie check only.** Authoritative `auth.api.getSession()` runs in the Server Component / route handler. No DB/Redis read in middleware. No experimental Node-middleware runtime on the hot path. | stack-fit C3 |
| D6 | **No PPR, no experimental flags at launch.** Plain SSR + `output: "standalone"`. Pin Next.js to 15.x (avoid the 16.1.x `standalone`+`serverExternalPackages` bug). Revisit PPR only after measuring LCP. | stack-fit H2 |
| D7 | **Migrations run against `DATABASE_URL_DIRECT` (bypass PgBouncer).** App runtime uses `DATABASE_URL`. App refuses to boot if the migration URL points at the pooler. `CREATE INDEX CONCURRENTLY` is hand-written and run out-of-band, never inside Drizzle's transaction. | stack-fit C2, db |
| D8 | **No PgBouncer at MVP.** Single replica + app pool `max:5` will not approach Postgres's 100-connection cap. Add PgBouncer when replicas scale. | mvp-sequencing |
| D9 | **No Redis-backed sessions at MVP.** Better Auth sessions live in Postgres. Redis is provisioned in Phase 0 (so the topology is fixed and reference variables exist) but the app uses it only from Phase 2 onward. | mvp-sequencing |
| D10 | **All cross-service files go to object storage (Railway bucket / S3-compatible), never a per-service volume.** Applies the moment any second service reads a file the worker wrote. | stack-fit H3 |
| D11 | **Timezone policy: store UTC (`TIMESTAMPTZ`), display MSK, parse source dates as MSK.** Source dates like `22.05.2026 13:54` are MSK wall-clock. This prevents ±1-day month-sheet misassignment. | stack-fit #5 |
| D12 | **`оборот, сут` (turnover) = next-loading-event minus this-loading-event** (full RZhD cycle: load → haul → unload → empty return → next load), computed **cross-row per wagon**. The trip-duration formula (`trip_end − arrival_at_loading`) is WRONG and only ever stored as `turnover_provisional=TRUE`, excluded from KPI averages. | domain-correctness CRITICAL-1/2 |
| D13 | **Source B column correction = content-signature typing, never positional "shift right."** Locate the load-state column by value regex `^(ГРУЖ\|ГРУЖЕН\|ПОР\|ПОРОЖ)$`, the waybill by `^[А-ЯЁ]{2}\d{4,}$`, etc. Never fabricate a waybill from a date column. Quarantine if load-state + cargo can't both be located. | domain-correctness CRITICAL-3 |
| D14 | **Wagon checksum validation is advisory (WARNING + `needs_review`), never a hard CRITICAL drop.** Never silently remove a revenue row from the margin report. | domain-correctness HIGH-1, stack-fit M4 |
| D15 | **Никаких выдуманных ESR / road codes.** Trust the ESR inline in Source A and the RZhD classifier import. Every invented `(NNNNNN)` literal from the research is discarded. First occurrence of each report place-name is operator-confirmed. | domain-correctness HIGH-2 |
| D16 | **`Клиент` is never auto-filled from `Грузополучатель`/consignee.** Client = who pays us (the УА counterparty), operator-entered only. Leave NULL + alert. | domain-correctness MEDIUM-4 |
| D17 | **Report rows emit only when `revenue_ua IS NOT NULL AND cost_owner IS NOT NULL`.** Half-filled deals never reach a sheet. Generated reports are **versioned in object storage** (timestamped keys), never overwritten. | domain-correctness MEDIUM-2, stack-fit #6 |
| D18 | **Cross-source event identity** = `(wagon_number, operation_code, operation_datetime_rounded_to_15min)`. Everything else is provenance. The A∩C overlap (same physical movement in full export + subset) must be deduped here, with an explicit test. | stack-fit H4 |

---

## 1. Phase Overview

| Phase | Goal | Ships | Status of ingestion stack |
|-------|------|-------|---------------------------|
| **0** | Auth + dashboard shell on Railway | Login → protected dashboard PWA, CI/CD live | scaffold empty schema only |
| **1.5** | Highest-ROI, no AI | Import existing report.xlsx → real dashboard numbers; manual deal CRUD + export | no email, no worker logic |
| **2** | First automated ingestion | Redis + Python worker; manual file upload; Source C parser; validation; staging→commit | worker born here |
| **3** | Normalization & domain | Station dict, all 4 source parsers, lifecycle state machine, cross-row turnover | full normalization |
| **4** | Deal matching & auto-report | Match movements → deals, field precedence, auto-regenerate xlsx | matching engine |
| **5** | Email agents | Gmail Pub/Sub ingestion + Claude classification/extraction + quarantine review UI | autonomous intake |
| **6** | Realtime + push + hardening | SSE live dashboard, web push, Sentry/observability, RLS/RBAC, rate limiting | production-grade |

> **Sequencing correction (mvp-sequencing critic):** manual deal entry + historical import
> (Phase 1.5) come **before** email/AI ingestion. The boring CRUD path delivers the actual
> product — the auto-maintained margin sheet — to a real operator months sooner than the
> email agent does.

---

## PHASE 0 — Build NOW

**Scope:** scaffold repo + Railway project + Postgres + Redis + GitHub CI/CD + PWA shell +
email/password auth + protected dashboard with placeholder.

### 0.1 Stack (frozen)

- Next.js 15.x (App Router, TypeScript 5.5+ strict), `output: "standalone"`
- Drizzle ORM + `node-postgres` (`pg`) driver
- Better Auth (email/password, Postgres sessions)
- Serwist manifest only (service worker deferred to Phase 6; manifest + apple-touch now)
- pnpm, single package (no monorepo yet)
- Railway: `web` service + Postgres + Redis, one `production` environment, deploy from `main`

### 0.2 Build steps (exact order)

1. **Repo scaffold**
   - `pnpm create next-app@latest` → TypeScript, App Router, `src/` dir, no Tailwind-via-wizard (add Tailwind v4 manually per design-quality rules).
   - Set `next.config.ts`: `output: "standalone"`, security headers block (HSTS, nosniff, X-Frame-Options DENY, Referrer-Policy, Permissions-Policy). **No** PPR, **no** Serwist wrapper yet.
   - `tsconfig.json`: `strict: true`, `exactOptionalPropertyTypes: true`, `moduleResolution: "bundler"`.
   - `.npmrc`: `node-linker=isolated`.

2. **Directory layout** (feature-organized, per web coding-style rule)
   ```
   src/
   ├── app/
   │   ├── (auth)/login/page.tsx
   │   ├── (app)/dashboard/page.tsx
   │   ├── api/auth/[...all]/route.ts
   │   ├── api/health/route.ts
   │   ├── layout.tsx
   │   └── manifest.ts
   ├── components/ (ui/, dashboard/)
   ├── lib/
   │   ├── auth.ts          # Better Auth server instance
   │   ├── auth-client.ts
   │   ├── db/
   │   │   ├── client.ts    # uses DATABASE_URL (pool max:5)
   │   │   ├── migrate.ts   # uses DATABASE_URL_DIRECT; asserts not-pooler
   │   │   └── schema/      # canonical EMPTY tables (see 0.3)
   │   └── env.ts           # zod-validated env, fail-fast at boot
   ├── middleware.ts        # optimistic cookie check only
   └── styles/ (tokens.css, typography.css, global.css)
   ```

3. **Database schema (Drizzle) — scaffold canonical tables EMPTY now**
   Define but do not populate (anchors all future work, prevents schema rewrite):
   - Better Auth tables (`user`, `session`, `account`, `verification`) — auto-generated via `npx @better-auth/cli generate`.
   - `stations`, `station_aliases`, `road_codes` (station dictionary).
   - `counterparties`.
   - `wagons`, `wagon_movements` (with `fingerprint` UNIQUE, `is_primary`, `needs_review`).
   - `deals` (with `report_month`, `status`, `turnover_days`, `turnover_provisional`).
   - `ingested_files`, `quarantine_rows` (validation log).
   - `__drizzle_migrations` (Drizzle-managed).
   > These are **table definitions only** — no ingestion logic. Per mvp-sequencing: scaffold the schema now, build the behavior later.

4. **Migration wiring**
   - `drizzle.config.ts` → `url: DATABASE_URL_DIRECT`.
   - `src/lib/db/migrate.ts` → opens `DATABASE_URL_DIRECT`, runs `migrate()`, `process.exit(1)` on failure. Add boot assertion: refuse if URL host contains the pooler hostname (no-op now, future-proof).
   - Railway `preDeployCommand` → `node --import tsx/esm src/lib/db/migrate.ts` (tsx in `dependencies`).

5. **Better Auth**
   - `lib/auth.ts`: Postgres `Pool` (no Redis secondary storage at MVP — D9), `emailAndPassword.enabled = true`, `requireEmailVerification: false`, `minPasswordLength: 10`, `trustedOrigins = [BETTER_AUTH_URL]` (+ localhost only in dev), `advanced.trustedProxyHeaders: true` (Railway proxy).
   - Catch-all route handler `app/api/auth/[...all]/route.ts` via `toNextJsHandler`.
   - **First user via seed script**, not open signup (internal tool). `src/lib/db/seed-user.ts` reads `SEED_USER_EMAIL` / `SEED_USER_PASSWORD` from env, idempotent (skip if user exists). Run once manually after first deploy.

6. **Middleware (optimistic only — D5)**
   - Check for the presence of a valid signed session cookie; redirect to `/login` if absent. No `getSession()` here.
   - `matcher: ["/dashboard/:path*"]`.
   - Authoritative check lives in `dashboard/page.tsx` (Server Component calls `auth.api.getSession`, redirect if null).

7. **Login page** — client component, `authClient.signIn.email`, Russian error copy ("Неверный email или пароль"), redirect to `/dashboard`. Designed (not a default form) per design-quality: real hierarchy, intentional focus/active states.

8. **Dashboard placeholder** — Server Component, session-gated. Shows operator email + a deliberate empty-state ("Данных пока нет — загрузка отчёта появится на следующем этапе"). Per mvp-sequencing #4: a shell still needs one honest widget; here it's a stat-card scaffold (deals count / margin sum) wired to return zeros until Phase 1.5.

9. **PWA manifest** (`app/manifest.ts`) + `<head>` apple-touch meta. Icons 192/512 (maskable) + 180 apple-touch. **No service worker yet.**

10. **Health endpoint** `app/api/health/route.ts` → `SELECT 1`, 200/503. Used as Railway healthcheck (zero-downtime deploys).

11. **Railway project** (via Railway MCP or dashboard)
    - Create project `simplecargo`, `production` environment.
    - Add services: **web** (Next.js), **Postgres**, **Redis**.
    - Web vars (reference syntax, never hardcoded):
      ```
      DATABASE_URL=${{Postgres.DATABASE_URL}}            # pooler later; direct for now
      DATABASE_URL_DIRECT=${{Postgres.DATABASE_URL}}
      REDIS_URL=${{Redis.REDIS_URL}}                     # provisioned, unused until P2
      BETTER_AUTH_SECRET=<openssl rand -hex 32>
      BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}
      NODE_ENV=production
      ```
    - Use `*.railway.internal` private URLs for DB/Redis (security rule).
    - `railway.json`: `builder: RAILPACK`, `startCommand: node .next/standalone/server.js`, `preDeployCommand` = migrate, `healthcheckPath: /api/health`, `healthcheckTimeout: 60`, `restartPolicyType: ON_FAILURE`, retries 3.
    - Enable Postgres daily backups (7-day retention) — and do one **test restore** before real users (stack-fit gap).

12. **GitHub CI/CD**
    - Connect repo → `production` tracks `main`, deploy on push.
    - **Minimal CI gate** (GitHub Actions) required before merge to `main`: `pnpm install --frozen-lockfile`, `pnpm tsc --noEmit`, `pnpm lint`, `pnpm build`. (No auto-deploy of `main` with zero CI — this is a financial tool. stack-fit #3.)

### 0.3 Phase 0 — Scaffold-now vs later

| Scaffold NOW | Defer |
|--------------|-------|
| Next.js single service, standalone | Redis-backed sessions (D9) |
| Postgres + Drizzle + migration path (D7) | PgBouncer (D8) |
| Better Auth email/password, Postgres sessions | Worker service (Phase 2) |
| `/login`, `/dashboard` gate, `/api/health` | BullMQ/Celery/ARQ — none yet |
| **Canonical DB schema as EMPTY Drizzle tables** | Ingestion/parse/match logic |
| Security headers + nonce CSP middleware | Service worker / Serwist / push (Phase 6) |
| Reference vars, internal DB URL, `BETTER_AUTH_*` | SSE / Redis pub/sub (Phase 6) |
| PWA manifest + apple-touch meta | PPR / experimental flags (D6) |
| Redis service provisioned (topology fixed) | Sentry / Prometheus / structlog (Phase 6) |
| Seed-user script (no open signup) | RLS / RBAC / rate limiting (Phase 6) |
| Minimal CI gate (typecheck/lint/build) | Staging + PR environments, monorepo split |

### 0.4 Phase 0 — Acceptance criteria

- [ ] Pushing to `main` triggers Railway deploy; CI gate (typecheck + lint + build) passes first.
- [ ] `GET /api/health` returns 200 with DB reachable; deploy is held on the old container until it passes.
- [ ] `preDeployCommand` runs migrations via `DATABASE_URL_DIRECT`; a forced pooler URL makes the app refuse to boot.
- [ ] Visiting `/dashboard` unauthenticated redirects to `/login` (middleware) AND the page itself re-checks the session server-side.
- [ ] Seeded operator can log in and land on `/dashboard`; wrong password shows Russian error.
- [ ] Logout clears the session; `/dashboard` is inaccessible again.
- [ ] App installs as a PWA on phone (manifest valid, apple-touch icon present) and renders on desktop.
- [ ] No secret is hardcoded; all DB/Redis credentials come from Railway reference variables and use internal URLs.
- [ ] Security headers present on every response; CSP nonce middleware active (verify no `unsafe-inline`).
- [ ] Postgres backup enabled AND one restore verified into a throwaway DB.
- [ ] Canonical tables exist and are empty; `drizzle-kit migrate` is idempotent on redeploy.
- [ ] LCP < 2.5s on the dashboard (server-rendered text), JS budget for the dashboard route < 150kb gzipped.

---

## PHASE 1.5 — Historical Import + Manual Deal CRUD (highest ROI, no AI)

> The fastest path to a non-empty, demoable dashboard with **real margin numbers** — no
> ingestion pipeline, no email, no worker. (mvp-sequencing #1, #3.)

### Scope
- One-time importer for the existing `Отчет ПВ Приоритет Логистика.xlsx` → `deals` + `report_month`. Parse with SheetJS **in a route handler only** (never the client bundle — dynamic import; same guardrail for the export path).
- Manual deal create/edit UI (the commercial fields no source can ever provide: `Клиент`, `Сумма УА`, `Сумма от Поставщика`, `Счет фактура`, `перевозчик`, `от компании`).
- `margin = revenue_ua − cost_owner` derived on read; row exported only when both present (D17).
- Report **export** to xlsx (openpyxl-equivalent via SheetJS server-side), versioned in object storage (D10, D17), month sheets ordered Jan→Dec.
- Dashboard widgets light up: deals count, margin sum, sum-by-month from imported history.

### Scaffold-now vs later
- **Now:** importer, deal CRUD, export, dashboard aggregates, object storage bucket (D10).
- **Later:** any automated parsing of dislocation sources; turnover is shown as imported, not recomputed.

### Acceptance criteria
- [ ] Importing the real report populates `deals`; dashboard shows correct margin totals matching the spreadsheet.
- [ ] Operator can create/edit a deal; `margin` recomputes; a deal missing revenue or cost is excluded from export but visible in a "pending" view.
- [ ] Export produces a 17-column, Jan→Dec-ordered xlsx; wagon number written as integer (legacy `52266772.0` float-display preserved if matching the original); prior export versions retained.
- [ ] SheetJS never appears in the client/dashboard bundle.

---

## PHASE 2 — First Automated Ingestion (worker is born)

### Scope
- Add **Python worker** service (ARQ, D2) + start using Redis (D9). Object storage already exists (D10).
- Manual file **upload** UI on web → store original to bucket → enqueue parse job.
- Implement **Source C** parser first (17 cols, header row 2 — the simplest).
- Validation pipeline: file-level (magic vs extension, SHA-256 idempotency, header autodetect), row-level (wagon normalization to 8-digit string, date parsing MSK→UTC per D11, Груж/Порож normalization). Checksum = WARNING only (D14).
- `wagon_movements` populated via `fingerprint` dedup; quarantine on hard failures.
- Versioned Redis pub/sub envelope contract defined (Zod ⇄ Pydantic, D3) — even before realtime, to lock the schema.

### Scaffold-now vs later
- **Now:** worker service, ARQ + Redis broker, Source C parser, validation, staging→commit, upload UI, dedup.
- **Later:** Sources A/B/D parsers, station dictionary resolution (raw stored, `needs_review`), matching.

### Acceptance criteria
- [ ] Uploading a Source C file enqueues a job; worker parses and writes `wagon_movements`.
- [ ] Re-uploading the identical file is a no-op (SHA-256 file idempotency).
- [ ] Wagon numbers normalize to 8-digit strings; bad dates / unknown load-states route to `quarantine_rows`, not the live table.
- [ ] Dates store as UTC, render MSK; a 23:30-MSK operation lands in the correct month.
- [ ] Worker liveness visible via `arq:health-check` Redis key; an alert fires if it goes missing.
- [ ] No cross-service file touches a local volume (all via bucket, D10).

---

## PHASE 3 — Normalization & Domain Layer

### Scope
- **Station/road dictionary:** bootstrap from RZhD ESR classifier (verified migration, not best-effort cron — stack-fit gap), parse Source A inline `NAME (ESR)`, short road codes for B/D. No invented codes (D15). Unknown → quarantine queue, operator-confirmed once, then auto-aliased.
- **Sources A, B, D parsers.** Source B uses content-signature column typing (D13), never positional shift; quarantine if load-state+cargo not locatable. Source A load-state derived from `Вес груза > 0` + presence of waybill (domain-correctness HIGH-3), Тип парка/mnemonic only as tie-breaker.
- **Lifecycle state machine** (S0–S9) inferring trips from ordered movements.
- **Cross-row turnover (D12):** `оборот = next_loading_event − this_loading_event` per wagon; provisional fallback flagged and excluded from KPI.
- Cross-source event identity dedup (D18) with an explicit A∩C overlap test.

### Acceptance criteria
- [ ] All 4 sources parse into the canonical `wagon_movements` schema.
- [ ] Source B with the known header/data misalignment is corrected by value signature; waybill is never sourced from a date column; unrecoverable files quarantine.
- [ ] A wagon's turnover is computed cross-row and matches the sample (`оборот=11` is a full cycle, not a 1-day haul).
- [ ] The same physical movement appearing in Source A and Source C is counted once (dedup test passes).
- [ ] No `(NNNNNN)` ESR/road literal exists in the codebase; dictionary is classifier-seeded.

---

## PHASE 4 — Deal Matching & Report Auto-Generation

### Scope
- Match movements → `deals` by `(wagon_number, waybill_number)`; date-window fallback (route-distance-aware cap, single configurable value — domain-correctness MEDIUM-3).
- Field precedence on multi-source merge (operator > A > C > B > D).
- Deal state machine OPEN→ACTIVE→CLOSED; trip-end detection from unload ops.
- `Клиент` never auto-filled (D16); operator alert queue for missing commercial data.
- Auto-regenerate the monthly xlsx on relevant data change; versioned, never overwritten (D17); rows emit only with both revenue+cost (D17).

### Acceptance criteria
- [ ] A completed trip with operator-entered commercial terms auto-produces one report row in the month of completion.
- [ ] Conflicting fields across sources resolve by precedence; conflicts raise an operator alert, never silently pick.
- [ ] A late-arriving old snapshot never reopens a CLOSED+priced deal.
- [ ] Regenerating a report preserves prior versions in object storage.

---

## PHASE 5 — Email-Connected AI Agents

### Scope
- Gmail API `watch()` + Cloud Pub/Sub push → web webhook (HMAC-verified, D-tier security) → enqueue intake.
- SHA-256 attachment fingerprint idempotency (Redis NX + Postgres UNIQUE backstop).
- Heuristic format pre-classify; Claude Sonnet (tool-use + structured outputs + prompt caching, 1h TTL) only for uncertain files. Python applies the LLM column mapping to all rows (never per-row LLM calls).
- Quarantine table + Railway-hosted human-in-the-loop review UI.

### Acceptance criteria
- [ ] An inbound dislocation email auto-ingests end-to-end; duplicates are dropped by fingerprint.
- [ ] Uncertain/unknown formats route to the review queue with the agent's reasoning; operator approve/reject/fix works.
- [ ] Daily `watch()` renewal cron is in place with failure alerting.

---

## PHASE 6 — Realtime, Push & Production Hardening

### Scope
- **SSE** dashboard via Next.js route handler + Redis pub/sub. **In-process fan-out from day one** (one Redis subscriber per web instance, EventEmitter to local streams) — not per-tab subscribers (stack-fit C4). `X-Accel-Buffering: no`, 25s heartbeat, `Last-Event-ID` resume.
- **Service worker (Serwist)** + offline shell + **web push** (VAPID, subscriptions in Postgres, 410 cleanup). Verify SW registers under the production nonce CSP (stack-fit M1). iOS add-to-home-screen onboarding.
- **Observability:** structlog (worker), Sentry (web + worker, error + uptime probe filling Railway's deploy-only healthcheck gap), Prometheus counters for ingestion/turnover/matches.
- **Security hardening:** Postgres RLS as safety net, RBAC roles (admin/operator/viewer), rate limiting (Better Auth built-in for auth, Python SlowAPI for the ingestion webhook only — auth is not Python, stack-fit M3), schema-version readiness probe.
- Then (optional) PgBouncer (D8), staging + PR environments, monorepo split.

### Acceptance criteria
- [ ] A new parsed movement pushes to open dashboards within ~1–2s with no full refetch; Redis connections scale per-instance, not per-tab.
- [ ] PWA installs, works offline (cached shell), and receives a web push on a wagon state change; SW registers under the production CSP.
- [ ] Sentry uptime probe monitors `/api/health`; worker death is alerted via `arq:health-check`.
- [ ] An operator only sees deals permitted by RBAC, with RLS as the backstop.

---

## First Commit Checklist

The very first commit (Phase 0 foundation) should land on a feature branch (not `main`) and include:

- [ ] `package.json` — Next.js 15.x pinned, pnpm `engines`, scripts (`dev`, `build`, `start`, `db:generate`, `db:migrate`, `lint`, `type-check`). `tsx` in `dependencies` (needed by `preDeployCommand`).
- [ ] `pnpm-lock.yaml` committed.
- [ ] `.npmrc` (`node-linker=isolated`).
- [ ] `tsconfig.json` (strict, `exactOptionalPropertyTypes`, `moduleResolution: bundler`).
- [ ] `next.config.ts` — `output: "standalone"`, security headers, **no** PPR/Serwist.
- [ ] `src/middleware.ts` — optimistic cookie check, `matcher` for `/dashboard`.
- [ ] `src/lib/env.ts` — Zod env validation, fail-fast (asserts `BETTER_AUTH_SECRET`, `DATABASE_URL`, `DATABASE_URL_DIRECT`, `BETTER_AUTH_URL`).
- [ ] `src/lib/db/client.ts` (pool max:5, `DATABASE_URL`) + `src/lib/db/migrate.ts` (`DATABASE_URL_DIRECT` + not-pooler assertion).
- [ ] `src/lib/db/schema/` — canonical EMPTY tables + Better Auth tables; first migration generated and committed.
- [ ] `src/lib/auth.ts` + `auth-client.ts` (Postgres sessions, no Redis).
- [ ] `src/app/api/auth/[...all]/route.ts`, `src/app/api/health/route.ts`.
- [ ] `src/app/(auth)/login/page.tsx`, `src/app/(app)/dashboard/page.tsx` (server-gated, placeholder widget).
- [ ] `src/app/manifest.ts` + apple-touch meta in `layout.tsx`; icons in `public/icons/`.
- [ ] `src/lib/db/seed-user.ts` (idempotent first-operator seed).
- [ ] `drizzle.config.ts` (`DATABASE_URL_DIRECT`).
- [ ] `railway.json` (RAILPACK, standalone start, preDeploy migrate, healthcheck `/api/health`).
- [ ] `.github/workflows/ci.yml` — typecheck + lint + build gate on PRs to `main`.
- [ ] `.gitignore`, `.env.example` (names only, no values), `README.md` (run + deploy steps).
- [ ] `docs/planning/MVP_PLAN.md` (this file) + a short `docs/adr/0001-locked-decisions.md` referencing D1–D18.
- [ ] Commit message follows convention; branch opened as PR so the CI gate runs before any `main` deploy.

---

## Open Questions to Confirm With the Operator (cheap, high-impact)

1. **Month-sheet bucketing:** by `Дата окончания рейса` (assumed, D-default) or by `Дата выполнения (отправки)`? Verify against a real sheet before Phase 4 — mis-bucketing moves margin between months. (domain-correctness LOW)
2. **Turnover rounding:** RZhD convention is round-to-whole-day, not ceil. Confirm against real data before locking the formula's final integer step. (domain-correctness LOW)
3. **Waybill format:** real ЭТРАН waybills look like `ЭУ477040` (2 Cyrillic + digits) or pure digits. Lock one regex that matches actual samples before Phase 3 (the naive `^\d{8,}$` rule would reject the given example). (domain-correctness LOW)
