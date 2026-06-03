# Ingestion Pipeline — SimpleCargo

> ⚠️ **OVERRIDE (reconciled post-workflow):** This doc's **D1 is SUPERSEDED** by
> `MVP_PLAN.md` D2/D3, which is the single source of truth. The worker runtime is
> **Python + ARQ**, not Node/BullMQ. Reason: the real `.xls` source requires `xlrd>=2.0.1`,
> the РНС column-shift correction wants pandas/openpyxl, and the AI-extraction layer is
> Python-native. Wherever this document says "BullMQ"/"Node worker", read **"ARQ / Python
> worker"**; the job graph (fetch-email → parse-file → normalize → validate → dedupe →
> upsert) and the Zod⇄**Pydantic** pub/sub envelope contract are unchanged. All other locked
> decisions here (turnover=cycle, content-signature column typing, advisory checksum, no
> hardcoded ESR, UTC/MSK, versioned reports, cross-source event identity) agree with MVP_PLAN.
>
> **Status:** Design (no implementation yet). Illustrative code is for shape only.
> **Phase:** This is **Phase 4** of the delivery plan. The MVP (auth + dashboard) and
> Phase 1.5 (historical-report import + manual deal CRUD) ship first. This document
> defines the end state the schema and contracts must not paint us out of.
> **Companion docs:** `CANONICAL_SCHEMA.md`, `SOURCE_MAPPERS.md`, `STATION_DICTIONARY.md`,
> `WAGON_LIFECYCLE.md`, `DEAL_MATCHING.md`, `VALIDATION_RULES.md`, `REPORT_GENERATION.md`,
> `DEPLOYMENT_TOPOLOGY.md`.

---

## 1. Locked Decisions (read this first)

These resolve the contradictions across the research findings. Everything downstream depends on them.

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Worker runtime = Node/TypeScript with BullMQ v5.** | The `.xls` legacy path is handled by SheetJS (`xlsx` reads BIFF8 via CFB); the few genuinely toxic legacy files are quarantined, not parsed. A single TypeScript runtime shares the Drizzle schema, the Zod validation contracts, and the BullMQ job graph with the web service. We do **not** run a parallel Python/Celery/ARQ stack. The `email-agents` and `observability` findings assumed Python; we override them. |
| D2 | **The cross-service contract is the Postgres schema + a versioned Redis pub/sub JSON envelope** (validated with Zod on both ends), not a shared TS package. Keep web and worker as separate Railway services that communicate only through Postgres, Redis, and object storage. |
| D3 | **Turnover (`оборот, сут`) = full wagon CYCLE: `T_arrive_loading[trip N+1] − T_arrive_loading[trip N]`.** This is computed **cross-row** in the lifecycle layer, never intra-row `[4]−[5]`. The single-trip `T_trip_end − T_arrive_loading` value is **provisional only**, flagged `turnover_provisional = true`, and **excluded from KPI averages and from the final report cell** until the next loading event closes the cycle. (Critic CRITICAL-1/-2.) |
| D4 | **Source B column misalignment is corrected by content-signature typing, never by positional shift arithmetic.** We never fabricate `waybill` from a date column. If the waybill column cannot be located by signature, `waybill = NULL` and the row routes to date-window matching. (Critic CRITICAL-3.) |
| D5 | **Wagon checksum is advisory (WARNING + `needs_review`), never a CRITICAL drop.** Never silently remove a revenue row from the margin report over a check-digit mismatch. (Critic HIGH-1 / MVP-M4.) |
| D6 | **No ESR/road codes are hardcoded from memory.** Source A carries ESR inline — trust the file. Seed the dictionary only from the RZhD classifier import + observed Source A codes + operator-confirmed report place-names. (Critic HIGH-2.) |
| D7 | **All timestamps are stored UTC (`TIMESTAMPTZ`), parsed as MSK (Europe/Moscow), displayed MSK.** Month-sheet bucketing happens in MSK so a deal never drifts to the wrong monthly sheet at a midnight boundary. |
| D8 | **Generated reports are versioned in object storage (timestamped keys), never overwritten.** A bad regeneration can always be rolled back. |
| D9 | **Cross-source event identity** = `(wagon_number, operation_code, operation_ts rounded to 15 min)`. The same physical movement arriving in Source A (full export) and Source C (subset) collapses to one event; everything else is provenance. This prevents double-counting margin. (Critic HIGH-4.) |
| D10 | **The Claude agent is invoked only for format classification + column mapping of UNCERTAIN files**, never row-by-row. ~80% of files are classified by cheap heuristics with zero LLM cost. Python-style row loops through Claude are forbidden. |

---

## 2. Pipeline Overview

```
                        ┌─────────────────────────── worker service (Node/BullMQ) ───────────────────────────┐
                        │                                                                                      │
  Gmail/IMAP            │   fetch-email ─► parse-file ─► normalize ─► validate ─► dedupe ─► upsert-movement     │
  (Pub/Sub push   ──────┼──►   (Q1)          (Q2)         (Q3)         (in Q3)   (in Q3)        (in Q3)          │
   or manual upload)    │                      │                                                   │             │
                        │                      ▼ (uncertain only)                                  ▼             │
                        │                Claude classify-agent                          update-lifecycle (Q4)    │
                        │                (tool-use + caching)                                       │             │
                        │                                                                           ▼             │
                        │                                                          match-deal (Q5) ─► rebuild-   │
                        │                                                                            report (Q6) │
                        └──────────────────────────────────────────────────────────────────────────┬───────────┘
                                                                                                     │
   review queue ◄── quarantine (any stage) ── operator resolves ── re-enqueue                        │ publish
                                                                                                     ▼
                                                                              Redis  "wagon:update" / "report:rebuilt"
                                                                                                     │
                                                                              web service SSE ─► dashboard (live)
```

Each arrow is a BullMQ job. Stages 3 (normalize), validate, dedupe, and upsert run inside one worker for locality but are distinct, separately-retryable steps; the queue boundaries are drawn where a unit of work changes granularity (file → rows → wagon → deal → report).

---

## 3. Stage-by-Stage Specification

### Stage 0 — Email arrival & attachment intake

- **Trigger:** Gmail API `watch()` → Cloud Pub/Sub push to a web-service route `POST /webhook/gmail`, OR manual file upload at `POST /api/upload`. (MVP/Phase-4 boundary: manual upload ships first; email automation later.)
- **Webhook auth:** HMAC (`X-Goog-Channel-Token` shared secret), constant-time compare. Reject 401 on mismatch.
- **Action:** download the raw attachment bytes, write the original file to **object storage** (Railway bucket / S3-compatible — never a per-service local volume, since web and worker both need it), compute **file fingerprint** = SHA-256 of raw bytes, then enqueue `fetch-email` → which fans out one `parse-file` job per attachment.

**File-level idempotency (first gate):**

```ts
// Redis NX fast path + Postgres UNIQUE durable backstop
const key = `attachment:seen:${sha256}`;
const fresh = await redis.set(key, gmailMsgId, "NX", "EX", 86_400);
if (!fresh) return; // duplicate in-flight or recently seen — drop silently

// durable: INSERT ... ON CONFLICT (file_sha256) DO NOTHING into ingested_files
// if rowCount === 0 → another worker won the race → drop
```

### Stage 1 — `fetch-email` (Q1)

Resolves the Gmail message, extracts attachment list, stores each original, creates an `ingested_files` row per attachment (`status = 'pending'`), and `addBulk`s one `parse-file` job per attachment. Concurrency low (I/O-bound). On Gmail/network error: retry with exponential backoff (5 attempts).

### Stage 2 — `parse-file` (Q2) — format detect + header autodetect + parse

1. **Format by extension + magic bytes.** `PK\x03\x04` → `.xlsx` (SheetJS/openpyxl-equivalent); `D0 CF 11 E0` → `.xls` (SheetJS CFB/BIFF8). Extension and magic must agree, else quarantine the file.
2. **Heuristic source classification (A/B/C/D)** by signature columns (no LLM):

   | Source | File hint | Header row (0-based) | Anchor columns to confirm |
   |---|---|---|---|
   | A (Добрятино/ЭТРАН) | `Добрятино*` | 3 | `Номер вагона` + `Мнемокод операции` + `Идентификатор отправки` |
   | B (РНС) | `Дислокация РНС*` | 0 | `Номер вагона` + `Модель вагона` + `Дорога дислокации` |
   | C (отгруженных) | `Дислокация_отгруженных*` | 2 | `Номер вагона` + `Простой по Станции` + `Расстояние общее` |
   | D (RDB legacy) | `RDB_dislocation*.xls` | 1 | `Операция полное наименование` + `Срок доставки (ЭТРАН RT)` |

   Scan rows 0–9; the first row containing the anchors is the header. Confirm against expected index; if it differs, WARNING + use discovered index. If anchors absent in rows 0–9 → quarantine file.
3. **Confidence routing:** ≥3 anchor columns matched at the expected header row → `confidence = high`, **skip the LLM**. Otherwise call the **Claude classify-agent** (Stage 2a).
4. Emit raw rows (still in source column space) + the resolved `{source, header_row, column_shift?}` decision, then enqueue `normalize`.

Concurrency low (CPU-bound parsing). `stalledInterval` raised to 120 s — large legacy `.xls` parses can exceed the 30 s default. Retry `attempts: 2` (a bad file is usually permanently bad → DLQ fast).

### Stage 2a — Claude classify-agent (uncertain files only)

Used to **confirm/correct source classification** and **map actual columns → canonical schema**, including detecting the Source B misalignment. It runs **once per file**, never per row.

- **Model:** Claude Sonnet (current). Extended thinking **off** (structured extraction, not reasoning).
- **Tool use (sequential):** `confirm_source_format` → then `emit_column_mapping` (or `quarantine_file` if unrecoverable). Two tools give an auditable reasoning trace for the operator.
- **Structured outputs:** tool input schemas are strict; parse results into Zod-validated objects. No retry-on-parse loop.
- **Prompt caching:** the static system prompt + all tool definitions carry a `cache_control: { type: "ephemeral", ttl: "1h" }` breakpoint on the last tool. Files arrive in waves, so the 1-hour TTL yields ~90% input-token cost reduction. Only the per-file column sample + first 3 rows are uncached.
- **What the agent returns:** `{ source, confidence, header_row, column_shift_detected, column_mapping[], data_quality_flags[] }` or a quarantine decision.
- **What the agent does NOT do:** it does not transform any data rows. The deterministic normalizer (Stage 3) applies the returned mapping to all N rows. (D10.)

```ts
// envelope returned to the pipeline; persisted on ingested_files.agent_run for audit
type AgentResult = {
  source: "A" | "B" | "C" | "D" | "unknown";
  confidence: "high" | "medium" | "low";
  headerRow: number;
  columnShiftDetected: boolean;
  columnMapping: { canonical: string; actualCol: string | null; transform: string }[];
  dataQualityFlags: string[];
  quarantined: boolean;
  quarantineReason: string | null;
};
```

If `confidence === "low"` or `quarantined`, the file routes to the **review queue** with the agent's reasoning attached.

### Stage 3 — `normalize` (Q3): map → validate → dedupe → upsert

This is one worker that runs four ordered, individually-failable steps. Output: rows in `wagon_movements`.

**3a. Apply mappers (per source — see `SOURCE_MAPPERS.md`).** Deterministic transforms applied to all rows using the column mapping from heuristics or the agent:

- **Wagon number → canonical 8-digit string:** `String(Math.trunc(Number(raw))).padStart(8, "0")` (handles `52266772.0`, `65098634`, leading-zero strings). Invalid → row CRITICAL.
- **Dates:** single date utility. openpyxl/SheetJS already yield JS `Date` for date-typed cells — do **not** re-interpret those as serials. For genuine numeric serials, use the Excel 1899-12-30 base (and for `.xls`, honor the workbook `datemode`). Try formats in order: `dd.MM.yyyy HH:mm`, `dd.MM.yyyy HH:mm:ss`, ISO, `dd.MM.yyyy`, serial. Parse **as MSK**, store **UTC** (D7). Sanity bound `[2015-01-01, today+30d]` → outliers quarantined (catches epoch bugs automatically).
- **Load state ГРУЖ/ПОР:** normalize `{ГРУЖ, ГРУЖЕН, ГРУЖЕНЫЙ}→ГРУЖ`, `{ПОР, ПОРОЖ, ПОРОЖНИЙ}→ПОР`. **Source A has no such column** → derive primarily from `Вес груза (кг) > 0` + presence of `Номер накладной` (a loaded leg always has a waybill); `Тип парка`/mnemonic only as tie-breakers. Treat `РП/НРП` as serviceability, **never** as load state. (Critic HIGH-3.)
- **Stations:** extract ESR from `"NAME (ESR)"` via `^(.+?)\s*\((\d{4,6})\)\s*$`; resolve to human name via the station dictionary (`STATION_DICTIONARY.md`). Short road codes (ДВС/ВСБ/ОКТ/ГОР…) expand via the road dictionary. Unresolved station → store raw, set `needs_review`, push to station quarantine (deduped by raw value, not per row).

**Source B misalignment correction (D4) — content-signature, not shift:**

```ts
// Locate columns by what their values look like, never by an offset.
const loadCol   = pickColumn(rows, v => /^(ГРУЖ|ПОР|ГРУЖЕН|ПОРОЖ)$/i.test(String(v)));
const waybillCol= pickColumn(rows, v => /^[А-ЯЁ]{1,4}\d{4,}$/.test(String(v))); // e.g. ЭУ477040; also accept pure-digit
const cargoCol  = pickColumn(rows, v => isCyrillicWord(v) && !isLoadState(v));
// If waybillCol is null -> waybill = NULL (route to date-window matching). NEVER take it from a date column.
// Quarantine only if loadCol AND cargoCol cannot both be located.
```

**3b. Validate** (`VALIDATION_RULES.md`). Severity → action:

| Severity | Action |
|---|---|
| CRITICAL (unparseable wagon, date out of range, post-shift validation fail) | quarantine ROW, skip insert |
| ERROR (structural) | quarantine ROW or FILE |
| WARNING (checksum fail per D5, suspect date order, station unresolved) | insert with `needs_review = true` |
| INFO | log only |

**3c. Dedupe (content hash).** Two layers:

```ts
// Row fingerprint — exact-duplicate guard within and across files.
// COALESCE NULLs to a sentinel so SQL UNIQUE/NULL semantics don't admit silent dupes.
rowHash = sha256([
  wagonNumber,
  sourceType,
  waybill ?? "∅",
  operationCode ?? "∅",
  (operationTs ? roundTo15min(operationTs).toISOString() : "∅"),
].join("|"));
```

- Exact `rowHash` collision → skip insert, increment `dup_count`.
- **Cross-source identity (D9):** `(wagon_number, operation_code, operation_ts→15min)` defines the physical event. When the same event arrives from multiple sources, keep one `is_primary = true` row by source priority **A > C > B > D**; others stored `is_primary = false` for provenance. Field-level merge precedence (operator > A > C > B > D) lives in `DEAL_MATCHING.md`.

**3d. Upsert movement.** `INSERT … ON CONFLICT (row_hash) DO NOTHING` into `wagon_movements`, preserving the full original row as `raw_json`. On success, enqueue `update-lifecycle` for the affected `wagon_number`.

### Stage 4 — `update-lifecycle` (Q4): state machine + turnover

Per `WAGON_LIFECYCLE.md`. Loads all movements for the wagon ordered by best-available timestamp, runs the state machine (`EMPTY_AT_OWNER → … → AT_LOADING → LOADED → IN_TRANSIT → ARRIVED → UNLOADED → EMPTY_RETURN → AT_LOADING'`), and segments them into trips.

**Turnover (D3), authoritative cross-row:**

```
turnover_days = ceil( (T_arrive_loading[N+1] − T_arrive_loading[N]) / 1 day )
```

where `T_arrive_loading` is the `→ AT_LOADING_STATION` transition (empty wagon arrives at loading station). When trip N+1's loading arrival is not yet observed:

```
turnover_provisional_days = ceil( (T_trip_end − T_arrive_loading[N]) / 1 day )   // flagged provisional
```

Provisional values are **never** written to report cell `[6]` and **never** enter KPI averages; they exist only to show "in flight" status on the dashboard. Per-wagon trips carry `prev_loading_ts` so the cross-row computation is local. On a newly-closed trip, enqueue `match-deal`.

### Stage 5 — `match-deal` (Q5)

Per `DEAL_MATCHING.md`. Join key `(wagon_number, waybill_number)`; date-window fallback when waybill is NULL (window scaled by `distance_total_km`, default 60-day loaded leg / 120-day cycle — not the too-tight 3 days). Attaches the trip to an existing `OPEN`/`ACTIVE` deal or creates a `PENDING` one. Field-level precedence merge (operator > A > C > B > D). Conflicts (priority-equal sources disagree beyond threshold) set `conflict_flags` and raise an operator alert.

- **Commercial fields** (`Клиент`, `Сумма УА`, `Сумма от Поставщика`, `Счет фактура`, `перевозчик`) come **only** from the deal record (contract lookup or operator entry). **Never** auto-fill `Клиент` from `Грузополучатель`. (Critic MEDIUM-4.)
- `margin = revenue_ua − cost_owner`, emitted **only** when both are non-NULL. A half-filled deal never reaches a sheet.
- When a trip-end op closes a deal and prices are present → status `CLOSED` (frozen; late snapshots log as anomalies, never reopen). Then enqueue `rebuild-report` for the affected month.

### Stage 6 — `rebuild-report` (Q6)

Per `REPORT_GENERATION.md`. Pulls all `CLOSED` deals for the month (bucketed by `trip_end_dt` in MSK — verify against a real sheet before committing to that vs. dispatch date), assembles the 17-column rows, writes a fresh `.xlsx` with **a new timestamped object-storage key** (D8), updates the DB pointer, and publishes `report:rebuilt`. Concurrency **1** (file writes must not race). **Burst dedup:** enqueued with `jobId = rebuild-${month}` and a 30 s delay so a bulk parse of 50 movements collapses into one rebuild.

### Stage 7 — Notify dashboard

The worker publishes to Redis: `wagon:update` (per-wagon normalized snapshot) and `report:rebuilt` (month + new key). The **web service** holds **one Redis subscriber per instance** (not per request) and fans out to browser `EventSource` streams via an in-process emitter — done from day one to avoid Redis connection exhaustion. (Critic CRITICAL-4.) SSE route sets `X-Accel-Buffering: no`, sends a 25 s heartbeat, and uses `Last-Event-ID` for seamless reconnect across Railway's 15-min cutoff.

---

## 4. BullMQ Job Graph

```
fetch-email ──addBulk──► parse-file ──► normalize ──► update-lifecycle ──► match-deal ──► rebuild-report
   (Q1)                     (Q2)          (Q3)            (Q4)               (Q5)            (Q6)
                              │
                              └─(uncertain)─► classify-agent (in-process call, not a queue)

  Manual reprocess (operator): FlowProducer builds the whole chain atomically with waiting-children status.
  Email path: each worker enqueues the next job directly (simpler, more robust than a flow per email).
```

| Queue | Granularity | Concurrency | attempts | backoff | Notes |
|---|---|---|---|---|---|
| `fetch-email` | one email | 2 | 5 | exp 2 s | I/O-bound; transient IMAP/Gmail self-heals |
| `parse-file` | one attachment | 2 | 2 | fixed 3 s | CPU-bound; `stalledInterval: 120s`; bad file → DLQ fast |
| `normalize` | rows of one file | 4 | 3 | exp 5 s | map→validate→dedupe→upsert |
| `update-lifecycle` | one wagon | 4 | 3 | exp 5 s | cross-row turnover |
| `match-deal` | one trip | 4 | 4 | exp 5 s | DB-bound |
| `rebuild-report` | one month | 1 | 5 | exp 10 s | `jobId`-deduped, 30 s debounce; serialized writes |
| `dead-letter` | exhausted jobs | 1 | 1 | — | review surface |

### Queue setup sketch (illustrative)

```ts
// lib/redis.ts
import IORedis from "ioredis";
export const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // required by BullMQ
  family: 0,                  // required on Railway (IPv4/IPv6 dual-stack)
});

// jobs/queues.ts
import { Queue } from "bullmq";
import { connection } from "../lib/redis";

const defaults = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
  removeOnComplete: { count: 500 }, // audit window
  removeOnFail: { count: 1000 },    // bounded; DLQ holds the real review surface
};

export const fetchEmailQueue    = new Queue("fetch-email",     { connection, defaultJobOptions: { ...defaults, attempts: 5, backoff: { type: "exponential", delay: 2_000 } } });
export const parseFileQueue     = new Queue("parse-file",      { connection, defaultJobOptions: { ...defaults, attempts: 2, backoff: { type: "fixed", delay: 3_000 } } });
export const normalizeQueue     = new Queue("normalize",       { connection, defaultJobOptions: defaults });
export const lifecycleQueue     = new Queue("update-lifecycle",{ connection, defaultJobOptions: defaults });
export const matchDealQueue     = new Queue("match-deal",      { connection, defaultJobOptions: { ...defaults, attempts: 4 } });
export const rebuildReportQueue = new Queue("rebuild-report",  { connection, defaultJobOptions: { ...defaults, attempts: 5, backoff: { type: "exponential", delay: 10_000 } } });
export const dlqQueue           = new Queue("dead-letter",     { connection, defaultJobOptions: { attempts: 1 } });

export const allQueues = [
  fetchEmailQueue, parseFileQueue, normalizeQueue,
  lifecycleQueue, matchDealQueue, rebuildReportQueue,
];

// jobs/dlq.ts — failed set IS the DLQ; route exhausted jobs to a review surface
import { QueueEvents } from "bullmq";
for (const q of allQueues) {
  const events = new QueueEvents(q.name, { connection });
  events.on("failed", async ({ jobId, failedReason }) => {
    const job = await q.getJob(jobId);
    if (!job) return;
    if (job.attemptsMade < (job.opts.attempts ?? 1)) return; // retries remain
    await dlqQueue.add("dead-letter", {
      originalQueue: q.name, originalJobId: jobId, failedReason, originalData: job.data,
    });
    // structured log + operator alert when DLQ depth crosses threshold
  });
}

// rebuild debounce — collapse bursts into one rebuild per month
await rebuildReportQueue.add(
  "rebuild-report",
  { month },
  { delay: 30_000, jobId: `rebuild-${month}` },
);

// scheduler (worker startup) — idempotent on deploy
await fetchEmailQueue.upsertJobScheduler(
  `imap-poll`, { pattern: "*/15 * * * *" },
  { name: "fetch-email", data: { accountId: "primary" } },
);
```

---

## 5. Idempotency Summary

Three layers, each catching a different failure mode:

1. **File** (`ingested_files.file_sha256` UNIQUE + Redis NX): re-sent attachment never re-parsed.
2. **Row** (`wagon_movements.row_hash` UNIQUE, NULLs coalesced to `∅`): exact duplicate row never re-inserted.
3. **Physical event** (`(wagon, op_code, op_ts→15min)`, source priority A>C>B>D): same movement across sources collapses to one primary row → margin never double-counted. (D9.)

All jobs are written to be safely re-runnable: `update-lifecycle`, `match-deal`, and `rebuild-report` recompute from current DB state rather than appending, so a retry produces the same result. A `CLOSED` priced deal is frozen and immune to late snapshots.

---

## 6. Retries & Failure Handling

- Per-queue `attempts`/`backoff` tuned to failure type (table in §4). Transient (network/DB) → aggressive retry; structural (bad file) → fail fast to DLQ.
- **DLQ = the BullMQ failed set surfaced into a `dead-letter` queue.** Exhausted jobs preserve the original `s3Key` so an operator can re-download, fix, and re-run after a parser patch ships.
- **Redis memory guard:** `removeOnFail` is bounded; the DLQ (not the failed set) is the durable review record. `maxmemory-policy noeviction` on the job DB; jobs survive worker restarts (AOF on).
- **Worker liveness:** BullMQ stall detection re-queues jobs from crashed workers; a heartbeat key + alert covers a fully-dead worker (Railway healthchecks are deploy-time only).

---

## 7. Quarantine & Human-in-the-Loop Review

Nothing wrong is silently dropped from the margin report; it is quarantined for a human.

| Tier | Examples | Routing |
|---|---|---|
| **File fatal** | corrupt/encrypted, header anchors missing, format/magic mismatch | `quarantine_items` (tier `fatal`), no rows inserted, operator alert |
| **File recoverable** | low-confidence classification, Source B signature ambiguous, unknown source variant | review queue with Claude reasoning + side-by-side raw-vs-proposed rows; operator Approve / Reject / Edit-mapping |
| **Row recoverable** | >20% wagon numbers invalid, station unresolved | `quarantine_items` (tier `recoverable`); partial commit of valid rows |
| **Row warning** | single bad date, **checksum fail (D5)**, suspect state/op | inserted with `needs_review = true`; flagged in review, never dropped |

**Review UI (web service, auth-gated):** filename, sender, timestamp, the agent's classification + reasoning, first-10-rows raw vs proposed normalized output, and **Approve / Reject / Edit** actions. Approve commits to canonical and re-enqueues downstream stages; Edit opens the inline column mapper and the correction can feed back as a future few-shot example. Alert fires when quarantine/DLQ depth crosses a threshold; daily digest otherwise.

**Auto-commit** happens only when `confidence === "high"` AND zero data-quality flags AND zero quarantined rows. Everything else waits for a human.

---

## 8. Open Questions (verify against real data before build)

1. Month-sheet bucketing: by `Дата окончания рейса [4]` (assumed) vs `Дата выполнения (отправки) [9]`? Mis-bucketing moves margin between months — confirm against a real sheet.
2. Turnover rounding: `ceil` (assumed) vs round-to-nearest. RZhD convention is typically whole-day rounding; the sample `оборот=11` cannot disambiguate. Verify before locking.
3. Wagon checksum weight vector: confirm the correct RZhD weighting against 2–3 known-good wagons (52266772, 65098634) **before** enabling the advisory check.
4. Waybill regex: must match the real sample `ЭУ477040` (Cyrillic prefix + digits) — a pure `\d{8,}` rule would reject it.
