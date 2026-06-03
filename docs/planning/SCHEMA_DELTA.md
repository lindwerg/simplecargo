# SCHEMA_DELTA — Order / Direction Product Layer

> **Status:** PROPOSED additive delta to the locked canonical schema (`DB_SCHEMA.md`, decisions D1–D18).
> **Nature:** Net-new tables + nullable FK columns on existing tables. **No locked table is altered destructively; no locked invariant is contradicted.**
> **Scope guard:** This is a *delta spec*, not a phase claim. Per the locked P0 scaffold list (`MVP_PLAN.md` §P0), these tables are **NOT** part of the locked P0 canonical scaffold. Adding any of them is a deviation that lands at the phase noted per table (see Revised Phase Plan). Calling them "P0 scaffold" would be false.

---

## 0. Resolved Cross-Finding Contradictions (read before migrating)

The five design findings disagreed on three structural points. This delta picks one resolution for each; the choices are load-bearing and were validated against locked physics.

| # | Conflict | RESOLUTION (this doc) | Locked basis |
|---|----------|-----------------------|--------------|
| R1 | Where does `direction_id` live? (movement-grain vs deal-grain) | **`direction_id` lives ONLY on `deals` (the trip-level commercial record). NEVER on `wagons` or `wagon_movements`.** A physical wagon serves many directions over its life; a *trip* belongs to one direction. | D2/D5: turnover is a per-wagon cross-trip cycle, independent of any direction. Stamping movements with a direction would corrupt the cross-trip cycle and misattribute margin. |
| R2 | Order↔Direction cardinality (1:1 vs 1:N) | **Order 1 → N Direction.** One ПСЦ can yield several rate lines / routes; operator chooses which `extracted_prices` lines spawn directions. | One physical doc → many priced routes (real freight case). |
| R3 | Direction owner cardinality | **Direction 1 → N owner bindings** (split wagon lots / multiple собственники), each with optional per-owner rate override. | The `от компании` second-entity case + real split-lot operations. |
| R4 | Is mailbox routing a *replacement* for `(wagon,waybill)` matching? | **No. Mailbox resolves a candidate SCOPE only.** Inbound files still pass through the locked `event_key` dedup (D6) and `(wagon,waybill)`+date-window matching (D5/D9). Source A full-fleet exports IGNORE mailbox scope and route by content. | D6/D9: cross-source event identity prevents double-counting; mailbox cannot substitute for it. |
| R5 | Invoice grain (per-direction vs per-client-period) | **Invoice grain = client + period.** A single Счёт-фактура covers N report rows across possibly several directions; per-direction `paid` is derived through an allocation junction, not a denormalized `invoices.direction_id`. | Rail invoicing is monthly/consolidated; a `NOT NULL direction_id` would make a multi-direction invoice unrepresentable. |

**D16 guard (carried into every pricing/client field):** the LLM may *suggest* a client and rates into the review UI, but `client_id`, `rate_client`, `rate_owner` are **operator-confirmed only**. Suggested values live in separate `*_suggested` columns and are never written silently to the confirmed columns.

---

## 1. Entity Relationship Overview

```
source_documents (ПСЦ / ЗАЯВКА files)        [P5]
      │ 1:N  LLM extraction
      ▼
extracted_prices (one line per route/rate)   [P5]
      │ operator confirms a line  →  spawns
      ▼
orders (Заявка)  ── 1:N ──▶  directions (Направление)        [orders P5 / directions P1.5]
                                  │
        ┌──── 1:N owner bindings ─┤── 1:N client bindings ───┐  [P3]
        ▼                         │                          ▼
direction_owner_bindings          │            direction_client_bindings
 (inbound mailbox = scope key)    │             (forward-to email)
                                  │
                                  │  deals.direction_id (nullable FK)   [P1.5]
                                  ▼
                               deals (existing, locked)
                                  │  → report_rows (existing, locked, D17 emit gate)
                                  │
                  invoice_lines ◀─┘ allocate report_row → invoice    [P4]
                        ▲
                     invoices (client+period) ── 1:N ──▶ payments     [P4]
```

`wagon_movements` is deliberately **absent** from the direction graph (R1). It links to a deal; the deal carries the direction.

---

## 2. Status Enums (Drizzle `pgEnum`)

```typescript
// src/db/schema/_enums.product.ts
import { pgEnum } from "drizzle-orm/pg-core";

export const orderStatus = pgEnum("order_status", [
  "draft", "confirmed", "active", "completed", "cancelled",
]);

export const directionStatus = pgEnum("direction_status", [
  "draft",     // configured, no bindings live yet
  "open",      // bindings set, awaiting first dislocation
  "active",    // wagons moving, deals accumulating
  "paused",    // forwarding + matching suspended
  "completed", // done; deals frozen for margin, but see grace window M2
  "cancelled",
]);

export const sourceDocType = pgEnum("source_doc_type", [
  "psc",      // ПСЦ — ASSUMPTION: Протокол согласования цены (flag, P5 only)
  "zayavka",  // ЗАЯВКА — order request
  "other",
]);

export const extractionStatus = pgEnum("extraction_status", [
  "pending", "processing", "completed", "failed", "needs_review",
]);

export const bindingStatus = pgEnum("binding_status", ["active", "inactive"]);

export const mailboxType = pgEnum("mailbox_type", [
  "owner_inbound",    // where the owner's dislocations arrive (scope key)
  "client_outbound",  // where parsed dislocations are forwarded
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft", "issued", "partially_paid", "paid", "overdue", "cancelled",
]);

export const paymentStatus = pgEnum("payment_status", [
  "pending", "confirmed", "failed",
]);
```

```sql
CREATE TYPE order_status      AS ENUM ('draft','confirmed','active','completed','cancelled');
CREATE TYPE direction_status  AS ENUM ('draft','open','active','paused','completed','cancelled');
CREATE TYPE source_doc_type   AS ENUM ('psc','zayavka','other');
CREATE TYPE extraction_status AS ENUM ('pending','processing','completed','failed','needs_review');
CREATE TYPE binding_status    AS ENUM ('active','inactive');
CREATE TYPE mailbox_type      AS ENUM ('owner_inbound','client_outbound');
CREATE TYPE invoice_status    AS ENUM ('draft','issued','partially_paid','paid','overdue','cancelled');
CREATE TYPE payment_status    AS ENUM ('pending','confirmed','failed');
```

---

## 3. Tables

> Conventions kept identical to the locked schema: `uuid` PKs `default gen_random_uuid()`; money = `NUMERIC(14,2)`; timestamps = `TIMESTAMPTZ` (UTC, D1); ESR codes = `CHAR(6)` referencing `stations.esr_code`; wagon numbers = `CHAR(8)`; `counterparties.id` / `users.id` / `deals.id` are existing UUID PKs.

### 3.1 `orders` (Заявка) — phase **P5** (table scaffold may land P1.5 empty)

```typescript
// src/db/schema/orders.ts
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { counterparties } from "./counterparties";
import { users } from "./auth";
import { orderStatus } from "./_enums.product";

export const orders = pgTable("orders", {
  id:           uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orderNumber:  text("order_number"),                       // human ref, optional
  status:       orderStatus("status").notNull().default("draft"),
  // SUGGESTED client from LLM; confirmed client is set per-direction (D16)
  clientSuggestedId: uuid("client_suggested_id").references(() => counterparties.id, { onDelete: "set null" }),
  notes:        text("notes"),
  createdBy:    uuid("created_by").notNull().references(() => users.id),
  confirmedAt:  timestamp("confirmed_at", { withTimezone: true }),
  confirmedBy:  uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  statusIdx: index("idx_orders_status").on(t.status),
}));
```

**Locked decision respected:** D16 — no client is auto-committed; `client_suggested_id` is advisory, the binding's confirmed `client_id` is operator-entered.

### 3.2 `directions` (Направление) — phase **P1.5** (manual CRUD)

```typescript
// src/db/schema/directions.ts
import { pgTable, uuid, text, integer, numeric, timestamp, char, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orders } from "./orders";
import { stations } from "./stations";
import { users } from "./auth";
import { directionStatus } from "./_enums.product";

export const directions = pgTable("directions", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  // NULLABLE (M3/R2): a Direction may be created manually or for historical import — no Order.
  orderId:     uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
  displayName: text("display_name"),                        // "Асбест → Голышманово / Июнь 2025"
  status:      directionStatus("status").notNull().default("draft"),

  // route — ESR resolved (D15: never invent codes); raw preserved when unresolved
  stationOriginEsr: char("station_origin_esr", { length: 6 }).references(() => stations.esrCode, { onDelete: "set null" }),
  stationDestEsr:   char("station_dest_esr",   { length: 6 }).references(() => stations.esrCode, { onDelete: "set null" }),
  stationOriginRaw: text("station_origin_raw"),
  stationDestRaw:   text("station_dest_raw"),
  cargoName:        text("cargo_name"),

  wagonCountPlanned: integer("wagon_count_planned"),
  tonnagePerWagon:   numeric("tonnage_per_wagon", { precision: 10, scale: 3 }),

  // pricing — NULLABLE (M3): historical directions carry no ПСЦ rate. Operator-confirmed (D16).
  rateClient:  numeric("rate_client", { precision: 14, scale: 2 }),
  rateOwner:   numeric("rate_owner",  { precision: 14, scale: 2 }),
  // SUGGESTED values from LLM extraction — never used in margin, display only (H1/D16)
  rateClientSuggested: numeric("rate_client_suggested", { precision: 14, scale: 2 }),
  rateOwnerSuggested:  numeric("rate_owner_suggested",  { precision: 14, scale: 2 }),
  currency:    char("currency", { length: 3 }).notNull().default("RUB"),
  rateBasis:   text("rate_basis"),                          // per_trip | per_ton | per_wagon | lump_sum
  rateModel:   text("rate_model").notNull().default("per_wagon_trip"), // per_wagon_trip | lump_sum (M4)
  paymentTermsRaw: text("payment_terms_raw"),
  validFrom:   timestamp("valid_from", { withTimezone: true }),
  validTo:     timestamp("valid_to",   { withTimezone: true }),

  seededFromExtractedPriceId: uuid("seeded_from_extracted_price_id"), // FK added in P5 migration

  createdBy:   uuid("created_by").notNull().references(() => users.id),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  orderIdx:      index("idx_directions_order").on(t.orderId),
  statusIdx:     index("idx_directions_status").on(t.status),
  routeIdx:      index("idx_directions_route").on(t.stationOriginEsr, t.stationDestEsr),
}));
```

**Locked decisions respected:** D15 (ESR FK to `stations`, raw text fallback, never invent codes); D16 (rates nullable + operator-confirmed, suggestions held separately); D17 (`rate_model` enables the lump-sum emit branch without breaking the per-wagon revenue+cost gate).

### 3.3 `direction_owner_bindings` — phase **P3**

```typescript
// src/db/schema/directionOwnerBindings.ts
export const directionOwnerBindings = pgTable("direction_owner_bindings", {
  id:           uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  directionId:  uuid("direction_id").notNull().references(() => directions.id, { onDelete: "cascade" }),
  ownerId:      uuid("owner_id").notNull().references(() => counterparties.id, { onDelete: "restrict" }),
  inboundMailbox: text("inbound_mailbox").notNull(),        // normalized lowercase; SCOPE key (R4), not a matcher
  wagonCountAllocated: integer("wagon_count_allocated"),
  rateOwnerOverride:   numeric("rate_owner_override", { precision: 14, scale: 2 }),
  status:       bindingStatus("status").notNull().default("active"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  directionIdx: index("idx_dir_owner_bind_direction").on(t.directionId),
  // HOT PATH: inbound email → candidate scope lookup
  mailboxIdx:   index("idx_dir_owner_bind_mailbox").on(t.inboundMailbox),
}));
```

Plus a **partial unique index defined in SQL** (Drizzle `.where()` partial uniqueness) to forbid the same mailbox scoping two live directions (M1 — prevents the activation race / ambiguous bootstrap):

```sql
-- one live mailbox → one live direction (open OR active), across the whole table
CREATE UNIQUE INDEX uq_owner_mailbox_live
  ON direction_owner_bindings (inbound_mailbox)
  WHERE status = 'active';
```

**Locked decisions respected:** D6/D9 (R4 — this is a scope filter; the worker still runs `event_key` dedup + `(wagon,waybill)` matching afterwards). The mailbox index is the only new hot path; it does not touch the locked ingestion dedup chain.

### 3.4 `direction_client_bindings` — phase **P3**

```typescript
export const directionClientBindings = pgTable("direction_client_bindings", {
  id:          uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  directionId: uuid("direction_id").notNull().references(() => directions.id, { onDelete: "cascade" }),
  clientId:    uuid("client_id").notNull().references(() => counterparties.id, { onDelete: "restrict" }),
  forwardToEmail:  text("forward_to_email").notNull(),
  forwardCcEmails: text("forward_cc_emails").array(),
  status:      bindingStatus("status").notNull().default("active"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  directionIdx: index("idx_dir_client_bind_direction").on(t.directionId),
  forwardIdx:   index("idx_dir_client_bind_forward").on(t.forwardToEmail),
}));
```

**Locked decision respected:** client-forward is decoupled from owner-scope (R4); the `client_id` here is the operator-confirmed paying counterparty (D16), separate from the `Грузополучатель`/consignee.

### 3.5 `source_documents` — phase **P5**

```typescript
export const sourceDocuments = pgTable("source_documents", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  orderId:       uuid("order_id").references(() => orders.id, { onDelete: "set null" }), // nullable: upload precedes order (ADR-001)
  docType:       sourceDocType("doc_type").notNull(),
  originalFileName: text("original_file_name").notNull(),
  storagePath:   text("storage_path").notNull(),
  contentSha256: char("content_sha256", { length: 64 }).notNull(), // SAME idempotency key family as ingested_files (D6)
  mimeType:      text("mime_type"),
  extractionStatus: extractionStatus("extraction_status").notNull().default("pending"),
  extractionJobId:  text("extraction_job_id"),
  extractionError:  text("extraction_error"),
  rawExtractedJson: text("raw_extracted_json"),               // full LLM tool-use response, audit
  confidenceScore:  numeric("confidence_score", { precision: 4, scale: 3 }),
  uploadedBy:    uuid("uploaded_by").notNull().references(() => users.id),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  shaIdx:    uniqueIndex("uq_source_doc_sha").on(t.contentSha256),
  orderIdx:  index("idx_source_doc_order").on(t.orderId),
}));
```

**Locked decision respected:** D6 — SHA-256 content-hash idempotency (re-uploading the same file is a no-op), mirroring `ingested_files.content_sha256`.

### 3.6 `extracted_prices` — phase **P5**

```typescript
export const extractedPrices = pgTable("extracted_prices", {
  id:               uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceDocumentId: uuid("source_document_id").notNull().references(() => sourceDocuments.id, { onDelete: "cascade" }),
  // raw-as-found; resolution to ESR / counterparty happens on operator confirm (D15/D16)
  stationFromRaw:   text("station_from_raw"),
  stationToRaw:     text("station_to_raw"),
  stationFromEsr:   char("station_from_esr", { length: 6 }).references(() => stations.esrCode, { onDelete: "set null" }),
  stationToEsr:     char("station_to_esr",   { length: 6 }).references(() => stations.esrCode, { onDelete: "set null" }),
  cargo:            text("cargo"),
  wagonCount:       integer("wagon_count"),
  tonnagePerWagon:  numeric("tonnage_per_wagon", { precision: 10, scale: 3 }),
  rateClient:       numeric("rate_client", { precision: 14, scale: 2 }),  // SUGGESTED only (D16)
  rateOwner:        numeric("rate_owner",  { precision: 14, scale: 2 }),  // SUGGESTED only
  currency:         char("currency", { length: 3 }).default("RUB"),
  vatInclusive:     text("vat_inclusive"),                  // 'yes'|'no'|'unknown' (G4/H1: must resolve before margin use)
  paymentTermsRaw:  text("payment_terms_raw"),
  validFrom:        timestamp("valid_from", { withTimezone: true }),
  validTo:          timestamp("valid_to",   { withTimezone: true }),
  clientCounterpartyRaw: text("client_counterparty_raw"),
  ownerCounterpartyRaw:  text("owner_counterparty_raw"),
  confirmedBy:      uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
  confirmedAt:      timestamp("confirmed_at", { withTimezone: true }),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  docIdx: index("idx_extracted_prices_doc").on(t.sourceDocumentId),
}));
```

**Locked decisions respected:** D10 (LLM runs once per file, never per row — extraction is per `source_document`); D15 (no invented ESR; raw text + nullable resolved FK); D16 (rates are suggestions until confirmed); G4 (`vat_inclusive` forces VAT to be resolved so `amount_billed_net` can equal `revenue_ua`).

### 3.7 `invoices` — phase **P4** — **client+period grain (R5), NOT direction-scoped**

```typescript
export const invoices = pgTable("invoices", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: text("invoice_number").notNull(),          // Счет фактура, human ref
  clientId:      uuid("client_id").notNull().references(() => counterparties.id),
  periodFrom:    timestamp("period_from", { withTimezone: true }),
  periodTo:      timestamp("period_to",   { withTimezone: true }),
  amountBilled:  numeric("amount_billed",     { precision: 14, scale: 2 }).notNull(), // gross
  amountBilledNet: numeric("amount_billed_net", { precision: 14, scale: 2 }),         // must reconcile to Σ revenue_ua (G4)
  vatRate:       numeric("vat_rate", { precision: 5, scale: 2 }),
  currency:      char("currency", { length: 3 }).notNull().default("RUB"),
  issuedAt:      timestamp("issued_at", { withTimezone: true }),
  dueAt:         timestamp("due_at",    { withTimezone: true }),
  status:        invoiceStatus("status").notNull().default("draft"),
  notes:         text("notes"),
  createdBy:     uuid("created_by").notNull().references(() => users.id),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  numberIdx: uniqueIndex("uq_invoice_number").on(t.invoiceNumber),
  clientIdx: index("idx_invoice_client").on(t.clientId),
  statusIdx: index("idx_invoice_status").on(t.status),
}));
```

### 3.8 `invoice_lines` — phase **P4** — allocation junction (R5)

Allocates one invoice across N `report_rows` (and therefore across N directions). Per-direction `оплачено` is derived by summing payments weighted by line allocation.

```typescript
export const invoiceLines = pgTable("invoice_lines", {
  id:           uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId:    uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "cascade" }),
  reportRowId:  uuid("report_row_id").notNull(),            // FK → report_rows.id (existing, locked)
  directionId:  uuid("direction_id").references(() => directions.id, { onDelete: "set null" }), // denorm for fast per-direction rollup
  amountNet:    numeric("amount_net", { precision: 14, scale: 2 }).notNull(), // allocated client revenue for this row
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  invoiceIdx:   index("idx_invoice_line_invoice").on(t.invoiceId),
  rowIdx:       uniqueIndex("uq_invoice_line_row").on(t.reportRowId), // a report row is invoiced at most once
  directionIdx: index("idx_invoice_line_direction").on(t.directionId),
}));
```

### 3.9 `payments` — phase **P4**

```typescript
export const payments = pgTable("payments", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid("invoice_id").notNull().references(() => invoices.id, { onDelete: "restrict" }),
  amount:    numeric("amount",     { precision: 14, scale: 2 }).notNull(), // gross received
  amountNet: numeric("amount_net", { precision: 14, scale: 2 }),
  currency:  char("currency", { length: 3 }).notNull().default("RUB"),
  paidAt:    timestamp("paid_at", { withTimezone: true }).notNull(),
  status:    paymentStatus("status").notNull().default("pending"),
  reference: text("reference"),                             // bank p/o or txn id
  notes:     text("notes"),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  invoiceIdx: index("idx_payment_invoice").on(t.invoiceId),
}));
```

**Locked decisions respected (3.7–3.9):** D7 (money = `NUMERIC(14,2)`); D17 (invoicing keys off `report_rows`, which only exist when margin is emittable — revenue+cost both present); G4 (`amount_billed_net` must reconcile to `Σ revenue_ua`, not to margin — VAT resolved at extraction).

---

## 4. Changes to existing locked tables

### 4.1 `deals` — add `direction_id` (R1 — deal grain only) — phase **P1.5**

```typescript
// added to existing src/db/schema/deals.ts table body:
directionId: uuid("direction_id").references(() => directions.id, { onDelete: "set null" }), // nullable for legacy/historical
directionMatchMethod: text("direction_match_method"),  // 'email_scope' | 'manual' | 'historical_import'
// added to indexes:
directionIdx: index("idx_deals_direction").on(t.directionId),
```

```sql
ALTER TABLE deals
  ADD COLUMN direction_id          UUID REFERENCES directions(id) ON DELETE SET NULL,
  ADD COLUMN direction_match_method TEXT;
CREATE INDEX idx_deals_direction ON deals(direction_id);
```

**Locked decision respected:** D5/D2 — the direction binds at the *trip* (deal) grain; turnover stays a pure per-wagon cross-trip cycle. `wagon_movements` is **not** touched (R1).

### 4.2 `ingested_files` — promote `sender_email`, add `direction_id` — phase **P3**

`sender_email` already exists (provenance). P3 promotes it to a routing-scope input and adds the resolved scope:

```sql
ALTER TABLE ingested_files
  ADD COLUMN direction_id UUID REFERENCES directions(id) ON DELETE SET NULL;
CREATE INDEX idx_files_direction ON ingested_files(direction_id);
```

**Locked decision respected:** D6 — `content_sha256` remains the file idempotency anchor; `direction_id` is an added nullable scope, backward-compatible with P2 files that have no direction. Forward idempotency anchors on `(content_sha256, direction_id)` — NOT on RFC `Message-ID` (which is spoofable/optional). `wagon_movements` is **not** given a `direction_id` (R1).

---

## 5. Direction KPI read model (Tab 1 cards / drill-in)

Non-materialized view; materialize only if volume demands. Counts go **through `deals.direction_id`** (R1), never through movements.

```sql
CREATE OR REPLACE VIEW direction_kpis AS
SELECT
  d.id  AS direction_id,
  d.status,
  d.wagon_count_planned,
  d.rate_client,
  d.rate_owner,

  -- ОТГРУЖЕНО: distinct wagons whose trip (deal) belongs to this direction
  COUNT(DISTINCT dl.wagon_number) FILTER (WHERE dl.direction_id = d.id)        AS wagons_shipped,

  -- ЗАРАБОТАНО: margin, gated exactly like the report (D17 — both present)
  COALESCE(SUM(dl.revenue_ua - dl.cost_owner)
    FILTER (WHERE dl.direction_id = d.id
              AND dl.revenue_ua IS NOT NULL
              AND dl.cost_owner IS NOT NULL), 0)                               AS earned_margin,

  -- ВЫСТАВЛЕНО: net revenue invoiced, allocated per direction via invoice_lines (R5)
  COALESCE(SUM(il.amount_net) FILTER (WHERE il.direction_id = d.id), 0)        AS invoiced_net,

  -- ОПЛАЧЕНО: payments weighted by line allocation share of their invoice
  COALESCE(SUM(
    p.amount_net * (il.amount_net / NULLIF(inv.amount_billed_net, 0))
  ) FILTER (WHERE il.direction_id = d.id AND p.status = 'confirmed'), 0)       AS paid_net

FROM directions d
LEFT JOIN deals         dl  ON dl.direction_id = d.id
LEFT JOIN invoice_lines il  ON il.direction_id = d.id
LEFT JOIN invoices      inv ON inv.id = il.invoice_id
LEFT JOIN payments      p   ON p.invoice_id = inv.id
GROUP BY d.id;
```

**Locked decisions respected:** D17 (margin gate identical to the report path — same `revenue_ua`/`cost_owner` columns, same null guard, no second formula); D7 (no stored margin). The "unbilled" badge compares `Σ revenue_ua` (client side) against `invoiced_net`, never margin (corrects the G4/H4 mismatch).

---

## 6. Worker scope→match flow (informs schema usage; R4)

```
inbound email at owner_inbound mailbox
  │
  0. IF attachment is Source-A full-fleet signature → IGNORE mailbox scope, route by content (existing path).
  │
  1. SELECT direction_id FROM direction_owner_bindings
     WHERE inbound_mailbox = :from AND status='active';      -- partial-unique → 0 or 1
       0 → quarantine (unknown_sender)
       1 → candidate scope = that direction (+ recently-completed grace window, M2, for FORWARD only)
  │
  2. Parse attachment; compute ingested_files.content_sha256 (D6 idempotency).
  3. event_key dedup (D6/D9) — UNCHANGED. Mailbox scope does NOT bypass this.
  4. Normalize wagon numbers (CHAR(8), D2); per-wagon match to active direction(s).
     A wagon not in scope → per-wagon quarantine (NOT whole-file misroute).
  5. UPSERT wagon_movements (NO direction_id — R1). Match → deals; set deals.direction_id at match time.
  6. Forward to direction_client_bindings.forward_to_email; idempotent on (content_sha256, direction_id),
     committed in the same transaction as the movement write (corrects H3 dup/lost forward).
```

---

## 7. Index Summary

| Table | Index | Type | Purpose |
|---|---|---|---|
| `source_documents` | `content_sha256` | UNIQUE | Re-upload idempotency (D6) |
| `direction_owner_bindings` | `inbound_mailbox` | B-tree | Hot path: email → candidate scope |
| `direction_owner_bindings` | `inbound_mailbox WHERE active` | partial UNIQUE | One live mailbox → one live direction (M1) |
| `directions` | `(station_origin_esr, station_dest_esr)` | B-tree | Route lookup / dup check |
| `directions` | `status`, `order_id` | B-tree | Grid filter; order rollup |
| `deals` | `direction_id` | B-tree | KPI aggregation at trip grain (R1) |
| `ingested_files` | `direction_id` | B-tree | P3 scope rollup |
| `invoices` | `invoice_number` | UNIQUE | Human ref dedup |
| `invoice_lines` | `report_row_id` | UNIQUE | A report row invoiced at most once |
| `invoice_lines` | `direction_id` | B-tree | Per-direction invoiced/paid rollup |
| `payments` | `invoice_id` | B-tree | Payment rollup |

---

## 8. Revised Phase Plan (absorbing the product layer)

Locked phases preserved; the product layer slots in additively. Schema for a table is created at the phase where it first carries behavior — **not** front-loaded into P0 (which would falsely claim it as locked-P0 scaffold).

| Phase | Adds (product layer) | Tables created / altered | Locked phase preserved |
|-------|----------------------|--------------------------|------------------------|
| **P0** | Two-tab dashboard shell: **"Актуальные направления"** (empty grid) + **"Отчётность"** (empty PV table). No product tables. | — (only the locked P0 canonical scaffold from `MVP_PLAN.md`) | P0 auth + shell + canonical schema, unchanged |
| **P1.5** | **Order→Direction CRUD replaces "manual deal CRUD"**: manual Direction form (route, wagon count, cargo, tonnage, rate_client, rate_owner, client, owner) — rates/client operator-entered (D16). Historical ПВ import links deals to directions (`direction_match_method='historical_import'`). Tab 1 grid + Tab 2 PV table populate; drill-in margin from imported history. | CREATE `directions`; ALTER `deals` ADD `direction_id`,`direction_match_method`. (`orders` MAY be scaffolded empty here, no UI.) | P1.5 historical import + xlsx export, preserved |
| **P2** | Manual upload UI binds each uploaded file to a Direction at intake (sets `ingested_files.direction_id` manually) — minimal correct routing before mailbox automation. | ALTER `ingested_files` ADD `direction_id` (may land here for the manual bind). | P2 worker + ARQ + Redis + first parser + pub/sub envelope, preserved |
| **P3** | **doc:** — / **email-routing lands here:** owner/client mailbox binding UI (n8n nodes); Gmail inbound scoped by `inbound_mailbox` → candidate direction → `event_key` dedup + `(wagon,waybill)` match (R4) → **auto-forward to client** (`direction_client_bindings`). Sender-match only; **defer dedicated-alias MX and wagon-intersection scoring** (new infra, post-MVP fallback). Live per-direction отгружено/заработано. | CREATE `direction_owner_bindings`, `direction_client_bindings` + partial-unique mailbox index. | P3 normalization + all 4 parsers + lifecycle + cross-row turnover, preserved |
| **P4** | **payments / оплачено land here:** invoice + payment CRUD; per-direction оплачено via `invoice_lines` allocation (R5). VAT reconciliation resolved (G4) before UI ships. Auto-regenerate monthly xlsx (versioned). lump_sum emit branch (M4). | CREATE `invoices`, `invoice_lines`, `payments`. | P4 deal matching + auto-report xlsx, preserved |
| **P5** | **doc-extraction lands here:** drag-drop ПСЦ+ЗАЯВКА → worker LLM extraction (Claude tool-use, prompt caching, once per file — D10) → `extracted_prices` → operator confirms a line → spawns/pre-fills Direction. Money fields never auto-accepted (H1/D16). | CREATE `source_documents`, `extracted_prices`; ALTER `directions` add FK `seeded_from_extracted_price_id`; populate `orders`. | Replaces locked P5 "email AI" (folded into P3); LLM now does higher-value Order extraction |
| **P6** | SSE realtime card updates, push, hardening (RLS/RBAC, Sentry, PgBouncer). Optionally materialize `direction_kpis`. | — | P6 realtime + push + hardening, preserved |

### Open flags (require operator confirmation, do not block P0–P4)
- **ПСЦ meaning** ("Протокол согласования цены") — affects only the P5 LLM prompt + `source_doc_type` label. Confirm before P5.
- **VAT inclusivity of ПСЦ rates (G4)** — must resolve before P4 invoice UI so `amount_billed_net` reconciles to `Σ revenue_ua`.
- **Invoice billing grain (R5)** — confirmed as client+period; verify РНС actually consolidates per client before building P4 AR UI.
- **`от компании` = "Приоритет Логистика"** — stays a config constant on the report (existing `deals.company_raw` default), never a user-editable Direction field.

---

## 9. RECONCILIATION v2 — grounded by real ПСЦ + ЗАЯВКА fixtures

> Added after the workflow, once two real documents were provided:
> `docs/planning/examples/order-zayavka-cem1.md` and `docs/planning/examples/psc-vektor-rns.md`.
> **This section overrides §1–§8 where they conflict.** The agents above worked from assumptions;
> these are now facts.

### 9.1 Open flags now RESOLVED (no longer open questions)
- **ПСЦ = «Протокол согласования договорной цены»** — CONFIRMED. `source_doc_type` label is correct.
- **VAT** — CONFIRMED: real ПСЦ rates are **`в т.ч. НДС 22%`** (VAT-inclusive, 22%) and **per wagon**. Real ЗАЯВКА rate likewise `41000 руб/вагон с НДС`. So `rate_basis` default = `per_wagon`, `vat_inclusive` default = `yes`, `vat_rate` default = `22.00`. Still store explicitly — never assume — but the unknown branch is now the exception, not the norm.
- **ПСЦ side (cost vs revenue) is AUTO-DERIVED, not asked:** if РНС is **ЗАКАЗЧИК** → owner/COST ПСЦ (counterparty = wagon owner → `Сумма от Поставщика`); if РНС is **ИСПОЛНИТЕЛЬ** → client/REVENUE ПСЦ (counterparty = client → `Сумма УА`). The extractor reads both party roles and sets `psc_side` deterministically.

### 9.2 STRUCTURAL CORRECTION — a ПСЦ is a versioned ROUTE-KEYED RATE TABLE, not a scalar
The real ПСЦ holds **N rate lines**, each keyed by `(origin_station, dest_station, wagon_type) → rate/wagon`,
issued as an **Приложение to a parent Договор**, and **superseded by a new приложение** when rates change
(п.4). Therefore `directions.rate_owner` / `rate_client` are **resolved snapshots** (a cached lookup of the
applicable protocol rate at trip time), NOT the source of truth. Add a price-book the directions resolve against:

```typescript
// src/db/schema/pricing.ts
export const pscSide = pgEnum("psc_side", ["owner_cost", "client_revenue"]);

// parent Договор with a counterparty (client OR owner)
export const counterpartyContracts = pgTable("counterparty_contracts", {
  id:             uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  contractRef:    text("contract_ref").notNull(),          // "ТЭО/04-26/07", "№2 от 11.11.2025"
  counterpartyId: uuid("counterparty_id").notNull().references(() => counterparties.id),
  signedOn:       timestamp("signed_on", { withTimezone: true }),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({ refIdx: index("idx_contracts_ref").on(t.contractRef) }));

// ПСЦ header — one protocol, versioned via приложение
export const priceProtocols = pgTable("price_protocols", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  protocolNumber: text("protocol_number"),                 // "ПРОТОКОЛ № 1"
  contractId:    uuid("contract_id").references(() => counterpartyContracts.id, { onDelete: "set null" }),
  counterpartyId: uuid("counterparty_id").notNull().references(() => counterparties.id),
  side:          pscSide("side").notNull(),                // derived from РНС role (9.1)
  protocolDate:  timestamp("protocol_date", { withTimezone: true }),
  vatInclusive:  text("vat_inclusive").notNull().default("yes"),   // yes|no|unknown
  vatRate:       numeric("vat_rate", { precision: 5, scale: 2 }).default(sql`22.00`),
  validFrom:     timestamp("valid_from", { withTimezone: true }),
  supersededBy:  uuid("superseded_by"),                    // self-FK → newer приложение
  sourceDocumentId: uuid("source_document_id"),            // FK → source_documents (P5)
  status:        text("status").notNull().default("active"), // active|superseded
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({ cpIdx: index("idx_psc_counterparty").on(t.counterpartyId, t.side) }));

// the rate lines — the actual price book
export const priceProtocolRates = pgTable("price_protocol_rates", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  protocolId:    uuid("protocol_id").notNull().references(() => priceProtocols.id, { onDelete: "cascade" }),
  originEsr:     char("origin_esr", { length: 6 }).references(() => stations.esrCode, { onDelete: "set null" }),
  destEsr:       char("dest_esr",   { length: 6 }).references(() => stations.esrCode, { onDelete: "set null" }),
  originRaw:     text("origin_raw").notNull(),             // "ДОБРЯТИНО" (ПСЦ has bare names, no ESR)
  destRaw:       text("dest_raw").notNull(),               // "НОГИНСК"
  wagonType:     text("wagon_type").notNull(),             // "Полувагон"
  rate:          numeric("rate", { precision: 14, scale: 2 }).notNull(),  // 19000
  currency:      char("currency", { length: 3 }).notNull().default("RUB"),
  rateBasis:     text("rate_basis").notNull().default("per_wagon"),
  vatInclusive:  text("vat_inclusive").notNull().default("yes"),
}, (t) => ({ routeIdx: index("idx_psc_rate_route").on(t.protocolId, t.originRaw, t.destRaw, t.wagonType) }));
```

**Resolution rule:** a Direction's `rate_owner` = lookup in the active owner-side `price_protocol_rates`
matching `(origin, dest, wagon_type)` valid at the trip's cargo-acceptance date (ПСЦ п.3). `rate_client` =
same against the client-side protocol, OR taken directly from the ЗАЯВКА (which carries the client rate). The
resolved value is snapshotted onto the deal at match time so a later ПСЦ revision never silently rewrites
closed margin (honors D17/D8 immutability). `directions.rate_*` columns stay as the snapshot cache.

> NOTE: ПСЦ rate lines use **bare station names** (no ESR) → resolved via the station dictionary (D15);
> ЗАЯВКА carries inline ESR (`(02220)`) → seeds the dictionary directly. Watch homonym stations.

### 9.3 `orders` / `directions` field additions (from real ЗАЯВКА)
ALTER `orders` ADD: `parent_contract_id` (FK → counterparty_contracts), `transport_kind`
(export|import|transit|domestic), `plan_kind` (main|additional|on_availability), `period_month` (date,
e.g. 2026-06-01), `gu12_number` (RZD form, NOT commercial). ALTER `directions` ADD: `wagon_type`,
`cargo_etsng_code`, `shipper_counterparty_id`, `consignee_counterparty_id` (≠ client — D16),
`rate_basis` already present, `vat_inclusive`, `vat_rate`.

### 9.4 Phase-plan touch-up
- Tables `counterparty_contracts`, `price_protocols`, `price_protocol_rates` are CREATED in **P1.5** (operator can enter a ПСЦ rate table by hand and have directions resolve against it) and POPULATED automatically by the **P5** drag-drop extractor. The `extracted_prices` table (§3) becomes the staging buffer that, on operator confirm, writes rows into `price_protocol_rates`.
- Drop the two resolved flags from §8 "Open flags". Remaining real open question: **does РНС consolidate invoices per client+period** (R5) — still verify before P4 AR UI.
