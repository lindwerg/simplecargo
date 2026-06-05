# Architecture: RFQ Intake — requests + request_lines (slice RFQ-1)

> **Scope:** tables `requests` + `request_lines` only. Owner-sourcing, coverage,
> margin computation, client-quote, and win-conversion are deferred (RFQ-3…8).
> This slice ships manual intake + board grouped-by-client + AI extraction parse.
>
> **Honoured invariants:** D15 (raw + nullable ESR, never invented), D16 (client
> SUGGESTED only, never auto-confirmed), house conventions (text+CHECK enums,
> pure-domain files never import db/client, `ApiEnvelope`, `requireWriter`).

---

## Design Decisions

- **text+CHECK for all enums** — no `pgEnum`, matching `directions.ts` and
  `orders.ts` exactly. The six new logical enums (`request_status`, `channel`,
  `loss_reason`) become inline CHECK constraints.
- **Bare nullable UUID columns for deferred FKs** — `converted_order_id` and
  `cloned_from_request_id` are declared without REFERENCES in the Drizzle
  table definition; SQL comments document the intent. The FK constraint is
  added in a later migration slice (RFQ-3 conversion, after `orders.request_id`
  back-link exists). This mirrors `directions.seeded_from_extracted_price_id`.
- **`originRoadRaw` / `destRoadRaw` as plain text** — roads lookup (`roads`
  table, `shortCode`) is advisory and nullable; raw text is always preserved
  (D15 spirit applied to roads too). No FK to `roads` on the intake line.
- **`targetRatePerWagon` = client's desired rate (SUGGESTED)** — never
  auto-promoted to a confirmed rate. Parallel to `directions.rateClientSuggested`.
- **`targetRateRaw`** = free-text raw rate string from the file/paste (e.g.
  "~1 900 р/ваг", "договорная"). Stored alongside the parsed numeric.
- **Pure domain files have zero `@/lib/db/client` import** — `schema.ts`,
  `grouping.ts`, `lifecycle.ts` are import-safe; only `repository.ts` touches DB.
- **AI extraction result schema is a pure Zod type** (no DB import) so it can
  be unit-tested against golden fixtures without a running Postgres.
- **`requestNumber`** human ref auto-generated at DB layer (trigger or
  application): `R-YYYY-NNNN`. Pattern mirrors `orders.orderNumber`; nullable
  in schema so insert doesn't require it.

---

## 1. Migration

### 1.1 Drizzle table definitions (to be placed in `src/lib/db/schema/requests.ts`)

```typescript
import {
  char, check, index, integer, numeric, pgTable,
  smallint, text, timestamp, uuid, varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users }          from "./auth";
import { counterparties } from "./counterparties";
import { stations }       from "./geo";

// ── requests ────────────────────────────────────────────────────────────────
// Pre-order RFQ header. One per client intake (upload / paste / manual).
// D16: clientSuggestedId is advisory — operator must confirm downstream.
// converted_order_id and cloned_from_request_id carry NO FK constraint yet;
// FKs are added in RFQ-3 migration once orders.request_id back-link exists.
export const requests = pgTable(
  "requests",
  {
    id:            uuid("id").primaryKey().defaultRandom(),
    requestNumber: text("request_number"),          // R-2026-0031 (app-generated)

    // D16: SUGGESTED only — never auto-confirmed
    clientSuggestedId: uuid("client_suggested_id").references(
      () => counterparties.id, { onDelete: "set null" }
    ),
    clientRaw:     text("client_raw"),              // free-text label until linked

    status: text("status").notNull().default("new"),
    // text+CHECK enum (house convention — never pgEnum)
    // new | sourcing | quoted | won | lost | no_bid | expired | cancelled

    channel: text("channel").notNull().default("manual"),
    // upload | voice | paste | manual

    wagonType:   text("wagon_type").notNull().default("ПВ"),
    cargoName:   text("cargo_name"),
    periodFrom:  timestamp("period_from", { withTimezone: true }),
    periodTo:    timestamp("period_to",   { withTimezone: true }),

    receivedAt:  timestamp("received_at",  { withTimezone: true }),
    validUntil:  timestamp("valid_until",  { withTimezone: true }),  // client SLA clock
    sourceRef:   text("source_ref"),                // email message-id / filename
    notes:       text("notes"),
    assignedTo:  uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),

    // ── deferred FKs (bare uuid, no REFERENCES — see migration note above) ──
    // FK to orders(id) ON DELETE SET NULL — added in RFQ-3 migration
    convertedOrderId:      uuid("converted_order_id"),
    // self-FK to requests(id) ON DELETE SET NULL — added in RFQ-3 migration
    clonedFromRequestId:   uuid("cloned_from_request_id"),

    // loss intelligence (terminal metadata)
    lossReason:      text("loss_reason"),
    // price | no_capacity | client_cancelled | timing | competitor | other
    competitorPrice: numeric("competitor_price", { precision: 14, scale: 2 }),
    lostTo:          text("lost_to"),

    // terminal timestamps (set once on transition)
    wonAt:       timestamp("won_at",       { withTimezone: true }),
    lostAt:      timestamp("lost_at",      { withTimezone: true }),
    expiredAt:   timestamp("expired_at",   { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    closedAt:    timestamp("closed_at",    { withTimezone: true }),  // no_bid

    createdBy: uuid("created_by").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_requests_status").on(t.status),
    index("idx_requests_client").on(t.clientSuggestedId),
    index("idx_requests_open").on(t.status, t.createdAt),           // pipeline board scan
    check(
      "ck_requests_status",
      sql`${t.status} IN ('new','sourcing','quoted','won','lost','no_bid','expired','cancelled')`,
    ),
    check(
      "ck_requests_channel",
      sql`${t.channel} IN ('upload','voice','paste','manual')`,
    ),
    check(
      "ck_requests_loss_reason",
      sql`${t.lossReason} IS NULL OR ${t.lossReason} IN ('price','no_capacity','client_cancelled','timing','competitor','other')`,
    ),
  ],
);

// ── request_lines ────────────────────────────────────────────────────────────
// One origin→dest route per line. Cascade-deleted with parent request.
// Becomes one Direction on win (R2). ESR nullable, raw always present (D15).
// targetRatePerWagon = client's DESIRED rate (SUGGESTED — D16).
export const requestLines = pgTable(
  "request_lines",
  {
    id:        uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    sortOrder: smallint("sort_order").notNull().default(0),

    // D15: raw always present; ESR nullable (resolved via dict)
    originRaw:     text("origin_raw").notNull(),
    originRoadRaw: text("origin_road_raw"),   // e.g. "СВР" — raw from file
    destRaw:       text("dest_raw").notNull(),
    destRoadRaw:   text("dest_road_raw"),     // e.g. "ГОР"

    originEsr: char("origin_esr", { length: 6 }).references(
      () => stations.esrCode, { onDelete: "set null" }
    ),
    destEsr: char("dest_esr", { length: 6 }).references(
      () => stations.esrCode, { onDelete: "set null" }
    ),

    cargoName:       text("cargo_name"),
    etsngCode:       varchar("etsng_code", { length: 8 }),
    wagonsRequested: integer("wagons_requested").notNull(),
    tonnagePerWagon: numeric("tonnage_per_wagon", { precision: 10, scale: 3 }),

    // D16: SUGGESTED desired rate — never auto-promoted to confirmed
    targetRatePerWagon: numeric("target_rate_per_wagon", { precision: 14, scale: 2 }),
    targetRateRaw:      text("target_rate_raw"),  // raw string "~1 900 р/ваг"

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_request_lines_request").on(t.requestId),
    index("idx_request_lines_origin_road").on(t.originRoadRaw),          // board "по дорогам"
    index("idx_request_lines_origin_station").on(t.originRaw),           // board "по направлениям"
    index("idx_request_lines_stations_esr").on(t.originEsr, t.destEsr),  // ESR-resolved joins
  ],
);
```

### 1.2 How to generate and hand-check the migration

```bash
# 1. Export DATABASE_URL_DIRECT (local Postgres or Railway direct URL)
export DATABASE_URL_DIRECT="postgres://..."

# 2. Generate — drizzle-kit reads the barrel src/lib/db/schema/index.ts
pnpm drizzle-kit generate

# 3. Review the generated file in drizzle/migrations/
#    Hand-check:
#      a. Two CREATE TABLE statements: requests + request_lines.
#      b. Three CHECK constraints on requests (status, channel, loss_reason).
#      c. No pgEnum DDL anywhere in the file (text columns only).
#      d. converted_order_id + cloned_from_request_id are plain uuid columns
#         with NO REFERENCES clause.
#      e. Four indexes on request_lines (request, origin_road, origin_station, esr).
#      f. No ALTER on orders, price_protocols, directions, deals, or any locked table.

# 4. Apply
pnpm drizzle-kit migrate
```

---

## 2. New schema files under `src/lib/db/schema/`

| File | Action |
|------|--------|
| `src/lib/db/schema/requests.ts` | **CREATE** — exports `requests`, `requestLines` |
| `src/lib/db/schema/index.ts` | **MODIFY** — add two lines: `export * from "./requests";` |

Barrel update (add after `"./directions"`):
```typescript
export * from "./requests";
```

---

## 3. Domain layer — `src/lib/requests/`

### File plan

| File | Pure? | Purpose |
|------|-------|---------|
| `src/lib/requests/schema.ts` | YES — no DB import | Zod validators for all inputs + AI extraction result type |
| `src/lib/requests/lifecycle.ts` | YES — no DB import | Status type, transition table, predicates |
| `src/lib/requests/grouping.ts` | YES — no DB import | Group/sort arrays of requests by client/station/road/date |
| `src/lib/requests/repository.ts` | NO — imports `@/lib/db/client` | DB: CRUD, transactional createWithLines, link client |

---

### 3.1 `src/lib/requests/schema.ts` (pure)

```typescript
import { z } from "zod";

// ── shared primitives ────────────────────────────────────────────────────────

const optText = z.string().trim().optional().transform(v => v?.length ? v : undefined);
const optRate = z.coerce.number().positive("Ставка должна быть > 0").optional();
const optInt  = z.coerce.number().int().positive().optional();

// ── requestLineInput — one route card ────────────────────────────────────────

export const requestLineInputSchema = z.object({
  originRaw:          z.string().trim().min(1, "Станция отправления обязательна"),
  originRoadRaw:      optText,
  destRaw:            z.string().trim().min(1, "Станция назначения обязательна"),
  destRoadRaw:        optText,
  // ESR resolved externally (dict lookup) — nullable, never invented (D15)
  originEsr:          z.string().length(6).optional(),
  destEsr:            z.string().length(6).optional(),
  cargoName:          optText,
  etsngCode:          optText,
  wagonsRequested:    z.coerce.number().int().min(1, "Количество вагонов ≥ 1"),
  tonnagePerWagon:    z.coerce.number().positive().optional(),
  targetRatePerWagon: optRate,   // D16: client desired — SUGGESTED only
  targetRateRaw:      optText,   // raw string from file
  sortOrder:          z.coerce.number().int().optional().default(0),
});

export type RequestLineInput = z.infer<typeof requestLineInputSchema>;

// ── requestCreateInput ────────────────────────────────────────────────────────

export const requestCreateSchema = z.object({
  // D16: client may be a real counterparty id OR a free-text raw label (TEMP)
  clientSuggestedId: z.uuid().optional(),
  clientRaw:         optText,
  channel:           z.enum(["upload", "voice", "paste", "manual"]).default("manual"),
  wagonType:         optText,
  cargoName:         optText,
  periodFrom:        optText,   // ISO datetime
  periodTo:          optText,
  receivedAt:        optText,
  validUntil:        optText,
  sourceRef:         optText,
  notes:             optText,
  lines:             z.array(requestLineInputSchema).min(1, "Нужна хотя бы одна строка маршрута"),
});

export type RequestCreateInput = z.infer<typeof requestCreateSchema>;

// ── requestUpdateSchema — partial header update (lines patched separately) ──

export const requestUpdateSchema = z.object({
  clientSuggestedId: z.uuid().optional(),
  clientRaw:         optText,
  wagonType:         optText,
  cargoName:         optText,
  periodFrom:        optText,
  periodTo:          optText,
  validUntil:        optText,
  notes:             optText,
  assignedTo:        z.uuid().optional(),
  channel:           z.enum(["upload", "voice", "paste", "manual"]).optional(),
});

export type RequestUpdateInput = z.infer<typeof requestUpdateSchema>;

// ── status transition ────────────────────────────────────────────────────────

const requestStatusEnum = z.enum([
  "new", "sourcing", "quoted", "won", "lost", "no_bid", "expired", "cancelled",
]);

export const requestTransitionSchema = z.object({
  to:               requestStatusEnum,
  // terminal metadata (validated against target status in lifecycle.ts)
  lossReason:       z.enum(["price","no_capacity","client_cancelled","timing","competitor","other"]).optional(),
  competitorPrice:  optRate,
  lostTo:           optText,
});

export type RequestTransitionInput = z.infer<typeof requestTransitionSchema>;

// ── linkClientSchema — link a TEMP client to a real counterparty ─────────────

export const linkClientSchema = z.object({
  // exactly one of id (existing) or name (find-or-create):
  counterparty: z.union([
    z.object({ id: z.uuid() }),
    z.object({ name: z.string().trim().min(1), inn: z.string().optional() }),
  ]),
});

export type LinkClientInput = z.infer<typeof linkClientSchema>;

// ── list filter ──────────────────────────────────────────────────────────────

export const requestListFilterSchema = z.object({
  bucket:      z.enum(["active", "archive"]).default("active"),
  clientId:    z.uuid().optional(),
  originRaw:   z.string().trim().optional(),
  roadRaw:     z.string().trim().optional(),   // filter by originRoadRaw
  page:        z.coerce.number().int().min(1).default(1),
  pageSize:    z.coerce.number().int().min(1).max(200).default(50),
});

export type RequestListFilter = z.infer<typeof requestListFilterSchema>;

// ── AI extraction result schema ──────────────────────────────────────────────
// Shape Claude returns for a client request file. Pure Zod — no DB import.
// forward-fill and Итого-drop happen BEFORE this type is populated.

export const extractedLineSchema = z.object({
  originRaw:          z.string(),
  originRoadRaw:      z.string().optional(),
  destRaw:            z.string(),
  destRoadRaw:        z.string().optional(),
  wagonsRequested:    z.number().int().min(1),
  cargoName:          z.string().optional(),
  etsngCode:          z.string().optional(),
  tonnagePerWagon:    z.number().optional(),
  targetRatePerWagon: z.number().optional(),
  targetRateRaw:      z.string().optional(),
});

export const extractionResultSchema = z.object({
  clientRaw:   z.string().optional(),    // LLM-guessed client name (SUGGESTED, D16)
  wagonType:   z.string().optional(),
  periodRaw:   z.string().optional(),    // "Июнь 2025", unparsed
  lines:       z.array(extractedLineSchema),
  // parsing metadata
  rawRowCount:      z.number().int(),    // rows seen before filtering
  droppedTotalRow:  z.boolean(),         // was an Итого row found + dropped?
  forwardFillCount: z.number().int(),    // rows where originRaw was forward-filled
  warnings:         z.array(z.string()).optional(),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type ExtractedLine    = z.infer<typeof extractedLineSchema>;
```

---

### 3.2 `src/lib/requests/lifecycle.ts` (pure)

```typescript
// Request lifecycle state machine. Pure — no DB import; unit-testable.
// Status set: new|sourcing|quoted|won|lost|no_bid|expired|cancelled
// Board buckets: АКТУАЛЬНЫЕ={new,sourcing,quoted}; АРХИВ=terminal statuses.

export type RequestStatus =
  | "new" | "sourcing" | "quoted"
  | "won" | "lost" | "no_bid" | "expired" | "cancelled";

export const TERMINAL_STATUSES: ReadonlySet<RequestStatus> = new Set([
  "won", "lost", "no_bid", "expired", "cancelled",
]);

// One-way transitions only. Terminals have no forward edges.
export const TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  new:       ["sourcing", "cancelled"],
  sourcing:  ["quoted", "no_bid", "expired", "cancelled"],
  quoted:    ["won", "lost", "expired"],
  won:       [],
  lost:      [],
  no_bid:    [],
  expired:   [],
  cancelled: [],
};

export function isTerminal(status: RequestStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isActive(status: RequestStatus): boolean {
  return !isTerminal(status);
}

/** Board bucket predicate — АКТУАЛЬНЫЕ vs АРХИВ */
export function isArchived(status: RequestStatus): boolean {
  return isTerminal(status);
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return (TRANSITIONS[from] as readonly string[]).includes(to);
}

// Transition metadata validation: loss_reason required when moving to lost/no_bid.
export interface TransitionGuardResult {
  ok: boolean;
  reason?: string;
}

export function validateTransitionMeta(
  to: RequestStatus,
  lossReason: string | undefined,
): TransitionGuardResult {
  if ((to === "lost" || to === "no_bid") && !lossReason) {
    return { ok: false, reason: "Укажите причину закрытия (loss_reason)" };
  }
  return { ok: true };
}
```

---

### 3.3 `src/lib/requests/grouping.ts` (pure)

The grouping module works on plain objects (matching `typeof requests.$inferSelect`
enriched with a `lines` array) — no DB import.

```typescript
// Pure grouping/sorting utilities for the "Запросы" board views.
// Input type uses only scalar fields that the repository SELECT projects.

export interface RequestSummary {
  id: string;
  requestNumber: string | null;
  status: string;
  clientSuggestedId: string | null;
  clientRaw: string | null;
  wagonType: string;
  createdAt: Date;
  validUntil: Date | null;
  // aggregated from lines (computed at load time by repository or client-side)
  totalWagonsRequested: number;
  lineCount: number;
  originStations: string[];   // unique originRaw values
  originRoads: string[];      // unique originRoadRaw values
}

// ── Group by client ──────────────────────────────────────────────────────────
// Returns a Map of clientKey → RequestSummary[].
// clientKey = clientSuggestedId (uuid) when available; "raw:<clientRaw>" as fallback;
// "__unlinked__" when both are null.
export type ClientKey = string;

export function groupByClient(
  requests: readonly RequestSummary[],
): Map<ClientKey, RequestSummary[]> {
  const map = new Map<ClientKey, RequestSummary[]>();
  for (const r of requests) {
    const key: ClientKey =
      r.clientSuggestedId          ? r.clientSuggestedId
      : r.clientRaw?.trim()        ? `raw:${r.clientRaw.trim()}`
      : "__unlinked__";
    const bucket = map.get(key) ?? [];
    bucket.push(r);
    map.set(key, bucket);
  }
  return map;
}

// ── Group by origin station (board "По направлениям") ───────────────────────
export function groupByOriginStation(
  requests: readonly RequestSummary[],
): Map<string, RequestSummary[]> {
  const map = new Map<string, RequestSummary[]>();
  for (const r of requests) {
    const stations = r.originStations.length > 0 ? r.originStations : ["__unknown__"];
    for (const station of stations) {
      const bucket = map.get(station) ?? [];
      bucket.push(r);
      map.set(station, bucket);
    }
  }
  return map;
}

// ── Group by road (board "По дорогам") ───────────────────────────────────────
export function groupByRoad(
  requests: readonly RequestSummary[],
): Map<string, RequestSummary[]> {
  const map = new Map<string, RequestSummary[]>();
  for (const r of requests) {
    const roads = r.originRoads.length > 0 ? r.originRoads : ["__unknown__"];
    for (const road of roads) {
      const bucket = map.get(road) ?? [];
      bucket.push(r);
      map.set(road, bucket);
    }
  }
  return map;
}

// ── Sort by created date descending (board "По дате заведения") ──────────────
export function sortByCreatedAt(
  requests: readonly RequestSummary[],
  order: "desc" | "asc" = "desc",
): RequestSummary[] {
  return [...requests].sort((a, b) => {
    const diff = a.createdAt.getTime() - b.createdAt.getTime();
    return order === "desc" ? -diff : diff;
  });
}

// ── Bucket: active vs archive ────────────────────────────────────────────────
const ACTIVE_STATUSES = new Set(["new", "sourcing", "quoted"]);
export function partitionByBucket(requests: readonly RequestSummary[]): {
  active: RequestSummary[];
  archive: RequestSummary[];
} {
  const active: RequestSummary[] = [];
  const archive: RequestSummary[] = [];
  for (const r of requests) {
    if (ACTIVE_STATUSES.has(r.status)) active.push(r);
    else archive.push(r);
  }
  return { active, archive };
}

// ── Unresolved-client bucket ─────────────────────────────────────────────────
export function getUnlinkedRequests(requests: readonly RequestSummary[]): RequestSummary[] {
  return requests.filter(r => !r.clientSuggestedId && !r.clientRaw?.trim());
}
```

---

### 3.4 `src/lib/requests/repository.ts` (DB — not pure)

Imports `@/lib/db/client`. Mirrors patterns from `directions/repository.ts` and
`pricing/repository.ts`.

```typescript
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { requests, requestLines } from "@/lib/db/schema/requests";
import { canTransition, validateTransitionMeta, type RequestStatus } from "./lifecycle";
import type {
  RequestCreateInput, RequestUpdateInput,
  RequestTransitionInput, LinkClientInput, RequestListFilter,
} from "./schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Domain error — mapped to HTTP status by route handlers (mirrors DirectionError).
export class RequestError extends Error {
  constructor(public readonly status: 404 | 409 | 422, message: string) {
    super(message);
    this.name = "RequestError";
  }
}

// ── internal helpers ─────────────────────────────────────────────────────────

function toDate(iso: string | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function numStr(n: number | undefined): string | null {
  return n === undefined ? null : String(n);
}

// find-or-create counterparty (mirrors pricing/repository.ts exactly)
async function resolveCounterpartyId(
  tx: Tx,
  input: { id: string } | { name: string; inn?: string },
  role: "client",
): Promise<string> {
  if ("id" in input) return input.id;
  const name = input.name.trim();
  const existing = await tx
    .select({ id: counterparties.id })
    .from(counterparties)
    .where(eq(counterparties.nameCanonical, name))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const created = await tx
    .insert(counterparties)
    .values({ nameCanonical: name, inn: input.inn, roles: [role] })
    .returning({ id: counterparties.id });
  return created[0].id;
}

async function loadRequest(tx: Tx, id: string) {
  const rows = await tx.select().from(requests).where(eq(requests.id, id)).limit(1);
  if (!rows[0]) throw new RequestError(404, "Запрос не найден");
  return rows[0];
}

// ── createRequestWithLines — atomic ─────────────────────────────────────────
// A single client intake: one `requests` header + N `request_lines`.
export async function createRequestWithLines(
  input: RequestCreateInput,
  userId: string,
): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(requests)
      .values({
        clientSuggestedId: input.clientSuggestedId ?? null,
        clientRaw:         input.clientRaw ?? null,
        status:            "new",
        channel:           input.channel,
        wagonType:         input.wagonType ?? "ПВ",
        cargoName:         input.cargoName ?? null,
        periodFrom:        toDate(input.periodFrom),
        periodTo:          toDate(input.periodTo),
        receivedAt:        toDate(input.receivedAt),
        validUntil:        toDate(input.validUntil),
        sourceRef:         input.sourceRef ?? null,
        notes:             input.notes ?? null,
        createdBy:         userId,
      })
      .returning({ id: requests.id });

    const requestId = inserted[0].id;

    if (input.lines.length > 0) {
      await tx.insert(requestLines).values(
        input.lines.map((line, i) => ({
          requestId,
          sortOrder:          line.sortOrder ?? i,
          originRaw:          line.originRaw,
          originRoadRaw:      line.originRoadRaw ?? null,
          destRaw:            line.destRaw,
          destRoadRaw:        line.destRoadRaw ?? null,
          originEsr:          line.originEsr ?? null,
          destEsr:            line.destEsr ?? null,
          cargoName:          line.cargoName ?? null,
          etsngCode:          line.etsngCode ?? null,
          wagonsRequested:    line.wagonsRequested,
          tonnagePerWagon:    numStr(line.tonnagePerWagon),
          targetRatePerWagon: numStr(line.targetRatePerWagon),
          targetRateRaw:      line.targetRateRaw ?? null,
        })),
      );
    }

    return { id: requestId };
  });
}

// ── list with filters ─────────────────────────────────────────────────────────
// Returns request rows + aggregated line counts and station/road arrays.
// Grouping/sorting is done client-side in grouping.ts from this flat result.
export async function listRequests(filter: RequestListFilter) {
  const ACTIVE = ["new", "sourcing", "quoted"] as const;
  const ARCHIVE = ["won", "lost", "no_bid", "expired", "cancelled"] as const;

  const statusSet = filter.bucket === "active" ? ACTIVE : ARCHIVE;

  const conditions = [
    inArray(requests.status, statusSet as unknown as string[]),
    filter.clientId ? eq(requests.clientSuggestedId, filter.clientId) : undefined,
  ].filter(Boolean);

  const rows = await db
    .select({
      id:                requests.id,
      requestNumber:     requests.requestNumber,
      status:            requests.status,
      clientSuggestedId: requests.clientSuggestedId,
      clientRaw:         requests.clientRaw,
      wagonType:         requests.wagonType,
      cargoName:         requests.cargoName,
      createdAt:         requests.createdAt,
      validUntil:        requests.validUntil,
      // aggregated from lines via SQL
      totalWagons:       sql<number>`COALESCE(SUM(${requestLines.wagonsRequested}), 0)::int`,
      lineCount:         sql<number>`COUNT(${requestLines.id})::int`,
      originStations:    sql<string[]>`ARRAY_AGG(DISTINCT ${requestLines.originRaw}) FILTER (WHERE ${requestLines.originRaw} IS NOT NULL)`,
      originRoads:       sql<string[]>`ARRAY_AGG(DISTINCT ${requestLines.originRoadRaw}) FILTER (WHERE ${requestLines.originRoadRaw} IS NOT NULL)`,
    })
    .from(requests)
    .leftJoin(requestLines, eq(requestLines.requestId, requests.id))
    .where(and(...conditions))
    .groupBy(requests.id)
    .orderBy(desc(requests.createdAt))
    .limit(filter.pageSize)
    .offset((filter.page - 1) * filter.pageSize);

  // optional road/station post-filter (cannot push into SQL ARRAY_AGG easily)
  const filtered = rows.filter(r => {
    if (filter.originRaw && !(r.originStations ?? []).some(s =>
      s.toLowerCase().includes(filter.originRaw!.toLowerCase()))) return false;
    if (filter.roadRaw && !(r.originRoads ?? []).some(rd =>
      rd.toLowerCase() === filter.roadRaw!.toLowerCase())) return false;
    return true;
  });

  return filtered;
}

// ── get single request with lines ────────────────────────────────────────────
export async function getRequest(id: string) {
  const [header, lines] = await Promise.all([
    db.select().from(requests).where(eq(requests.id, id)).limit(1),
    db.select().from(requestLines).where(eq(requestLines.requestId, id)).orderBy(asc(requestLines.sortOrder)),
  ]);
  if (!header[0]) throw new RequestError(404, "Запрос не найден");
  return { ...header[0], lines };
}

// ── updateRequest — header fields only (lines patched via line-level routes) ─
export async function updateRequest(id: string, input: RequestUpdateInput): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const current = await loadRequest(tx, id);
    if (current.status === "won") {
      throw new RequestError(409, "Выигранный запрос редактировать нельзя");
    }

    const patch: Partial<typeof requests.$inferInsert> = { updatedAt: new Date() };
    if (input.clientSuggestedId !== undefined) patch.clientSuggestedId = input.clientSuggestedId;
    if (input.clientRaw        !== undefined) patch.clientRaw         = input.clientRaw;
    if (input.wagonType        !== undefined) patch.wagonType         = input.wagonType;
    if (input.cargoName        !== undefined) patch.cargoName         = input.cargoName;
    if (input.periodFrom       !== undefined) patch.periodFrom        = toDate(input.periodFrom);
    if (input.periodTo         !== undefined) patch.periodTo          = toDate(input.periodTo);
    if (input.validUntil       !== undefined) patch.validUntil        = toDate(input.validUntil);
    if (input.notes            !== undefined) patch.notes             = input.notes;
    if (input.assignedTo       !== undefined) patch.assignedTo        = input.assignedTo;
    if (input.channel          !== undefined) patch.channel           = input.channel;

    await tx.update(requests).set(patch).where(eq(requests.id, id));
    return { id };
  });
}

// ── transitionRequest ────────────────────────────────────────────────────────
export async function transitionRequest(
  id: string,
  input: RequestTransitionInput,
): Promise<{ id: string; status: RequestStatus }> {
  return db.transaction(async (tx) => {
    const current = await loadRequest(tx, id);
    const from = current.status as RequestStatus;
    const to   = input.to;

    if (!canTransition(from, to)) {
      throw new RequestError(409, `Недопустимый переход: ${from} → ${to}`);
    }
    const guard = validateTransitionMeta(to, input.lossReason);
    if (!guard.ok) throw new RequestError(422, guard.reason!);

    const now = new Date();
    const patch: Partial<typeof requests.$inferInsert> = {
      status: to, updatedAt: now,
    };
    if (to === "won")       patch.wonAt       = now;
    if (to === "lost")      { patch.lostAt = now; patch.lossReason = input.lossReason; patch.competitorPrice = numStr(input.competitorPrice); patch.lostTo = input.lostTo ?? null; }
    if (to === "no_bid")    { patch.closedAt = now; patch.lossReason = input.lossReason; }
    if (to === "expired")   patch.expiredAt   = now;
    if (to === "cancelled") patch.cancelledAt = now;

    await tx.update(requests).set(patch).where(eq(requests.id, id));
    return { id, status: to };
  });
}

// ── deleteRequest — new-status only ─────────────────────────────────────────
export async function deleteRequest(id: string): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const current = await loadRequest(tx, id);
    if (current.status !== "new") {
      throw new RequestError(409, "Удалять можно только новый запрос — остальные отменяйте");
    }
    // requestLines cascade-delete via FK
    await tx.delete(requests).where(eq(requests.id, id));
    return { id };
  });
}

// ── linkClient — promote clientRaw to a real counterparty ───────────────────
// D16: operator manually links; never auto-confirmed.
export async function linkClient(
  id: string,
  input: LinkClientInput,
): Promise<{ id: string; clientSuggestedId: string }> {
  return db.transaction(async (tx) => {
    await loadRequest(tx, id);
    const counterpartyId = await resolveCounterpartyId(tx, input.counterparty, "client");
    await tx
      .update(requests)
      .set({ clientSuggestedId: counterpartyId, updatedAt: new Date() })
      .where(eq(requests.id, id));
    return { id, clientSuggestedId: counterpartyId };
  });
}
```

---

## 4. API routes — `src/app/api/requests/`

### File plan

| File | Method(s) | Purpose |
|------|-----------|---------|
| `src/app/api/requests/route.ts` | GET, POST | List (with filters) + create |
| `src/app/api/requests/[id]/route.ts` | GET, PATCH, DELETE | Get / update / delete |
| `src/app/api/requests/[id]/transition/route.ts` | POST | Status transition |
| `src/app/api/requests/[id]/link-client/route.ts` | POST | Link TEMP client to counterparty |
| `src/app/api/requests/extract/route.ts` | POST | Parse raw AI extraction JSON into validated `ExtractionResult` |

All routes:
- `export const runtime = "nodejs";`
- `export const dynamic = "force-dynamic";`
- Auth via `requireWriter(request.headers)` (throws `AuthError`)
- Errors caught as `AuthError | RequestError | unknown`; mapped to `apiFail`

### 4.1 `src/app/api/requests/route.ts`

```typescript
// GET ?bucket=active&clientId=&originRaw=&roadRaw=&page=1&pageSize=50
// POST body: RequestCreateInput + lines[]
// Both require writer session.
```

GET: parse `requestListFilterSchema` from `URL.searchParams` → `listRequests(filter)` → `apiOk(rows)`.

POST: parse `requestCreateSchema` from JSON body → `createRequestWithLines(parsed.data, user.id)` → `apiOk(result, 201)`.

### 4.2 `src/app/api/requests/[id]/route.ts`

```typescript
// GET  — getRequest(id) → apiOk(row + lines)
// PATCH — if body contains `to` key → transitionRequest branch;
//          else                       → updateRequest branch
// DELETE — deleteRequest(id) → apiOk({ id })
```

PATCH branching mirrors `directions/[id]/route.ts` exactly: `isRecord(body) && "to" in body`.

### 4.3 `src/app/api/requests/[id]/transition/route.ts`

```typescript
// POST — explicit transition endpoint (alternative to PATCH with `to`)
// parse requestTransitionSchema → transitionRequest(id, parsed.data) → apiOk
```

### 4.4 `src/app/api/requests/[id]/link-client/route.ts`

```typescript
// POST — link a TEMP clientRaw label to a real counterparty (D16, operator action)
// parse linkClientSchema → linkClient(id, parsed.data) → apiOk({ id, clientSuggestedId })
```

### 4.5 `src/app/api/requests/extract/route.ts`

```typescript
// POST body: { rawJson: unknown } — operator submits raw LLM extraction output
// Validate against extractionResultSchema.
// Apply forward-fill + Итого-drop at this boundary (see §5.1).
// Return validated + cleaned ExtractionResult (does NOT write to DB).
// Caller then issues POST /api/requests with the cleaned lines.
```

The extract endpoint is a **pure parse + validate + normalize step** — no DB writes.
Forward-fill and Итого-drop are applied here so the DB layer never sees raw un-cleaned rows.

Forward-fill + Итого-drop algorithm (lives in a pure helper `src/lib/requests/extract.ts`):
```typescript
// 1. Drop rows where originRaw is a variant of "Итого"/"Total"/blank with
//    numeric wagonsRequested summing to prior rows (heuristic: row is last + wagons ≥ sum of others).
// 2. Forward-fill: for each row where originRaw is null/empty/whitespace,
//    copy originRaw + originRoadRaw from the last non-empty row.
// 3. Return cleaned array + droppedTotalRow flag + forwardFillCount.
```

---

## 5. Unit test plan — `src/lib/requests/*.test.ts`

All tests use vitest. Zero DB import — no `@/lib/db/client`.

### 5.1 `src/lib/requests/lifecycle.test.ts`

| Test case | Assertion |
|-----------|-----------|
| `canTransition("new", "sourcing")` | `true` |
| `canTransition("new", "won")` | `false` |
| `canTransition("quoted", "won")` | `true` |
| `canTransition("won", "cancelled")` | `false` (terminal) |
| `isTerminal("won")` | `true` |
| `isTerminal("new")` | `false` |
| `isArchived("lost")` | `true` |
| `isArchived("sourcing")` | `false` |
| `validateTransitionMeta("lost", undefined)` | `{ ok: false }` |
| `validateTransitionMeta("lost", "price")` | `{ ok: true }` |
| `validateTransitionMeta("cancelled", undefined)` | `{ ok: true }` |
| `validateTransitionMeta("no_bid", undefined)` | `{ ok: false }` |

### 5.2 `src/lib/requests/schema.test.ts`

| Test case | Assertion |
|-----------|-----------|
| `requestCreateSchema.parse` with valid single line | passes, channel defaults to "manual" |
| `requestLineInputSchema.parse` with wagonsRequested=0 | throws (min 1) |
| `requestLineInputSchema.parse` without originRaw | throws |
| `requestTransitionSchema.parse({ to: "invalid" })` | throws |
| `extractionResultSchema.parse` with valid golden fixture (Июнь plan rows) | passes |
| `extractionResultSchema.parse` with missing lines array | throws |
| `linkClientSchema.parse({ counterparty: { id: "uuid..." } })` | passes |
| `linkClientSchema.parse({ counterparty: { name: "Ураласбест" } })` | passes |
| `linkClientSchema.parse({ counterparty: {} })` | throws (union exhausted) |

### 5.3 `src/lib/requests/grouping.test.ts`

Golden fixture: array of 5 `RequestSummary` objects (2 for client A, 2 for client B, 1 unlinked):

| Test case | Assertion |
|-----------|-----------|
| `groupByClient` — client A uuid | bucket contains 2 items |
| `groupByClient` — `__unlinked__` key | contains 1 item |
| `groupByClient` — raw-label client (no uuid) | key is `raw:<label>` |
| `groupByOriginStation` — station "Асбест" | correct items grouped |
| `groupByRoad` — road "СВР" | correct items |
| `sortByCreatedAt` desc | newest first |
| `partitionByBucket` | active set = {new,sourcing,quoted}; archive = rest |
| `getUnlinkedRequests` | returns only items with no clientId and no clientRaw |

### 5.4 `src/lib/requests/extract.test.ts`

Golden fixture based on `план на Июнь.xlsx` columns:
```
['ст.погрузки','дорога погрузки','ст.назначения','дорога назначения','объем, ваг/мес']
row1: ['Теплая гора','СВР','Шемордан','ГОР',200]
row2: [None,None,'Йошкар-Ола','ГОР',50]       ← forward-fill
row3: ['Первоуральск','СВР','все станции','ГОР',30]
row_total: ['Итого',None,None,None,950]         ← must drop
```

| Test case | Assertion |
|-----------|-----------|
| `applyForwardFill + dropTotalRow` on above fixture | returns 3 lines, no Итого row |
| forward-filled row2 | `originRaw = "Теплая гора"`, `originRoadRaw = "СВР"` |
| `droppedTotalRow` flag | `true` |
| `forwardFillCount` | `1` |
| Итого is only row (edge case) | returns 0 lines |
| All rows have explicit origins | `forwardFillCount = 0` |
| Row with wagonsRequested = 0 (bad data) | filtered/warned, not inserted |

---

## Files to Create

| File | Purpose | Priority |
|------|---------|----------|
| `src/lib/db/schema/requests.ts` | Drizzle table definitions (`requests`, `requestLines`) | 1 |
| `src/lib/requests/schema.ts` | Zod validators + AI extraction schema | 1 |
| `src/lib/requests/lifecycle.ts` | Status machine, predicates | 1 |
| `src/lib/requests/grouping.ts` | Pure grouping/sorting | 2 |
| `src/lib/requests/extract.ts` | Forward-fill + Итого-drop pure helpers | 2 |
| `src/lib/requests/repository.ts` | DB operations (createWithLines, list, get, update, transition, delete, linkClient) | 2 |
| `src/app/api/requests/route.ts` | GET list + POST create | 3 |
| `src/app/api/requests/[id]/route.ts` | GET + PATCH + DELETE | 3 |
| `src/app/api/requests/[id]/transition/route.ts` | POST status transition | 3 |
| `src/app/api/requests/[id]/link-client/route.ts` | POST link TEMP client | 3 |
| `src/app/api/requests/extract/route.ts` | POST parse + validate AI extraction | 3 |
| `src/lib/requests/lifecycle.test.ts` | Lifecycle unit tests | 4 |
| `src/lib/requests/schema.test.ts` | Schema unit tests | 4 |
| `src/lib/requests/grouping.test.ts` | Grouping unit tests | 4 |
| `src/lib/requests/extract.test.ts` | Extraction parse unit tests | 4 |

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `src/lib/db/schema/index.ts` | Add `export * from "./requests";` | 1 |

---

## Data Flow

```
Client file (xlsx/paste)
  └─► POST /api/requests/extract
        └─► extractionResultSchema.parse(rawLlmJson)
              └─► applyForwardFill + dropTotalRow  (pure, extract.ts)
              └─► returns ExtractionResult (cleaned lines, warnings)

Operator reviews + submits:
  └─► POST /api/requests          (body: RequestCreateInput with lines[])
        └─► requestCreateSchema.parse
              └─► createRequestWithLines(input, userId)  [transaction]
                    └─► INSERT requests (status='new')
                    └─► INSERT request_lines × N

Board load:
  GET /api/requests?bucket=active&...
    └─► listRequests(filter)   [DB, left-join lines for aggregates]
    └─► groupByClient / groupByRoad / groupByOriginStation  [pure, client-side or SSR]

Status advance:
  PATCH /api/requests/[id]  { to: "sourcing" }
    └─► transitionRequest → canTransition + validateTransitionMeta → UPDATE

Client link:
  POST /api/requests/[id]/link-client  { counterparty: { id | name } }
    └─► resolveCounterpartyId (find-or-create) → UPDATE clientSuggestedId
```

---

## Build Sequence

1. `src/lib/db/schema/requests.ts` + barrel update → `pnpm drizzle-kit generate` + hand-check migration → `pnpm drizzle-kit migrate`
2. `src/lib/requests/lifecycle.ts` (pure) + `src/lib/requests/lifecycle.test.ts`
3. `src/lib/requests/schema.ts` (pure) + `src/lib/requests/schema.test.ts`
4. `src/lib/requests/extract.ts` (pure) + `src/lib/requests/extract.test.ts` — golden fixtures from plan-June example
5. `src/lib/requests/grouping.ts` (pure) + `src/lib/requests/grouping.test.ts`
6. `src/lib/requests/repository.ts` (DB)
7. API routes: `route.ts`, `[id]/route.ts`, `[id]/transition/route.ts`, `[id]/link-client/route.ts`, `extract/route.ts`
8. Run full `pnpm vitest run src/lib/requests` — all pure tests pass without DB/env
