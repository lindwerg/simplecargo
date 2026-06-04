# SimpleCargo — Master Roadmap

The single ordered index + progress tracker we walk step-by-step. The deep specs live in `docs/planning/*.md`; **this file is the spine, not a spec** — each card points back to the doc sections to load when we work it.

---

## Working Protocol

We build in planning mode. The loop per step:

1. Operator says **«бери следующее»**.
2. We open the 👉 NEXT card here + load the referenced `docs/planning/*.md` sections.
3. We discuss & plan the step together.
4. On operator approval, Claude executes it.
5. Tick the card ✅, move the 👉 marker to the next step, **commit**.

One step = one focused unit of work + (usually) one commit. We do not skip ahead of the 👉 marker without a deliberate call. Cards are stable-numbered (INFRA-n, P0-n, P15-n, RFQ-n, P2-n …) so we can jump by ID.

**Status legend:** ✅ done · 🚧 in progress · 👉 next · ⬜ todo · 🔒 blocked

---

## Current Position

**Done ✅**
- All planning docs written (`docs/planning/`: ARCHITECTURE, DB_SCHEMA, DOMAIN_MODEL, INGESTION_PIPELINE, MVP_PLAN, PRODUCT_DIRECTIONS, REQUESTS_SOURCING, SCHEMA_DELTA, DESIGN_DIRECTION) + 2 golden fixtures in `docs/planning/examples/`.
- git initialized; private repo `github.com/lindwerg/simplecargo` created; planning pushed.
- `.gitignore` excludes real data.
- **INFRA-1 ✅** — Railway project `simplecargo` (`production`) provisioned: Postgres + Redis (both SUCCESS, internal `*.railway.internal` URLs) + `web` service bound to `lindwerg/simplecargo`@`main` with public domain + all 7 reference vars wired. Daily backups + documented test-restore deferred to P0-12.
- **P0-1 ✅** — Next.js 15.5 scaffold + first-commit config on branch `p0-scaffold` (`build` + `type-check` + `lint` clean). **Not yet merged to `main`.**
- **P0-2 ✅** — Env validation (`env-schema.ts` + eager `env.ts`), DB client (`pg.Pool` max:5), migrate script (refuses pooler URLs), `drizzle.config.ts`, empty migrations journal. `test`/`type-check`/`lint`/`build` clean; pooler URL → exit 1. On branch `p0-scaffold`.
- **P0-3 ✅** — All 15 canonical tables as Drizzle schemas in `src/lib/db/schema/` (DB_SCHEMA §1–§10: auth ×4, geo ×3, counterparties, wagons, ingested_files, wagon_movements, deals, contract_prices, report_rows, quarantine_rows) + first migration `0000_outgoing_zaladane.sql`. `deals.margin` = generated STORED col (operator-confirmed; DB_SCHEMA §7/D7 synced). Verified on fresh Docker Postgres: migrate builds all 15 tables, re-run no-op, margin computes/NULLs, CHECKs enforce. On branch `p0-scaffold`.
- **P0-4 ✅** — Better Auth on the P0-3 tables: email/password, Postgres sessions, first operator seeded as admin. `src/lib/auth.ts`, `auth-client.ts`, `app/api/auth/[...all]/route.ts`, `seed-user.ts` (+ `db:seed:user`). pnpm override `kysely@0.28.17` fixes a transitive better-auth bundling break. Verified on Docker `postgres:16`: seed twice = 1 admin user (UUID id), wrong pw→401, correct→200 + session row + HttpOnly cookie, signup disabled→400. On branch `p0-scaffold`. **Build now imports `env`** (auth route) so it needs the 4 env vars present — CI build (P0-10) must provide them.
- **P0-5 ✅** — `src/middleware.ts` (Edge): optimistic guard via `getSessionCookie` (no DB) on `/dashboard` → 307 `/login`; per-request CSP nonce on every HTML response (broad matcher, `script-src 'self' 'nonce-…'`, no script unsafe-inline). `layout.tsx` set to `force-dynamic` so Next nonces its scripts (static prerender can't carry a runtime nonce). Verified on Docker: headless `/` loads with 0 CSP violations, all 11 scripts nonced, nonce unique/req; no-cookie `/dashboard`→307, with-cookie→passes; `/api/auth/ok` 200. On branch `p0-scaffold`.
- **P0-6 ✅** — Design-system foundation: Tailwind v4 (`@tailwindcss/postcss`, no config file), `src/styles/tokens.css` (OKLCH dark+light, verbatim from DESIGN_DIRECTION §2) + `typography.css` (self-hosted Inter via `unicode-range` subsets incl. Cyrillic + single Geist Mono Variable with `size-adjust`/`ascent-override`; both preloaded), `globals.css` `@theme inline` mapping every token + shadcn vars re-skinned to tokens. shadcn installed (Button), `data-theme` theme via server-read cookie (no inline script → CSP-clean, no FOUC). Verified on `pnpm dev` + Playwright: both themes resolve live, `bg-surface-1`→oklch, amber Button `oklch(.78 .155 75)` @ `--radius-md`, no overflow @320, grep clean (0 color literals outside tokens.css). On branch `p0-scaffold`.

- **P0-7 ✅** — Money utils + 6 core primitives on the P0-6 foundation. `src/lib/format.ts` (`formatRub` symbol-leading `₽ 1 234 567`, `formatRubShort`, `vatAmount`/`withVat` rate-as-percent-arg, `DEFAULT_VAT_RATE=22`, no `0.22` factor); `Money`/`StatTile`/`StatusPill`/`EmptyState`/`SkeletonRow`/`ErrorState` in `src/components/ui/`; `status-pulse`+`shimmer` keyframes; type scale wired into `@theme inline` (P0-6 gap — `text-xl/display/md` now resolve to tokens). 21 unit tests, `0.22` grep=0, Playwright dark+light verified (glyph≠color, money neutral, reduced-motion freezes, no 320 overflow). On branch `p0-scaffold`.

- **P0-8 ✅** — Funnel nav shell + designed login + gated dashboard. **ADR-D12 confirmed → funnel** (`/`→`/requests`, Запросы→Направления→Отчётность). `nav/FunnelNav.tsx` (desktop rail ≥768 + amber scaleX underline / mobile bottom bar) + `UserMenu.tsx`; `(app)/layout.tsx` (server getSession gate + MSK month) wrapping `dashboard` (email + zeroed StatTiles + empty-state) and three gated placeholder tabs; `(auth)/login` (anti-template split, RU errors); `/`→`/requests`; PWA meta in root layout; middleware guards all four app routes. Verified on Docker pg + seeded operator via `next start` (prod): full auth flow, nav, sign-out, no overflow 320–1440, 17/17 scripts nonced, both themes. On branch `p0-scaffold`.

- **P0-9 ✅** — PWA manifest + generated icons + health/ready. `app/manifest.ts` (standalone, ru, theme/bg `#15161a`, 192/512 any+maskable); `scripts/generate-icons.ts` (`pnpm icons:generate`, sharp added as devDep) rasterizes an SC monogram → committed `public/icons/*`; `api/health` (`SELECT 1` raced w/ 5s timeout → 200/503); `api/ready` (applied vs `public.__drizzle_migrations` count vs journal); `migrate.ts` pins migrations table to `public`; pure `isSchemaReady` + tests; layout icon meta. Verified live (local PG): health/ready 200, manifest+links served, 503-on-DB-down in 0.63s. On `p0-scaffold`.
- **P0-10 ✅** — GitHub Actions merge gate `.github/workflows/ci.yml` (PR→main + push main): `install --frozen-lockfile` → `type-check` → `lint` → `test` → `build`; pnpm 10 + node 22; build-env scoped to the build step (dummy non-secret vars; NODE_ENV=production job-wide would drop devDeps). **PR #1** (`p0-scaffold`→`main`) opened — CI **green**, intentionally NOT merged. Required-check enforcement needs branch protection, which is gated behind GitHub Pro on private repos → **repo made public** (secret-scanned clean first) + **ruleset "Protect main"** (required check `build` strict + no-deletion + non-fast-forward). On `p0-scaffold`.

**👉 NEXT — P0-11** · Contrast + A11y Audit + Optimistic Physics Hook. Contrast audit all token pairs both themes (body/money ≥4.5:1, large/UI ≥3:1) + fixes; Playwright axe on `/requests`+`/dashboard`; `hooks/useOptimisticStatus.ts` (snapshot→apply→mutate→rollback).

> `web`'s first real deploy stays held: PR #1 is green but NOT merged. `/api/health` now exists, so the deploy blocker is cleared — merge-to-main + Railway deploy + PG backup/tested-restore + LCP/bundle checks are all done together at **P0-12** (end-to-end live validation).

---

# Milestone: INFRA (already-done + Railway provisioning)

### ✅ INFRA-0 · Planning + Repo Bootstrap
Planning docs, git, private GitHub repo, `.gitignore`. **Done.**

### ✅ INFRA-1 · Railway Project + Services
> Provisioned via Railway MCP. project `simplecargo` id `9e29a123-2b94-445c-904a-5f3c9e37b95b`, env `production` id `f96f453a-b070-4d09-8f7b-881f1fad8cc6`. Services: Postgres `ac8b5894…`, Redis `199ac8f8…`, web `5677490b…` (domain `web-production-b893f.up.railway.app`). 7 reference vars set on web. **Open:** enable Postgres daily backups (dashboard) + documented test-restore → P0-12.
- **Goal:** Provision Railway project, Postgres, Redis, web service with all reference vars wired.
- **Deliverables:** project `simplecargo` (`production` env); Postgres + Redis; `web` service → `lindwerg/simplecargo` `main`; reference vars `DATABASE_URL`, `DATABASE_URL_DIRECT`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NODE_ENV`; Postgres daily backups + one documented test restore.
- **Acceptance:** `railway status` all green; DB/Redis use `*.railway.internal` private URLs; every secret uses `${{Service.VAR}}` reference syntax (no literals).
- **Depends on:** none — MCP reconnected + authed ✅.
- **Read:** ARCHITECTURE §3, §3.1, §13.4; MVP_PLAN §0.2 step 11.

---

# Milestone: P0 — Auth + Two-Tab Dashboard Shell

### ✅ P0-1 · Repo Scaffold + Config Files
> On branch `p0-scaffold` (commit `4e7dfb1`). Next 15.5.19 pinned (D6). `build`/`type-check`/`lint` clean, `.next/standalone/server.js` emitted. Layout uses MVP_PLAN paths (`src/lib/db/`, route-groups). ESLint via legacy `.eslintrc.json` (`next lint`). Tailwind deferred to P0-6.
- **Goal:** Init Next.js 15 app with all first-commit config.
- **Deliverables:** `create-next-app` (TS, App Router, `src/`); `next.config.ts` (`output:"standalone"`, 5 security headers, no PPR); `tsconfig` (`strict`, `exactOptionalPropertyTypes`, `moduleResolution:"bundler"`); `.npmrc` `node-linker=isolated`; scripts `dev/build/start/type-check/test/db:generate/db:migrate/db:seed`, `tsx` in deps, pinned versions; `pnpm-lock.yaml`; `.env.example` (names only); `railway.json` (Railpack, standalone, `preDeployCommand: pnpm db:migrate`, healthcheck `/api/health`, ON_FAILURE x3).
- **Acceptance:** `pnpm build` + `pnpm type-check` clean from fresh checkout; no PPR, no Serwist wrapper.
- **Depends on:** none.
- **Read:** MVP_PLAN §0.1, §0.2 steps 1-2, First Commit Checklist; ARCHITECTURE §3.1, §13.1-13.2.

### ✅ P0-2 · Env Validation + DB Client + Migrate Script
> Delivered on `p0-scaffold`. `src/lib/env-schema.ts` (side-effect-free Zod contract + `loadEnv`) + `src/lib/env.ts` (eager `env = loadEnv()`, `process.exit(1)` on fail); `src/lib/db/client.ts` (`pg.Pool` max:5 on `DATABASE_URL` + drizzle); `src/lib/db/assert-direct-url.ts` (pooler-refusal guard, unit-tested) + `migrate.ts`; `drizzle.config.ts`; `drizzle/migrations/meta/_journal.json` empty journal; `vitest.config.ts` (`@` alias). 6 unit tests pass; pooler URL → exit 1. Full idempotent migrate-apply validated at P0-3 (first real migration) / P0-12 (live).
- **Goal:** Fail-fast env at boot; DB pool; migration script that refuses pooler URLs.
- **Deliverables:** `src/lib/env.ts` (Zod, `process.exit(1)` on fail); `src/lib/db/client.ts` (`pg.Pool`, `max:5`, `DATABASE_URL`); `src/lib/db/migrate.ts` (opens `DATABASE_URL_DIRECT`, regex-asserts not pooler, runs drizzle migrate); `drizzle.config.ts` (postgresql, `url:DATABASE_URL_DIRECT`, `strict`).
- **Acceptance:** pooler URL → throws+exit 1 (unit-testable); `db:migrate` idempotent; missing env crashes at import with clear message.
- **Depends on:** P0-1.
- **Read:** MVP_PLAN §0.2 steps 3-4; ARCHITECTURE §4, §13.3.

### ✅ P0-3 · Canonical DB Schema (empty tables)
> Delivered on `p0-scaffold`. 11 schema modules in `src/lib/db/schema/` (auth, geo, counterparties, wagons, ingest, movements, deals, contracts, report, quarantine + index barrel) = 15 tables, CHECK constraints transcribed from the SQL DDL, 4 partial indexes (`idx_wm_load_event`, `idx_wm_review`, `idx_deals_pending`, `idx_quarantine_unresolved`), `ux_wm_fingerprint` UNIQUE, self-FK `wagon_movements.superseded_by`. `deals.margin` = `GENERATED ALWAYS AS (revenue_ua - cost_owner) STORED` (operator decision over DB_SCHEMA §7-omission; DB_SCHEMA D7/§7 updated to match). First migration `drizzle/migrations/0000_outgoing_zaladane.sql` committed. `client.ts` now `drizzle(pool, { schema })`. Verified on ephemeral Docker `postgres:16`: 15 tables built, re-migrate no-op, margin computes (30000) / NULLs on missing input, CHECK + generated-write rejection enforced. `type-check`/`lint`/`build`/`test` clean.
- **Goal:** Define all domain tables as empty Drizzle schemas; generate + commit first migration.
- **Deliverables:** Better Auth tables (`@better-auth/cli generate` → `schema/auth.ts`); `schema/{stations,wagons,movements,deals,files,counterparties}.ts`; `wagon_movements.fingerprint` UNIQUE + `event_key` plain index + `is_primary`/`needs_review`/`turnover_provisional`/`superseded_by`; `deals.margin` as generated col `revenue_ua - cost_owner`; partial indexes (`idx_wm_load_event`, `idx_deals_pending`, `idx_wm_review`, `idx_quarantine_unresolved`); first migration `.sql` committed.
- **Acceptance:** `db:migrate` builds all tables on fresh PG, re-run is no-op; `margin` generated (not app-computed); `fingerprint` UNIQUE.
- **Depends on:** P0-2.
- **Read:** MVP_PLAN §0.2 step 3, §0.3; ARCHITECTURE §4.2, §10; DB_SCHEMA §1-§10, §12.

### ✅ P0-4 · Better Auth + Seed-User Script
> Delivered on `p0-scaffold`. `src/lib/auth.ts` — `drizzleAdapter` maps the plural P0-3 tables onto Better Auth's singular models (`user/session/account/verification`); `emailAndPassword` {enabled, `disableSignUp:true`, `requireEmailVerification:false`, `minPasswordLength:10`}; `role` as `additionalFields` (`input:false`, enum admin/operator/viewer); `advanced.database.generateId:false` so uuid PKs use `gen_random_uuid()` instead of BA's string ids; `advanced.trustedProxyHeaders:true` (Railway); dev-only `localhost:3000` trustedOrigin. `auth-client.ts` (`createAuthClient`); `app/api/auth/[...all]/route.ts` (`toNextJsHandler`, renders dynamic ƒ). `seed-user.ts` reads `SEED_USER_*` from `process.env` directly (not the global eager env), idempotent via `auth.$context` (`findUserByEmail` → `password.hash` + `internalAdapter.createUser`/`linkAccount`), first user `role='admin'`; `db:seed:user` script (left `db:seed` for P3-1 stations). Transitive fix: pnpm override `kysely@0.28.17` — better-auth bundles `@better-auth/kysely-adapter` which imports root `DEFAULT_MIGRATION_*` exports dropped in kysely 0.29 (the adapter is unused; we use drizzle). Verified on Docker `postgres:16`: migrate→15 tables, seed twice = 1 admin user (UUID id), wrong pw→401, correct→200 + `sessions` row + HttpOnly SameSite=Lax cookie + `role:"admin"` in payload, signup→400 no user. `type-check`/`lint`/`build`(NODE_ENV=production)/`test`(6) clean. Note: the auth route imports `env`, so `pnpm build` now requires the 4 env vars present (provide in CI build at P0-10).
- **Goal:** Email/password auth with Postgres sessions; first operator seeded.
- **Deliverables:** `src/lib/auth.ts` (pg pool adapter, `emailAndPassword`, `requireEmailVerification:false`, `minPasswordLength:10`, `trustedOrigins:[BETTER_AUTH_URL]`, `trustedProxyHeaders`); `auth-client.ts`; `app/api/auth/[...all]/route.ts` (`toNextJsHandler`); `seed-user.ts` (env-driven, idempotent, `role='admin'`).
- **Acceptance:** wrong creds → 401, right creds → PG session row; seed run twice = one user.
- **Depends on:** P0-3.
- **Read:** MVP_PLAN §0.2 step 5; ARCHITECTURE §1, §6.

### ✅ P0-5 · Middleware (optimistic cookie) + CSP Nonce
> Delivered on `p0-scaffold`. `src/middleware.ts` (Edge runtime, D5): optimistic guard uses `getSessionCookie` from `better-auth/cookies` (edge-safe, handles prod secure-prefix; NO `getSession()`/DB) — `/dashboard*` without cookie → 307 `/login`. Per-request CSP nonce (`crypto.randomUUID`→base64) set on the request header (`x-nonce` + CSP, so Next nonces its `<script>`) and the response; directives: `script-src 'self' 'nonce-…'` (no unsafe-inline/eval), `style-src 'self' 'unsafe-inline'` (Next/React inline styles + P0-6 Tailwind; ECC web/security.md), `frame-ancestors 'none'`, `object-src 'none'`, etc. **Broad matcher** `/((?!api|_next/static|_next/image|favicon.ico).*)` (CSP on every HTML response per MVP_PLAN §0.4; redirect gated to `/dashboard`) — deliberately fuller than the card's `/dashboard`-only matcher. `next.config.ts` 5 static headers untouched; CSP stays per-request in middleware. **`layout.tsx` → `export const dynamic = "force-dynamic"`**: required because statically-prerendered HTML bakes inline scripts at build with no runtime nonce → `script-src 'nonce-…'` blocks them; forcing per-request render lets Next inject the nonce (verified). OK app-wide — every surface is behind-auth dynamic. Verified on Docker `postgres:16` standalone (static copied): headless `/` → **0 console CSP violations**, all 11 `<script>` carry `nonce=`, React hydrated; CSP nonce differs across 2 requests; no-cookie `/dashboard`→307 `Location:/login`, signed-in cookie→guard passes (404, page lands P0-8); `/api/auth/ok`→200 (unaffected). `type-check`/`lint`/`build`(NODE_ENV=production)/`test`(6) clean.
- **Goal:** Route-guard middleware (cookie presence only); per-request CSP nonce.
- **Deliverables:** `src/middleware.ts` (cookie check → redirect `/login`, `matcher:["/dashboard/:path*"]` / app routes); per-request nonce → `layout.tsx`, `script-src 'self' 'nonce-…'`, no `unsafe-inline`.
- **Acceptance:** unauth `/dashboard` → 307 `/login`; CSP header has nonce, no `unsafe-inline`; middleware never calls `getSession()` or DB.
- **Depends on:** P0-4.
- **Read:** MVP_PLAN §0.2 step 6; ARCHITECTURE §6; ECC web/security.md.

### ✅ P0-6 · Design Tokens + Typography + Tailwind Wiring (DS-01/02/03)
> Delivered on `p0-scaffold`. Tailwind v4 wired via `@tailwindcss/postcss` (`postcss.config.mjs`, no `tailwind.config`). `src/styles/tokens.css` = DESIGN_DIRECTION §2 verbatim (OKLCH dark + first-class light, reduced-motion block kills pulse not just 1ms, `--vat-default-rate`). `typography.css` self-hosts woff2 from npm (`@fontsource-variable/inter` + `geist`): Inter via 4 `unicode-range` `@font-face` (incl. Cyrillic — UI is Russian) and a single Geist Mono Variable with `size-adjust:100%`/`ascent-override:90%` (money-column CLS guard); `.num`/`.money(--pos/neg/zero)`/`.label-caps` utilities. `globals.css` `@import "tailwindcss"` + `@theme inline` mapping every token (so `data-theme` swaps live) + shadcn vars (`--primary`→accent, `--ring`→accent, `--radius`→`--radius-md`, etc.) re-skinned in both theme scopes. shadcn installed (`components.json`, `lib/utils` `cn`, `components/ui/button.tsx`; ghost/outline hover routed to `surface-2` to keep amber reserved). Theme = **server-read `theme` cookie** on `<html data-theme>` (dark default, ADR-D19) + `ThemeToggle` (attribute flip + cookie) — no inline script, so CSP-clean and FOUC-free. `page.tsx` is a temporary token smoke surface (replaced by P0-8). Verified `pnpm type-check`/`build` clean (`/` 114kB First Load) + Playwright: dark+light both resolve, `bg-surface-1`→`oklch(.15 .013 260)`, amber Button `oklch(.78 .155 75)` @ 7px, money Geist Mono tabular slashed-zero, no 320px overflow; grep = 0 color literals outside tokens.css. Only console error is dev-only `react-refresh` `eval` (CSP `unsafe-eval`) — absent in production. `.env` placeholder added locally (gitignored) so build collects page data.
- **Goal:** Lay the design system foundation before any component.
- **Deliverables:** `src/styles/tokens.css` (full OKLCH dark+light: surfaces, borders, text ladder, amber accent, semantic status, money semantics, viz ramp, elevation, spacing, radii, motion, `--vat-default-rate`; reduced-motion block zeroing durations + killing pulse); `typography.css` (Inter UI + Geist Mono money/IDs, `@font-face` swap, `.num`/`.money`/`.money--pos/neg/zero`/`.label-caps`, preload both fonts, `size-adjust`/`ascent-override` on mono); `globals.css` (Tailwind v4 `@theme inline` mapping all tokens, shadcn vars re-skinned to tokens, `data-theme` toggle).
- **Acceptance:** both themes resolve in devtools; zero CLS in money cols through swap; `bg-surface-1` → OKLCH var; shadcn Button = amber + `--radius-md`; theme toggle < 16ms no FOUC; no hardcoded color outside tokens.css.
- **Depends on:** P0-1.
- **Read:** DESIGN_DIRECTION §2 (tokens.css, typography.css, Tailwind wiring); ECC web/coding-style.md.

### ✅ P0-7 · Money Utils + Core UI Primitives (DS-04/07/08/13)
> Delivered on `p0-scaffold`. `src/lib/format.ts` — `formatRub` (symbol-LEADING `₽ 1 234 567`, U+2212 minus on negatives, NBSP/narrow-NBSP grouping normalized to plain space so the acceptance string is exact; the §4.7 trailing-symbol snippet is illustrative, the acceptance contract wins), `formatRubShort` (`₽ 1.5M`/`₽ 2к`/`₽ 999`), `vatAmount`/`withVat` (rate is a percent ARGUMENT, `rate/100`, default `DEFAULT_VAT_RATE=22` — no `0.22` decimal factor anywhere). Six primitives in `src/components/ui/`: `Money` (mono+tabular, neutral by default, `money--pos/neg/zero` only when `sign`; `full`/`short`/`per-wagon` forms; `vatRate`/`vatTreatment` flags incl. `не плательщик НДС`), `StatTile` (content-driven widths, 3px left rail accent/positive/negative, `xl`/`display` size, compositor `translateY(-2px)` hover only when `href`), `StatusPill` (glyph SHAPE differs by terminal state — `new/sourcing/quoted ●`, `won ◆`, `lost/expired/cancelled ✕` — `aria-label`, `sourcing` dot pulses), `EmptyState` (contextual lucide icon @40% accent tint), `SkeletonRow` (shimmer blocks at exact column widths), `ErrorState` (`inline`/`page`, takes a friendly message string ONLY — never an Error/stack, optional `onRetry`). `globals.css`: `@keyframes status-pulse` + `.status-dot--pulse`, `@keyframes shimmer` + `.skeleton-shimmer` (translateX-only, own reduced-motion kill); **also wired the type scale into `@theme inline`** (`--text-2xs…--text-display`) — P0-6 mapped colors/radii/fonts but not the font-size tokens, so `text-xl`/`text-display`/`text-md` utilities now resolve to the design scale (StatTile `display` is now the largest object; unblocks the P0-8 funnel hero). `page.tsx` extended as the P0-7 smoke surface (replaced by P0-8). Verified: `type-check`/`lint`/`build`(115 kB First Load, NODE_ENV=production)/`test`(21, incl. all P0-7 acceptance cases) clean; `0.22` grep in TS/TSX = 0; Playwright dark+light both intentional (money neutral never amber, H2), `won ◆`≠`lost ✕`, money mono/tabular/right-aligned, skeleton widths mirror the table, reduced-motion freezes pulse+shimmer (`animationName:none`), no 320px overflow (305=305), pill `aria-label`s resolve. Only console error is the dev-only `react-refresh` `eval`/CSP (absent in production).
- **Goal:** Centralize RUB/VAT formatting; ship the always-used primitives.
- **Deliverables:** `lib/format.ts` (`formatRub`, `formatRubShort`, `vatAmount(net,rate)`, `withVat`; rate arg, 22 fallback only); `components/ui/Money.tsx`; `StatTile.tsx` (variant left-rail, compositor hover); `StatusPill.tsx` (per-state glyphs not color-only, `aria-label`, pulse stops under reduced-motion); `EmptyState`/`SkeletonRow`/`ErrorState`.
- **Acceptance:** `formatRub(1234567)`→`₽ 1 234 567`; `vatAmount(100,20)`→20, `(100)`→22; `0.22` literal grep = 0; pill `won`≠`lost` glyph; skeleton widths match table; error never shows raw stack.
- **Depends on:** P0-6.
- **Read:** DESIGN_DIRECTION §4.3, §4.4, §4.7, §4.10.

### ✅ P0-8 · Funnel Nav Shell + Login + Dashboard Shell (DS-05; ADR-D12)
> Delivered on `p0-scaffold`. **ADR-D12 confirmed by operator → funnel adopted** (`/`→`/requests`, three-stage Запросы→Направления→Отчётность). `src/components/nav/FunnelNav.tsx` (client, `usePathname` self-derives active stage — robust superset of the spec's explicit `active` prop): desktop ≥768 48px rail (◆/●/▦ glyphs + live-count badges + ArrowRight connectors, active = weight-620 + 2px amber `scaleX` underline via compositor transform) / mobile <768 fixed bottom tap-only bar (fix H4, no swipe). `UserMenu.tsx` (client; email shown `lg:`+ to fit the 768–1023 band, ThemeToggle, `signOut`→`/login`). `app/(app)/layout.tsx` Server Component shell — authoritative `auth.api.getSession`→redirect `/login`, MSK month label (date-fns-tz + ru), sticky header. `app/(app)/dashboard/page.tsx` (operator email + zeroed StatTiles + EmptyState «Данных пока нет — …следующем этапе»). Three gated **placeholder** tab pages (`requests`/`directions`/`reports` = EmptyState «Раздел появится на следующем этапе» — real boards land P1.5–P1.7). `app/(auth)/login/page.tsx` (client, anti-template split: brand panel w/ display wordmark + funnel motif | form; hand-styled token inputs w/ `--ring-focus`; `signIn.email`, generic RU «Неверный email или пароль», already-auth→`/dashboard`). `app/page.tsx`→`redirect("/requests")` (smoke surface retired; primitives now exercised by the real app). `app/layout.tsx` + `metadata`/`viewport` (PWA app meta, appleWebApp, theme-color per scheme; manifest+icon files deferred to P0-9; "nonce to scripts" already done in P0-5). `middleware.ts` `PROTECTED_PREFIXES` += `/requests /directions /reports`. Verified `type-check`/`lint`/`build`(login 125 kB, tabs 103 kB)/`test`(21) clean; on ephemeral Docker `postgres:16` + seeded operator via `next start` (prod — dev's react-refresh `eval` breaks hydration under our CSP, P0-6 note): unauth `/dashboard`+`/requests`→307 `/login`, `/`→`/requests`; wrong pw→401→RU error no leak; correct→`/dashboard` w/ email + zeroed cards; funnel navigates (active amber underline) desktop rail ≥768 / bottom bar <768; sign-out→`/login` + re-bounce; no overflow 320–1440 (fixed an h1 email-wrap + a 768-band email-width overflow); 17/17 scripts nonced, both themes intentional.
- **Goal:** The grid-breaking funnel nav (Запросы → Направления → Отчётность) + designed login + server-gated dashboard placeholder.
- **Deliverables:** `components/nav/FunnelNav.tsx` (desktop 48px rail w/ live-count badges + amber `scaleX` underline; mobile bottom bar; reduced-motion cross-fade); `app/(auth)/login/page.tsx` (`authClient.signIn.email`, Russian errors, intentional hierarchy/focus states — no default form look); `app/(app)/dashboard/page.tsx` Server Component (`getSession()`→redirect if null, operator email + zeroed StatTiles, Russian empty-state); `app/layout.tsx` (PWA meta, apple-touch, nonce to scripts); ADR-D12 `/`→`/requests` pipeline-home routing.
- **Acceptance:** unauth `/dashboard` redirects (middleware then page check); seeded operator logs in → email + zeroed cards; wrong pw → Russian error; logout invalidates; login passes anti-template checklist; nav renders desktop rail ≥768px / mobile bar below.
- **Depends on:** P0-4, P0-5, P0-7.
- **Read:** MVP_PLAN §0.2 steps 7-8; ARCHITECTURE §6; DESIGN_DIRECTION §4.1; PRODUCT_DIRECTIONS §5.1; REQUESTS_SOURCING §8 (ADR-D12); ECC web/design-quality.md.

### ✅ P0-9 · PWA Manifest + Health/Ready Endpoints
- **Goal:** Valid PWA manifest; liveness + readiness routes.
- **Deliverables:** `app/manifest.ts` (standalone, theme/bg, icons 192+512 maskable + 180 apple-touch); `public/icons/`; `api/health/route.ts` (`SELECT 1` → 200/503, Railway healthcheck); `api/ready/route.ts` (schema-version check vs `__drizzle_migrations`).
- **Acceptance:** Lighthouse PWA installable; `/api/health` 200 when DB reachable, 503 on fail; healthcheck wired with 60s timeout.
- **Depends on:** P0-1, P0-3.
- **Read:** MVP_PLAN §0.2 steps 9-10; ARCHITECTURE §9.

### ✅ P0-10 · GitHub CI Gate
- **Goal:** Block merges to `main` without typecheck + lint + build.
- **Deliverables:** `.github/workflows/ci.yml` (PR→main: `install --frozen-lockfile`, `type-check`, `lint`, `build`); first PR from feature branch; required status check in branch protection.
- **Acceptance:** TS error / lint violation fails CI; `main` requires the check.
- **Depends on:** P0-1.
- **Read:** MVP_PLAN §0.2 step 12; ARCHITECTURE §8.

### 👉 P0-11 · Contrast + A11y Audit + Optimistic Physics Hook (DS-14/15)
- **Goal:** Gate before real sessions: contrast in both themes + reusable optimistic-status hook.
- **Deliverables:** contrast audit all token pairs (body/money ≥4.5:1, large/UI ≥3:1) dark+light; fixes applied to tokens.css; Playwright axe script on `/requests`+`/dashboard` both themes; `hooks/useOptimisticStatus.ts` (snapshot→apply→mutate→rollback, transform/opacity flip, visible error feedback).
- **Acceptance:** zero WCAG AA failures both themes; axe clean on CI; lane advance < 200ms INP @4× throttle; rollback reverts row + shows error in one render cycle; no full-table re-render on flip.
- **Depends on:** P0-6, P0-8.
- **Read:** DESIGN_DIRECTION §3, §6, §7.

### ⬜ P0-12 · Phase 0 End-to-End Validation
- **Goal:** Smoke every P0 acceptance criterion against the live Railway deploy.
- **Deliverables:** manual run of all 12 items in MVP_PLAN §0.4; Postgres backup test-restore documented in `docs/ops/backup-restore.md`; dashboard LCP < 2.5s; dashboard JS bundle < 150kb gz.
- **Acceptance:** all 12 §0.4 items green; restore documented.
- **Depends on:** INFRA-1, P0-1…P0-11.
- **Read:** MVP_PLAN §0.4; ARCHITECTURE §8.

---

# Milestone: P1.5 — Historical Import + Direction CRUD + ПСЦ Rates

### ⬜ P15-1 · Pricing + Direction Migrations
- **Goal:** Create `directions`, price-book tables, and `deals.direction_id` alter in one wave.
- **Deliverables:** `directions` (rates nullable, `order_id` nullable, `is_synthetic`, `rate_model`, `direction_status` enum, indexes on status / route / order_id); `deals` ALTER + `direction_id` + `direction_match_method` (nullable FK) + `idx_deals_direction`; `counterparty_contracts`, `price_protocols` (`supersededBy` self-FK), `price_protocol_rates` (route index); `psc_side` enum.
- **Acceptance:** `drizzle-kit migrate` clean; legacy deals without `direction_id` still valid; rate line queryable by `(protocolId, originRaw, destRaw, wagonType)`; supersede chain queryable.
- **Depends on:** P0-3.
- **Read:** SCHEMA_DELTA §3.2, §4.1, §9.2, §9.4; PRODUCT_DIRECTIONS §1.2, §10.

### ⬜ P15-2 · Manual ПСЦ Rate-Table Entry UI
- **Goal:** Operator hand-enters a price protocol so directions can resolve rates.
- **Deliverables:** `POST /api/price-protocols` + `/api/price-protocol-rates`; form: contract ref, counterparty, side (auto from РНС role), VAT (22% inclusive default), validity; rate-line list (origin raw, dest raw, wagon type, rate/wagon).
- **Acceptance:** protocol with 2+ lines saves; direction can look up snapshot rate; new приложение marks old `superseded`.
- **Depends on:** P15-1.
- **Read:** SCHEMA_DELTA §9.2, §9.3; PRODUCT_DIRECTIONS §10 items 3-4.

### ⬜ P15-3 · Manual Direction CRUD API + Form
- **Goal:** Operator creates/edits a Direction with lifecycle state machine enforced server-side.
- **Deliverables:** `POST/PATCH/DELETE /api/directions`; form (route raw+optional ESR, cargo, wagon count, tonnage, rates w/ explicit confirm action, client picker w/ D16 warning, owner picker); activation guard (§1.3 prerequisites); audit `status_changed_at/by`.
- **Acceptance:** draft saves with null rates; activation blocked until guards met; `client_rate ≤ owner_rate` → hard warning; client never auto-filled (D16).
- **Depends on:** P15-1.
- **Read:** PRODUCT_DIRECTIONS §1.2, §1.3; SCHEMA_DELTA §3.2.

### ⬜ P15-4 · Historical ПВ xlsx Import → deals linked to directions
- **Goal:** One-time import of `Отчет ПВ Приоритет Логистика.xlsx` into `deals`, assigned to directions.
- **Deliverables:** `POST /api/import/historical` (multipart; SheetJS server-only via dynamic import; parses 17 cols + `report_month` from sheet name; wagon → 8-digit zero-padded; upsert by natural key); UI to assign each deal to a direction or create `is_synthetic` direction; `direction_match_method='historical_import'`.
- **Acceptance:** real report imports w/ correct row count + margin totals; SheetJS absent from client bundle; re-import idempotent; D17 margin matches source.
- **Depends on:** P15-3.
- **Read:** MVP_PLAN §1.5, D17; PRODUCT_DIRECTIONS §5.5, §6; ARCHITECTURE §10 inv 3.

### ⬜ P15-5 · `direction_kpis` View + Direction Card Grid + Drill-In
- **Goal:** Live Направления tab + per-direction drill-in from imported history.
- **Deliverables:** non-materialized `direction_kpis` view (counts via `deals.direction_id`, D17 margin gate, R1); card grid (5 states draft/wired/live/error/archived, filter bar, earned margin, shimmer on numerals, 1→2→3-col responsive); `/directions/[id]` drill-in (4-stat header Отгружено/Заработано + placeholders, per-wagon table w/ provisional turnover asterisked & excluded).
- **Acceptance:** cards reflect DB rows; `wagons_shipped` counts through deals not movements; earned margin = D17; provisional turnover excluded from averages; shimmer only on number slots.
- **Depends on:** P15-3, P15-4; uses DS components (DataTable DS-06, RequestCard/coverage patterns).
- **Read:** SCHEMA_DELTA §5; PRODUCT_DIRECTIONS §4.1, §4.2, §4.6, §5.2, §5.3.

### ⬜ P15-6 · Tab 2 Отчётность PV Table + xlsx Export + Object Storage
- **Goal:** 17-col ПВ table for completed deals + versioned xlsx export to Railway bucket.
- **Deliverables:** Railway bucket `simplecargo-files` + `BUCKET_*` env; `/reports` route (paginated 17-col table, col order per §5.5, filters Month/Client/Direction/Owner/Status, footer totals); `GET /api/reports/export` (SheetJS, Jan→Dec sheets, rows only where `revenue_ua IS NOT NULL AND cost_owner IS NOT NULL`, timestamped key `reports/YYYY-MM/<iso>.xlsx`, never overwrite); "От компании"="Приоритет Логистика" hardcoded config (ADR-D7); download link.
- **Acceptance:** export matches 17-col layout, wagon numbers as integers (no `.0`); prior versions retained; "От компании" not editable; filter subsets correct.
- **Depends on:** INFRA-1, P15-4.
- **Read:** MVP_PLAN §1.5, D17; PRODUCT_DIRECTIONS §5.5; SCHEMA_DELTA §8; ARCHITECTURE §7, §10.

---

# Milestone: P1.6 / P1.7 — RFQ Layer (ADR-RFQ-1)

### ⬜ RFQ-0 · ADR + OQ Confirmation Gate (pre-build, operator)
- **Goal:** Resolve the 4 ADRs + 5 OQs that gate RFQ schema before any migration.
- **Deliverables:** confirm ADR-RFQ-1 (additive schema + sequencing), ADR-RFQ-2 (ПСЦ "save as standing rate" button y/n), ADR-D12 (`/`→`/requests`), ADR-D19/D20 (dark-default + Geist Mono); OQ-1…5 answered in writing (margin formula, VAT defaults, blended-cost).
- **Acceptance:** all 5 OQs answered before RFQ-1 runs; ADR-D12 answer wired into nav (P0-8); OQ-3 VAT 22% confirmed.
- **Depends on:** none (blocks all RFQ items).
- **Read:** REQUESTS_SOURCING §8, §9.

### ⬜ RFQ-1 · RFQ Schema (enums + 5 tables + pipeline view)
- **Goal:** All RFQ enums, tables, additive ALTERs, and the board's read view in one wave.
- **Deliverables:** `schema/requests.ts` (10 enums + `cost_model`); tables `requests`, `request_lines`, `request_owner_quotes`, `client_quotes`, `client_quote_lines`; indexes §5.2-5.5 + `uq_client_quote_live` partial-unique; additive ALTERs `orders.request_id`, `requests.converted_order_id`/`cloned_from_request_id` self-FKs, `price_protocols.seeded_from_owner_quote_id`; `request_pipeline` view (§5.8) w/ `quote_is_live()` (firm + window-overlap + non-expired), `wagons_deliverable`, `owners_responded/polled`.
- **Acceptance:** `drizzle-kit push` clean; `client_suggested_id` nullable; no non-nullable col on existing tables; view returns `wagons_deliverable=0` for all-soft or expired quotes; window-overlap + expired-exclusion unit-tested.
- **Depends on:** RFQ-0, P0-3, P15-1 (orders/price_protocols/counterparties exist).
- **Read:** REQUESTS_SOURCING §5.1-5.8, §2.4-2.5.

### ⬜ RFQ-2 · Request CRUD API (create / list / get / cancel)
- **Goal:** Basic request lifecycle procedures.
- **Deliverables:** `requests.create` (≥1 line, `status='new'`, D16 client SUGGESTED only); `requests.list` (joins pipeline view, filter by status/client); `requests.get` (full drill-in payload); `requests.cancel` (`status='cancelled'`, `cancelled_at`).
- **Acceptance:** 0-line create → validation error; `clientSuggestedId` stored but never written to `orders.client_confirmed_id`; list includes `wagons_deliverable`/`owners_responded`.
- **Depends on:** RFQ-1.
- **Read:** REQUESTS_SOURCING §1.1-1.3, §5.2-5.3.

### ⬜ RFQ-3 · Owner Sourcing API (poll / respond / expire / accept)
- **Goal:** Owner-опрос lifecycle on `request_owner_quotes`.
- **Deliverables:** `ownerQuotes.poll` (rows status `polled`, request → `sourcing` on first); `recordResponse` (wagons_offered, cost_per_wagon, vat_rate, vat_treatment, commitment, avail window, valid_to, cost_model + model fields → `responded`); `setAccepted` (validates `firm`); `requote`.
- **Acceptance:** `vat_rate` default 22, `not_vat_payer` stored & returned; can't accept unresponded quote; toggling acceptance recomputes `wagons_deliverable`.
- **Depends on:** RFQ-1, RFQ-2.
- **Read:** REQUESTS_SOURCING §2.1-2.5, §2.9, §12.1-12.3.

### ⬜ RFQ-4 · Cost-Model Fields (`tech_trip` / `rental`) + margin util
- **Goal:** Cost-stack fields per model + branching projected-margin util.
- **Deliverables:** `cost_model` col; `tech_trip` (`provision_fee`, `tariff_payer`); `rental` (`rent_per_wagon_day`, `expected_turnover_days`, `provozn_loaded/empty`, `repositioning_cost`, all net + VAT-tagged); margin util branching on model; "excluded terms" red warning for rental empty-run/provozn.
- **Acceptance:** rental margin = null until `expected_turnover_days` set; tech_trip & rental formulas per §12; VAT util takes `vat_rate` arg (no hardcoded 0.22).
- **Depends on:** RFQ-1, RFQ-3.
- **Read:** REQUESTS_SOURCING §12.1-12.3, §2.6.

### ⬜ RFQ-5 · Client Quote API (draft / send / re-quote / decide)
- **Goal:** Client-quote versioning + negative-margin guard.
- **Deliverables:** `clientQuotes.create` (draft + lines, per-row VAT 22%); `send` (enforces `uq_client_quote_live`, request → `quoted`, hard margin warning when `margin_per_wagon ≤ 0`); `requote` (supersede + bump version); `decide` (accepted→`won` / rejected→prompt loss_reason); SLA-gap detection vs accepted owner `quote_valid_to`.
- **Acceptance:** 2nd live quote w/o supersede → unique-constraint surfaced as readable msg; requote bumps version + supersedes; `sla_gap_warning:true` when client SLA outlives owner validity.
- **Depends on:** RFQ-2, RFQ-3.
- **Read:** REQUESTS_SOURCING §2.5-2.6, §5.5-5.6, §1.3.

### ⬜ RFQ-6 · Loss Intelligence + Clone API
- **Goal:** Structured loss recording + re-sourcing via clone.
- **Deliverables:** `requests.markLost` (loss_reason enum, optional competitor_price/lost_to, → `lost`); `requests.noBid` (reason ∈ {no_capacity, price}, → `no_bid`); `requests.clone` (new request, `cloned_from_request_id`, copies lines + owner quotes reset to `polled`, carries competitor_price).
- **Acceptance:** `lost`/`no_bid` distinct terminals; clone → new `new`-status, original unmodified; competitor_price visible on clone.
- **Depends on:** RFQ-2.
- **Read:** REQUESTS_SOURCING §2.7, §1.2-1.3.

### ⬜ RFQ-7 · Win Conversion (Request → Order + N Directions, atomic)
- **Goal:** One atomic txn creating Order + Directions from a won request.
- **Deliverables:** `requests.convert` (validates `won`, idempotent via `converted_order_id`); 1 `orders` row (`draft`, client_suggested carried, request_id); 1 `directions` per line with ≥1 accepted quote (origin/dest ESR, wagon_count_planned, `rate_owner_suggested`/`rate_client_suggested` from accepted owner + client line); sets `converted_order_id` in same txn.
- **Acceptance:** double-run returns same order id; rates land as `*_suggested` only (no confirmed write, D16/H1); line w/ zero accepted quotes → no Direction (warning).
- **Depends on:** RFQ-2, RFQ-3, RFQ-5, P15-3.
- **Read:** REQUESTS_SOURCING §3.1-3.4.

### ⬜ RFQ-8 · Cross-Request Owner Exposure Warning
- **Goal:** Detect same owner's capacity promised across overlapping live requests.
- **Deliverables:** `ownerQuotes.exposureCheck` (owner+period → Σ wagons_offered vs `counterparties.park_size`); win-conversion double-booking warning (not block).
- **Acceptance:** uses `idx_owner_quotes_exposure` (EXPLAIN); `park_size NULL` → warn not block; double-booked owner → `double_booking_warning` flag.
- **Depends on:** RFQ-3, RFQ-7.
- **Read:** REQUESTS_SOURCING §2.8.

### ⬜ RFQ-9 · Запросы Board UI (status-laned, by-client) + Drill-In + New form
- **Goal:** Main Запросы tab + request drill-in + create form (the RFQ surface).
- **Deliverables:** `/requests` board (desktop 4 active lanes + collapsed Закрыто, sticky lane headers w/ rollup; mobile grouped list; **grouped by client** §11.3; card face §4.6: status, route, cargo, wagons, deliverable coverage micro-bar `scaleX`, owners responded/polled, best/blended net cost Geist Mono, projected margin green/red, excluded-terms warning, SLA chip; SLA-breached pinned top; reduced-motion static dot; `content-visibility:auto`); `/requests/[id]` drill-in (560px drawer / mobile full page: deliverable bar, owner-quote table w/ `★ не плательщик НДС`, cost-stack inputs, client-quote entry w/ live margin preview, margin-guard disabled send, SLA-gap warning, action buttons, optimistic lane flip); `/requests/new` (client_suggested labeled "не подтверждён", wagon_type, cost_basis, valid_until, channel; dynamic request_lines; auto `request_number` R-2026-NNNN; `*_raw` always preserved D15).
- **Acceptance:** coverage = DELIVERABLE not nominal; amber only as CTA fill never money-text on light (H2); no `backdrop-filter:blur` on sticky headers (M1); margin computed client-side, send blocked ≤0 w/ copy; drag-to-advance desktop ≥1280 only; visual regression 320/768/1024/1440 both themes; 0-line submit blocked.
- **Depends on:** RFQ-2…RFQ-6, P0-8, DS components (DataTable DS-06, RequestCard DS-09, DirectionWire/OwnerPollPanel DS-10, FilterBar DS-11, DetailDrawer DS-12).
- **Read:** REQUESTS_SOURCING §4.1-4.6, §6, §11.3; DESIGN_DIRECTION §4.5, §4.6, §4.8, §4.9.

---

# Milestone: P2 — Python/ARQ Worker + Redis + Manual Upload + Source C

### ⬜ P2-1 · Python Worker Service + ARQ + Redis + Queue/DLQ
- **Goal:** Stand up the Python worker on Railway; ARQ wired to Redis; queues + DLQ defined.
- **Deliverables:** `packages/worker/` (repo → pnpm monorepo, `pnpm-workspace.yaml`); `pyproject.toml` (arq, pydantic, redis, structlog, pandas, openpyxl, `xlrd>=2.0.1`); `worker.py` (`WorkerSettings`, Redis `family=0`/`maxRetriesPerRequest=null`, cron publishing `arq:health-check` every 30s); 6 queues (`fetch-email`, `parse-file`, `normalize`, `update-lifecycle`, `match-deal`, `rebuild-report`) + `dead-letter` listener → `quarantine_items`; `railway.json` (Railpack Python, watch `packages/worker/**`, `arq … WorkerSettings`, ON_FAILURE x5); versioned `wagon:update` envelope (`envelope.py` Pydantic + `src/lib/realtime/envelope.ts` Zod); worker added to `production`, `REDIS_URL` ref var.
- **Acceptance:** `arq:health-check` refreshed every 30s; worker restarts on failure; queue table reflected exactly; bad job exhausts → dead-letter w/ payload intact; no shared TS types between web/worker.
- **Depends on:** INFRA-1, P0-12, P15-6 (bucket exists).
- **Read:** MVP_PLAN §2; ARCHITECTURE §2, §3.2, §12.2, §13.4; INGESTION_PIPELINE §4.

### ⬜ P2-2 · `ingested_files` + `quarantine_rows/items` Schema
- **Goal:** Pipeline-support tables for idempotency + quarantine.
- **Deliverables:** `ingested_files` (`file_sha256` UNIQUE, status, source_type, `agent_run` JSONB, `s3_key`, `direction_id` nullable, `column_shift`); `quarantine_items`/`quarantine_rows` (tier CHECK `fatal|recoverable|warning`, reason, `raw_row_json`, `needs_review`).
- **Acceptance:** `file_sha256` UNIQUE blocks dup; tier CHECK enforced; migrations idempotent.
- **Depends on:** P0-3.
- **Read:** INGESTION_PIPELINE §5, §7; SCHEMA_DELTA §4.2; DB_SCHEMA.

### ⬜ P2-3 · File Upload UI + Intake Pipeline (+ direction picker)
- **Goal:** Operator uploads a dislocation file → object storage → parse job enqueued.
- **Deliverables:** `/dashboard/upload` (file picker, source A/B/C/D selector, **direction picker** → `ingested_files.direction_id`); `api/upload/route.ts` (size ≤10MB + zip-bomb guard, SHA-256 fingerprint, bucket write, dup check vs `ingested_files`, Redis NX, enqueue ARQ w/ bucket key + source); `ingested_files` row status `queued`.
- **Acceptance:** same file twice = no-op (SHA-256 + Redis NX); >10MB rejected before bucket; stored in bucket not local volume; movements carry no `direction_id` (R1).
- **Depends on:** P2-1, P2-2, P15-6.
- **Read:** MVP_PLAN §2; INGESTION_PIPELINE §3 Stage 0, §5; ARCHITECTURE §6, §7; PRODUCT_DIRECTIONS §2.1 (Lane B); SCHEMA_DELTA §4.2, §6.

### ⬜ P2-4 · Universal Normalizer Library (worker)
- **Goal:** Single authoritative module of shared normalizers.
- **Deliverables:** `worker/lib/normalizers.py`: `normalize_wagon` (→8-digit), `parse_dt` (datemode + openpyxl path, MSK→UTC, reject outside `[2015-01-01, today+30d]`), `normalize_load_state` (→ГРУЖ/ПОРОЖ), `parse_station`, `normalize_wagon_type`, `normalize_station_name` (NFKD/upper/strip), `WAYBILL_RE`, MSK/UTC, `EXCEL_EPOCH`.
- **Acceptance:** unit tests cover float wagon, `ЭУ477040` + pure-digit waybill match, old `\d{8,}` rejected, 1899 + 1904 epoch serials, MSK→UTC round-trip, load-state synonyms; zero import side effects.
- **Depends on:** P2-2.
- **Read:** DOMAIN_MODEL §3.0, D6/D8/D13; INGESTION_PIPELINE §3 Stage 3a.

### ⬜ P2-5 · Format Detection + Heuristic Source Classifier
- **Goal:** Magic-byte + anchor-column classification, no LLM.
- **Deliverables:** `worker/lib/intake.py` / `parsers/classifier.py` (magic-byte check; anchor scan rows 0-9; `{source, header_row, confidence}`; `stalledInterval` 120s for big `.xls`; F-rules: magic mismatch → fatal quarantine, dup SHA-256 → skip, empty/unresolved → quarantine; H-rule anchor scan).
- **Acceptance:** extension/magic mismatch → fatal quarantine; all 4 sources correctly classified on the 2 golden fixtures; confidence high when ≥3 anchors match.
- **Depends on:** P2-3, P2-4.
- **Read:** INGESTION_PIPELINE §3 Stage 2; DOMAIN_MODEL §6.

### ⬜ P2-6 · Source C Parser + Validation
- **Goal:** Parse Source C (17 cols, header row 2) → `wagon_movements` with full validation.
- **Deliverables:** `parsers/source_c.py` (col 0-16 per §3.C, load-state inference from operation/cargo, `consignee_name_raw` set + `client_id` NULL D7, `load_state_source="mnemonic"`); validation ruleset W/D/G/R (`validate.py`): wagon regex CRITICAL, Luhn-11 → WARNING + `needs_review` (never drop, D3/D5), date-range CRITICAL, soft-range WARNING; quarantine writer preserving full raw row; `ingested_files.status` → complete/quarantined.
- **Acceptance:** Source C upload → movements populated; re-upload no dup rows; 23:30-MSK op stored UTC + right month; bad date/load-state → quarantine not silent drop; checksum fail → `needs_review` insert.
- **Depends on:** P2-5.
- **Read:** MVP_PLAN §2; DOMAIN_MODEL §3.C, §7; ARCHITECTURE §10 inv 1-4.

### ⬜ P2-7 · Row Dedup + event_key Cross-Source Collapse
- **Goal:** Two-layer dedup with source precedence.
- **Deliverables:** `dedup.py`: `fingerprint` (R-01, NULL→`∅` sentinel D10), `event_key` (R-02: wagon ‖ op_code_norm ‖ floor(op_ts/15min)); `INSERT … ON CONFLICT (fingerprint) DO NOTHING`; on `event_key` conflict → higher-priority source `is_primary=TRUE`, loser `is_primary=FALSE` + `superseded_by` (both retained); priority A(3) > C(2) > D(1) > B(0), operator always wins.
- **Acceptance:** same row re-processed → 0 net inserts; A∩C same physical event → one primary, margin not double-counted; NULL coalesced before hashing.
- **Depends on:** P2-6.
- **Read:** DOMAIN_MODEL §7 R-rules, §9 precedence, D9/D10; INGESTION_PIPELINE §3 Stage 3c, §5.

---

# Milestone: P3 — All Parsers + Station Dict + Lifecycle + Email Routing + Forward

### ⬜ P3-1 · RZhD Station/ESR Dictionary + Alias Seed + Resolver
- **Goal:** Bootstrap station dict from RZhD ESR classifier; ESR resolution pipeline; no hardcoded codes.
- **Deliverables:** `seed-stations.ts` (roads + ~10k stations from classifier, `name_normalized`, `ON CONFLICT DO NOTHING`); `seed-aliases.ts` (historical report names `Асбест`/`Голышманово`/…, `source='manual'`, conf 1.0, `alias_normalized` UNIQUE); `station_resolver.py` (3-step: ESR extract → stub insert / normalize-name → alias|name hit / RapidFuzz `token_sort_ratio ≥ 0.82` → fuzzy alias; miss → `STATION_UNKNOWN` quarantine + one alert per distinct value).
- **Acceptance:** no `(NNNNNN)` ESR literal in codebase (D4/D6); all codes from classifier or observed files; seed idempotent; unknown → one quarantine row per unique raw value (not per movement).
- **Depends on:** P2-6.
- **Read:** DOMAIN_MODEL §5; INGESTION_PIPELINE §3 Stage 3a stations, D6; ARCHITECTURE §4.3.

### ⬜ P3-2 · Sources A, B, D Parsers
- **Goal:** Complete all four parsers; Source B content-signature column typing.
- **Deliverables:** `source_a.py` (load-state weight-first → waybill → mnemonic tie-breaker, ESR inline from `NAME (ESR)`, `park_type_raw` metadata only, `consignee_name_raw` set / `client_id` NULL); `source_b.py` (`assign_columns_by_signature`: load-state by `_LOAD_MAP` ≥60%, waybill col excluded if >50% parse as dates D2; CS-03 gate: load-state+cargo unlocatable → file quarantine `COLUMN_SHIFT_UNRESOLVABLE`; waybill-only unlocatable → NULL not fabricated; `column_shift` audit field); `source_d.py` (`xlrd>=2.0.1` `on_demand`, `book.datemode` passed, `estimated_arrival_ts` preferred over deadline, waybill NULL, unnamed cols 18-19 → raw_json, zip-bomb+macro guard).
- **Acceptance:** Source B misalignment corrected by value signature, waybill never from date col; all 4 emit canonical schema; unrecoverable B → quarantine not crash.
- **Depends on:** P3-1.
- **Read:** MVP_PLAN §3; DOMAIN_MODEL §3.A/B/D, §4 (CS-03), D5/D6; ARCHITECTURE §10 inv 5-6.

### ⬜ P3-3 · Lifecycle State Machine + Cross-Row Turnover
- **Goal:** Per-wagon S0-S9 lifecycle from ordered movements; turnover computed cross-row.
- **Deliverables:** `lifecycle/state_machine.py` (S0-S9, transitions on load-state+op combos, station disambig via waybill origin/dest ESR); `turnover.py`: `turnover_days = round((trip[N+1].loading_arrival − trip[N].loading_arrival)/86400)` (standard round D12); provisional fallback `round(trip_end − loading_arrival)` → `turnover_provisional=True`; provisional excluded from KPI averages at query; D-04 outside (0,90] → WARNING.
- **Acceptance:** full-cycle turnover matches sample (оборот=11 not 1-day haul); A∩C same movement counted once (CI dedup test); provisional excluded from dashboard averages; re-runnable same result.
- **Depends on:** P2-7, P3-2.
- **Read:** MVP_PLAN §3; DOMAIN_MODEL §8, D1/D3/D12; ARCHITECTURE §11.

### ⬜ P3-4 · Deal Matching + Field-Merge + Status Machine
- **Goal:** Attach movements to deals by `(wagon, waybill)` w/ date-window fallback; precedence merge; OPEN→ACTIVE→CLOSED.
- **Deliverables:** `deal_matcher.py` (waybill path → attach / create PENDING + `NEW_WAYBILL_NO_DEAL`; no-waybill → fuzzy by wagon+ГРУЖ+|trip_start diff|≤window; 0→PENDING, >1→CONFLICT; date-window cap loaded ≤60d / cycle ≤120d scaled by `dist_total_km`; CLOSED never reopened by late snapshot → anomaly log; all 7 alert types → `operator_alerts`); `field_merge.py` (priority manual(4)>A>C>D>B(0); station_current/dist_remaining always from most-recent op; conflict on equal-priority disagree → `conflict_flags` + `FIELD_CONFLICT`); `Клиент` never auto-filled (D16); `deals.direction_id` set at match time (C1).
- **Acceptance:** completed trip + operator terms → one deal row; conflicts raise alert never silent pick; NULL-waybill falls to date-window not dropped; `margin` absent when revenue or cost NULL.
- **Depends on:** P3-3, P15-3.
- **Read:** MVP_PLAN §4; DOMAIN_MODEL §9, D7/D9/D10; INGESTION_PIPELINE §3 Stage 5; ARCHITECTURE §10 inv 7.

### ⬜ P3-5 · Mailbox Binding Tables + Wire-Up Panel UI
- **Goal:** Owner/client bindings + the n8n-style setup panel.
- **Deliverables:** `direction_owner_bindings` + `direction_client_bindings` (bindingStatus enum, `uq_owner_mailbox_live` partial-unique, hot-path B-tree, forward index); `/directions/[id]/setup` drawer/sheet (Owner+Mailbox node w/ "Проверить", expected-wagons field required when shared, Client+forward_to_email+CC node, flow-diagram strip grey→amber→green→red, "Сохранить и активировать" disabled until §1.3 guards pass) — uses DirectionWire DS-10.
- **Acceptance:** two active bindings on same mailbox w/o `expected_wagon_ids` → constraint error; activation disabled until client set + both rates confirmed + `client_rate > owner_rate` + mailbox bound; shared mailbox w/o wagon list blocks.
- **Depends on:** P15-3, P3-1; uses DS-10.
- **Read:** PRODUCT_DIRECTIONS §3.1, §5.4, §1.3; SCHEMA_DELTA §3.3, §3.4; DESIGN_DIRECTION §4.6.

### ⬜ P3-6 · Gmail Inbound Ingestion (webhook + sender-match routing)
- **Goal:** Gmail `watch()` → Pub/Sub → webhook; HMAC-verified; sender-matched to direction; parsed through locked pipeline.
- **Deliverables:** `api/ingest/gmail/route.ts` (constant-time HMAC compare, SHA-256 attachment dedup Redis NX + PG UNIQUE, enqueue); daily `watch()` renewal cron + failure alert; `email_routing_log` (content_sha256, direction_id, resolution_method, forward_status); `route_inbound_email` ARQ task (Priority 0 Source-A signature guard, Priority 1 sender→`direction_owner_bindings`, Priority 2 quarantine: unknown_sender/ambiguous/attachment_missing; `event_key` dedup still runs; `deals.direction_id` set at match C1); env `INGESTION_HMAC_SECRET` + Gmail creds.
- **Acceptance:** inbound auto-enqueues, dup attachments dropped; invalid HMAC → 401 no job; watch-renewal fail → alert; R-0…R-6 routing correct on fixtures; straggler within grace forwards but doesn't mutate frozen deal (R-6/M2).
- **Depends on:** P3-5, P2-1, P3-2 (all parsers).
- **Read:** PRODUCT_DIRECTIONS §3.2-3.4; INGESTION_PIPELINE §3 Stage 0-1, §5; ARCHITECTURE §6; SCHEMA_DELTA §6.

### ⬜ P3-7 · Auto-Forward to Client (exactly-once)
- **Goal:** After movement write commits, forward processed attachment to client; exactly-once.
- **Deliverables:** `forward_status` outbox col (pending→sent) on `email_routing_log`; forward send in same DB txn as movement write; idempotency on `(content_sha256, direction_id)`; CC list; subject template; `email_router.py` triggered on `deal.status=CLOSED` + prices present + `margin` non-NULL.
- **Acceptance:** same attachment to same direction forwards exactly once on retry; forward failure rolls back send state not movement; `forwarded_at` logged; no email on reopen or provisional data.
- **Depends on:** P3-6.
- **Read:** PRODUCT_DIRECTIONS §3.3 (H3), §3.4 R-5/R-7; INGESTION_PIPELINE §3 Stage 5; SCHEMA_DELTA §6 step 6.

### ⬜ P3-8 · Live Отгружено / Заработано on Cards + Drill-In
- **Goal:** Card grid + drill-in show live counts from matched deals, not just history.
- **Deliverables:** "В пути" from `deals.status='in_transit'`, "Завершено" from `='completed'`; per-wagon table from live movements; mail-stats row (Входящих/Переслано/Ошибок) linking `email_routing_log`; per-wagon quarantine alert badges.
- **Acceptance:** counts change when a dislocation is processed; mail-log link opens routing rows for the direction; alert badges show per-wagon quarantine items.
- **Depends on:** P3-6, P15-5.
- **Read:** PRODUCT_DIRECTIONS §4.1, §5.3.

---

# Milestone: P4 — Deal Matching Refinement + Auto-Report + Invoices/Payments + Cost Model

### ⬜ P4-1 · Deal Status Machine + Price Attachment
- **Goal:** Advance OPEN→ACTIVE→COMPLETE; attach prices from contracts or manual.
- **Deliverables:** `deal_status.py` (`OPEN→ACTIVE` when client+revenue+cost set; `ACTIVE→COMPLETE` when trip-end op + prices; `PENDING→ABANDONED` after 30d no client + `ABANDONED_PENDING`); contract lookup narrowest route match w/in validity, ambiguous → alert; manual entry (priority 4) overwrites contract; API for operator manual price entry; `margin` guarded to export path only (D7).
- **Acceptance:** status transitions fire on correct triggers; manual overwrites contract; `margin` never computed/stored here.
- **Depends on:** P3-4, P15-1.
- **Read:** DOMAIN_MODEL §9; DB_SCHEMA §8.

### ⬜ P4-2 · Invoices + Invoice Lines + Payments (schema + CRUD UI)
- **Goal:** Finance tables at client+period grain + operator CRUD.
- **Deliverables:** migration `invoices`/`invoice_lines`/`payments` (invoiceStatus/paymentStatus enums, `uq_invoice_number`, `uq_invoice_line_row` one row invoiced once, `idx_invoice_line_direction`, VAT fields, no `direction_id` on invoices — multi-direction); `POST/PATCH /api/invoices` + lines, `POST /api/payments`; invoice form (client, period, amount/VAT 22% default, uninvoiced report-row selector), payment form; auto status draft→issued→partially_paid→paid→overdue.
- **Acceptance:** multi-direction invoice representable; allocation rows sum to net; row can't appear in two invoices; payment updates `paid_net` in KPIs; VAT strip correct for 22% inclusive.
- **Depends on:** P15-1, P3-4 (report_rows from live deals); ADR-D4 (VAT resolved).
- **Read:** SCHEMA_DELTA §3.7-3.9; PRODUCT_DIRECTIONS §4.3, §4.4, §4.7.

### ⬜ P4-3 · Per-Direction Оплачено (drill-in + card) + cost_model margin
- **Goal:** Surface Выставлено/Оплачено + unbilled warning; tech_trip/rental margin on deals.
- **Deliverables:** drill-in Block C (invoices table, Оплачено progress bar `paid/invoiced`); card-face `████░░ 67% опл.`; "Незакрытая выручка" amber badge when `Σ revenue_ua − invoiced_net > 0`; `direction_kpis.paid_net` allocation-weighted; cost_model(tech_trip/rental) margin computation on closed deals.
- **Acceptance:** `paid_net` = allocation-weighted sum per §4.4 SQL; unbilled badge appears for completed-but-uninvoiced rows, disappears when all invoiced.
- **Depends on:** P4-2, P15-5, RFQ-4.
- **Read:** PRODUCT_DIRECTIONS §4.1, §4.4, §4.5, §5.3; SCHEMA_DELTA §5.

### ⬜ P4-4 · `lump_sum` Rate Model Support
- **Goal:** Lump-sum directions emit ReportRows via operator confirmation, not per-deal completeness.
- **Deliverables:** "Подтвердить выручку" action on lump-sum direction; worker branch allocating lump revenue across trips or one synthetic row; `direction.rate_model` selector.
- **Acceptance:** lump-sum direction w/ no per-deal revenue still produces margin row after confirm + appears in Tab 2; per-wagon directions unaffected.
- **Depends on:** P4-2, P15-3.
- **Read:** PRODUCT_DIRECTIONS §4.7 (M4); SCHEMA_DELTA §8.

### ⬜ P4-5 · Auto-Report Generation (versioned, debounced)
- **Goal:** Monthly xlsx auto-regenerates on deal close; versioned, never overwritten.
- **Deliverables:** `report/generator.py` + `report_builder.py` (triggered on deal CLOSED; `report_rows` projection of COMPLETE deals where revenue+cost non-NULL; `margin = revenue_ua − cost_owner` only here behind guard; 17 cols [0..16], station via `name_human`/`name_etran`, dates MSK D8, month by `trip_end_ts` w/ `REPORT_MONTH_BASIS` switch, wagon as integer cell, provisional turnover exported but excluded from KPI avg; new `generation_id` per run, prior `report_rows` retained until new validates; bucket timestamped key never overwrite; `report:rebuilt` Redis publish); debounce `jobId=rebuild-{month}` + 30s delay, concurrency=1; formula-injection sanitize every cell; Tab 2 version list + download.
- **Acceptance:** 50-row bulk → exactly one rebuild per month; prior version still readable; provisional absent from sheet; formula-injection sanitized.
- **Depends on:** P4-2, P15-6.
- **Read:** MVP_PLAN §4; DOMAIN_MODEL §10; INGESTION_PIPELINE §3 Stage 6, D7/D8; PRODUCT_DIRECTIONS §5.5; ARCHITECTURE §6, §7; DB_SCHEMA §9.

### ⬜ P4-6 · SSE Realtime Dashboard
- **Goal:** New movements/reports push to open dashboards in ~1-2s via SSE + Redis pub/sub.
- **Deliverables:** `api/realtime/route.ts` (`runtime="nodejs"`, `force-dynamic`, `X-Accel-Buffering:no`, 25s heartbeat, `Last-Event-ID` resume, cleanup on `req.signal`); per-instance Redis subscriber + in-process `EventEmitter` fan-out (one SUBSCRIBE per Next.js instance); worker publishes `wagon:update` + `report:rebuilt` on commit; card numerals animate to new values.
- **Acceptance:** new movement on open dashboards w/in ~1-2s; Redis connections don't grow per tab; reconnect w/ `Last-Event-ID` replays missed (handles Railway 15-min cut-off).
- **Depends on:** P3-4, P2-1, P4-5.
- **Read:** MVP_PLAN §6; INGESTION_PIPELINE §3 Stage 7; ARCHITECTURE §5; DESIGN_DIRECTION §5.2.

---

# Milestone: P5 — Drag-Drop Doc Extraction (ПСЦ + заявка + client_request)

### ⬜ P5-1 · Extraction Tables Migration
- **Goal:** P5 extraction schema + direction back-link.
- **Deliverables:** `orders` (scaffold + `parent_contract_id`, `transport_kind`, `plan_kind`, `period_month`, `gu12_number`); `source_documents` (`sourceDocType` enum incl `psc`/`zayavka`/`client_request`, `uq_source_doc_sha`); `extracted_prices` (`extractionStatus` enum, `idx_extracted_prices_doc`); `directions.seeded_from_extracted_price_id` nullable.
- **Acceptance:** SHA-256 unique blocks dup insert; extracted_prices reference source_documents; directions gain nullable seed col.
- **Depends on:** P15-1, P0-3.
- **Read:** SCHEMA_DELTA §3.1, §3.5, §3.6, §9.3.

### ⬜ P5-2 · Drag-Drop Upload + SHA-256 Idempotency + Enqueue
- **Goal:** Browser drop of ПСЦ/Заявка/client files → storage → extraction job.
- **Deliverables:** drop zone (Direction setup §5.4 + Запросы tab); `POST /api/documents/upload` (client SubtleCrypto SHA-256, server re-validate MIME+SHA, idempotency, StorageAdapter `{order_id}/{doc_type}/{sha256}.{ext}`); ARQ `extract_doc_task` enqueue; SSE `doc_extracted` channel.
- **Acceptance:** re-upload same file returns existing doc w/o re-enqueue; MIME mismatch → 422; SSE event in browser w/in 5s.
- **Depends on:** P5-1, P2-1.
- **Read:** PRODUCT_DIRECTIONS §2.2 steps 1-3; SCHEMA_DELTA §3.5.

### ⬜ P5-3 · Claude Extraction Worker + Quarantine Review UI
- **Goal:** Heuristic pre-classify; Claude Sonnet tool-use only for uncertain; human-in-loop review.
- **Deliverables:** `intake.py`/`claude_agent.py` (heuristic pre-classifier; Claude tool-use `confirm_source_format`→`emit_column_mapping`, structured outputs, prompt caching `cache_control` on last tool def, 1h TTL; maps columns once per file; `agent_run` persisted to `ingested_files`); `extract_doc_task` (pdfplumber + python-docx + openpyxl, vision fallback char_count<50, extraction contract §2.5, `psc_side` derived from РНС role, VAT `vat_inclusive='yes'`/`vat_rate=22.00` default, rule-based confidence); `ANTHROPIC_API_KEY` env; `/dashboard/quarantine` review UI (filename/sender/agent reasoning, first-10-rows raw vs proposed, approve/reject/edit, approved re-enqueue, edit-correction saveable as few-shot, daily digest + DLQ-depth alert).
- **Acceptance:** known-format files bypass LLM (zero tokens); uncertain → review queue w/ reasoning, not dropped; running against `psc-vektor-rns.md` fixture → ≥2 rate lines correct, `psc_side=owner_cost` when РНС=ЗАКАЗЧИК; LLM once per file; approve commits rows + enqueues `update-lifecycle` atomically.
- **Depends on:** P5-2, P2-5.
- **Read:** PRODUCT_DIRECTIONS §2.2 step 3, §2.5; INGESTION_PIPELINE §3 Stage 2a, §7, D10; ARCHITECTURE §2; SCHEMA_DELTA §9.1-9.2.

### ⬜ P5-4 · Operator Review/Confirm → Direction Pre-Fill
- **Goal:** Operator reviews extracted fields; money never auto-accepted; confirmed line seeds a Direction.
- **Deliverables:** review panel (§5.4 ② confidence-colored green/yellow/red §2.3; money fields always yellow, explicit keystroke to promote `*_suggested`→confirmed; "Подтвердить" per rate; negative-margin warning); confirm writes `price_protocol_rates` + sets `directions.seeded_from_extracted_price_id`; `confirmed_by`/`confirmed_at`.
- **Acceptance:** `client_rate`/`owner_rate` stay null until confirm keystroke (H1/D16); `overall_confidence ≥ 0.85` auto-accepts non-money fields only; `client_rate ≤ owner_rate` blocking warning.
- **Depends on:** P5-3, P15-2.
- **Read:** PRODUCT_DIRECTIONS §2.3, §2.4, §5.4; SCHEMA_DELTA §9.4.

### ⬜ P5-5 · Client-Request Extraction → Client-Grouped Explode
- **Goal:** Third extraction lane: client freight tables → requests + request_lines.
- **Deliverables:** drop zone in Запросы tab → storage → `extract_doc_task` Claude structured extraction (header-autodetect + column-mapping, same path as dislocation); emits 1 `requests` row per client+intake + N `request_lines`; operator labels client on drop (D16, LLM may suggest `client_suggested_id`); ESR inline seeds dict, bare names resolve (`*_raw` kept D15); idempotency `content_sha256` + line-level dedup on `(client, origin_esr, dest_esr, wagon_type, period)`; staged → confirm screen before write.
- **Acceptance:** re-upload exact file = no-op; 5-route file → 1 request + 5 lines after confirm; `client_raw` + all `*_raw` preserved regardless of ESR resolution.
- **Depends on:** P5-3, RFQ-1.
- **Read:** REQUESTS_SOURCING §11.1-11.4.

---

# Milestone: P6 — Realtime Hardening + Web Push + Security

### ⬜ P6-1 · Service Worker + Web Push
- **Goal:** Offline shell; web push on wagon state changes / failures; SW under production CSP.
- **Deliverables:** Serwist `@serwist/next` (`withSerwist` wrap, `manifest-src`/`worker-src 'self'` in CSP); offline shell cached; VAPID pair, push subs in Postgres, stale 410 cleanup; push on CLOSED deal / quarantine insert / `forward_status=failed`; `POST /api/push/subscribe`; bell badge count; iOS add-to-home onboarding.
- **Acceptance:** SW registers under nonce CSP (no silent fail); shell loads offline after first visit; push received on device on state change; notification click navigates to direction alerts.
- **Depends on:** P4-6, P0-5.
- **Read:** MVP_PLAN §6; ARCHITECTURE §6; PRODUCT_DIRECTIONS §5.3.

### ⬜ P6-2 · Observability + RLS/RBAC + Rate Limiting
- **Goal:** Sentry, structured logs, metrics, Postgres RLS, RBAC, rate limiting in production.
- **Deliverables:** Sentry web (`SENTRY_DSN`) + worker + Uptime probe on `/api/health`; `pino` (web) + `structlog` (worker, `wagon_number`/`source` binding, per-row DEBUG / per-file INFO); `/metrics` (`ingestion_total{source,status}`, `wagons_active`, `wagon_turnover_days` histogram, `deal_match_total{status}`); Postgres RLS on `directions`/`deals`/`invoices`/`payments`; `users.role` enum admin/operator/viewer enforced at route level + middleware; Better Auth rate limiting + SlowAPI on ingestion webhook; Sentry error boundary.
- **Acceptance:** worker death → Sentry alert via health probe; operator can't access admin routes, RLS blocks cross-tenant; viewer can't POST `/api/invoices`; `/metrics` valid Prometheus text.
- **Depends on:** P6-1, P0-3.
- **Read:** MVP_PLAN §6; ARCHITECTURE §9, §6; SCHEMA_DELTA §8; ECC security.md.

### ⬜ P6-3 · PgBouncer + Materialized KPI View (optional)
- **Goal:** Connection pooling; optionally materialize `direction_kpis` if query volume demands.
- **Deliverables:** PgBouncer service on Railway; app DB URL through pooler; conditional materialized-view migration (only if p99 KPI query > 200ms) + refresh trigger on deal/payment write.
- **Acceptance:** connection count under load < Postgres `max_connections`; if materialized, KPI matches live view w/in 1s.
- **Depends on:** INFRA-1, P4-6.
- **Read:** SCHEMA_DELTA §5; PRODUCT_DIRECTIONS §4.6.

---

*End of roadmap. The 👉 marker is the only place we work; everything above it is ✅, everything below is ⬜ until promoted.*
