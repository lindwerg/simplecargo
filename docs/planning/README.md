# SimpleCargo — Planning Docs

SimpleCargo is a PWA for the rail-wagon freight forwarder **Приоритет Логистика**. The business rents gondola wagons (полувагоны) from owners (Поставщик вагона) at a fixed cost and resells the transport to clients (Клиент); profit is the margin between the two. These docs define how the product turns raw dislocation data into a maintained margin report, and how the system is built and shipped.

## Core business facts (referenced throughout)

- **Маржа (Комиссия)** = `Сумма УА` (client revenue) − `Сумма от Поставщика вагона` (owner cost).
- **Primary KPI** = `оборот, сут` (turnover days) — how fast a wagon completes a trip and returns to be loaded again. Faster turnover ⇒ more trips/month/wagon ⇒ more total margin.
- **MVP scope now** = user auth + login to a dashboard only. Email/AI ingestion and the operator-automation agents are deferred.
- **Deploy target** = Railway (Postgres + Redis, GitHub CI/CD); fast PWA on phone and desktop.

## Documents

### [ARCHITECTURE.md](./ARCHITECTURE.md)
System architecture and the full deployment topology on Railway. Locks the stack (Next.js 15 App Router + Drizzle + node-postgres + Better Auth + Tailwind/shadcn web; Python/ARQ worker), the web↔worker contract, the migration/pooler strategy, and the SSE + Redis pub/sub realtime layer. Phases the build so MVP risk is contained.
- **Most important decision:** Phase the system so **P1 ships only `web` + `Postgres` (auth + dashboard)**, deferring `worker`/`Redis`/`bucket` and the entire ingestion/matching/realtime engine to P2–P4 — resolving the MVP-scope critique without rewrites.

### [DOMAIN_MODEL.md](./DOMAIN_MODEL.md)
The implementation-ready domain model (~13 sections): wagon lifecycle, the four data sources (A/B/C/D), how movements normalize and dedupe, how turnover and margin are derived, and the hard correctness rules that prevent bad numbers. Defines ESR codes as the universal join key and the UTC-store/MSK-display timezone policy.
- **Most important decision:** **Оборот = cross-row cycle** (`next_loading_arrival − this_loading_arrival`), NOT trip duration; trip-duration is demoted to a flagged `turnover_provisional` fallback excluded from KPI averages.

### [DB_SCHEMA.md](./DB_SCHEMA.md)
The Postgres schema in both Drizzle TypeScript and equivalent SQL DDL, kept in sync. Covers ingested-files tracking, wagon movements, deals, and versioned report rows, plus the indexes that target real hot paths (turnover, matching, sheet export, review queues).
- **Most important decision:** **Three-layer dedup** — `ingested_files.content_sha256` (file), `wagon_movements.fingerprint` UNIQUE with NULL `operation_ts` COALESCE'd into the hash (row), and a cross-source `event_key` collapsing the same physical movement seen across Sources A–D — so margin is never double-counted.

### [INGESTION_PIPELINE.md](./INGESTION_PIPELINE.md)
How dislocation files flow from arrival to a maintained report: queue graph, normalization, idempotency, LLM-assisted column mapping, quarantine, and human review. Defines the contract that nothing wrong is silently dropped, and that reports are versioned in object storage.
- **Most important decision:** The **Claude agent runs once per uncertain file** (tool-use + structured output + prompt cache) to classify/map columns only — never row-by-row — with deterministic normalizers applying the mapping to all rows; ~80% of files skip the LLM via heuristics.

### [MVP_PLAN.md](./MVP_PLAN.md)
The concrete delivery sequence. Phase 0 = auth + dashboard only; Phase 1.5 = import the existing `report.xlsx` + manual deal CRUD + export (real margin numbers with zero AI); email/AI ingestion comes after. Locks infra seams (migrations on `DATABASE_URL_DIRECT`, no PgBouncer at MVP, object storage for cross-service files, versioned report artifacts).
- **Most important decision:** **Re-sequence so Phase 1.5 (historical xlsx import + manual deal CRUD + export) ships before any email/AI ingestion** — delivering real margin numbers fast, while Phase 0 scaffolds the full canonical schema as empty tables so later phases never trigger a rewrite.

## Cross-cutting hard rules (consistent across all docs)

- Turnover = loading→next-loading cross-row cycle; provisional single-trip value excluded from KPIs.
- Source B/D fixed by **content-signature column typing**, never positional shift arithmetic; waybill never fabricated from a date column (NULL + date-window matching if unlocatable).
- No invented ESR/road codes; wagon checksum is **advisory** (`needs_review`), never a silent drop.
- `Клиент` is never auto-filled from consignee.
- `margin` exists only in report rows, gated on both revenue and cost being present.
- All timestamps **stored UTC, displayed MSK** to avoid month-boundary misfiling.

> Note: the worker runtime is recorded inconsistently across docs (Python/ARQ in ARCHITECTURE/MVP_PLAN; Node/BullMQ in INGESTION_PIPELINE). The MVP plan's resolution — **Python/ARQ, born in Phase 2** — is authoritative; INGESTION_PIPELINE predates that decision and should be reconciled before P2.
