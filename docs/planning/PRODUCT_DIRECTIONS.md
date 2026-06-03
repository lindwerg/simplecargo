# PRODUCT_DIRECTIONS.md — Order → Direction Product Layer

> **Status:** Definitive product spec for the Order/Direction layer that sits **above** the locked
> canonical entities (`Wagon`, `WagonMovement`, `Deal`, `Station`, `Counterparty`, `ReportRow`,
> `ingested_files`, `quarantine_rows`).
>
> **Relationship to the locked plan:** This document is **additive**. It introduces new tables and
> new UI; it does **not** alter any locked invariant in `MVP_PLAN.md` (D1–D18), `DOMAIN_MODEL.md`,
> `DB_SCHEMA.md`, or `INGESTION_PIPELINE.md`. Where the four upstream design drafts disagreed with
> each other or with the locked physics, this spec **resolves the conflict definitively** and records
> the decision in §9 (ADRs) so the schema is buildable in one pass.
>
> **Source of truth:** `MVP_PLAN.md` D1–D18 wins over anything here. All locked formulas
> (Маржа = Сумма УА − Сумма от Поставщика; оборот = cross-row cycle; `(wagon, waybill)` + date-window
> matching; source precedence A>C>B>D; `event_key` cross-source dedup; SHA-256 file idempotency;
> CLOSED+priced deals frozen; `Клиент` never auto-filled — D16) are preserved verbatim.

---

## 0. Vocabulary & Core Model (read this first)

| Term | RU | What it is | Grain |
|---|---|---|---|
| **Order** | Заявка | Transient intake record. Holds the dropped ПСЦ + Заявка files and the raw LLM extraction before the operator confirms. Spawns one or more Directions. | One per order document set |
| **Direction** | Направление | The operator-facing operational hub: one route + client + owner-binding(s) + mailbox bindings + a rate card. Accumulates Deals. **The unit of Tab-1 cards.** | One per route-agreement |
| **Deal** *(locked, extended)* | Сделка | One wagon **trip** + its commercial record. **The unit of margin.** Keyed `(wagon, waybill)` + date window. A wagon does many Deals over its life. | One per wagon trip |
| **WagonMovement** *(locked, unchanged)* | — | Time-series operation row. **Never carries `direction_id`.** | One per operation |

> ### THE LOAD-BEARING DECISION (resolves CRITIC-correctness C1)
> **`direction_id` lives ONLY on `deals` (trip grain). It is NEVER placed on `wagons` or
> `wagon_movements`.**
>
> A physical wagon `52001234` runs Direction A this week and Direction B next week. The wagon is not
> owned by a direction — a **trip** is. Turnover (D1, `next_loading − this_loading`) is a **pure
> per-wagon cross-trip** computation that deliberately spans the boundary between two directions and
> must stay independent of direction. Stamping `direction_id` at movement grain would (a) attribute
> trip N+1's movements to trip N's direction, and (b) make the cross-row turnover cycle ambiguous.
> The worker resolves `direction → deal` at **match time** (locked pipeline Stage 5), not at
> movement-insert time.

```
Order (Заявка + ПСЦ)              ← LLM extraction lane (P5)
  │  1 : N  (one ПСЦ → many rate lines → many Directions; ADR-D2)
  ▼
Direction (Направление)           ← operator-facing hub, Tab-1 card
  │  1 : N owner bindings (split wagon lots; each may override owner rate)
  │  1 : N client bindings (usually 1; CC list supported)
  │  1 : N mailbox bindings (inbound owner / outbound client)
  │
  │  1 : N
  ▼
Deal (Сделка)  ── direction_id (nullable FK) ──┐   ← THE ONLY place direction_id lives
  │  1 : 1                                       │
  ▼                                              │
ReportRow (emits when revenue+cost present)      │
                                                 │
WagonMovement (time-series) ── wagon_id ─────────┘   ← NO direction_id (C1)
       │  turnover = cross-row per-wagon cycle (D1), direction-independent

Invoice (client, period-scoped) ──< InvoiceLine >── ReportRow   (ADR-D5)
       │  1 : N
       ▼
Payment (receipt)
```

---

## 1. Order (Заявка) & Direction (Направление) — Entities & Lifecycle

### 1.1 `orders` (Заявка)

Transient intake record. Created when the operator drops documents (P5) **or** manually starts a
direction (P1.5 — order optional). Holds raw extraction state; once the operator confirms, the
Direction(s) are authoritative.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `order_number` | text | nullable | Human ref, operator-assigned or generated |
| `status` | enum | `draft`→`pending_review`→`confirmed`→`active`→`completed`/`cancelled` | |
| `client_id` | uuid | FK→counterparties, **nullable** | D16: never auto-written; suggested only (§9 ADR-D3) |
| `psc_file_id` | uuid | FK→source_documents, nullable | ПСЦ document |
| `order_file_id` | uuid | FK→source_documents, nullable | Заявка document |
| `created_by` | uuid | FK→users, NOT NULL | |
| `confirmed_at` / `confirmed_by` | timestamptz / uuid | nullable | |
| `created_at` / `updated_at` | timestamptz | NOT NULL default now() | |

**Cardinality (resolves CRITIC-correctness H2):** **Order 1 → N Direction.** A single ПСЦ frequently
carries multiple route/rate lines; each line the operator chooses to activate spawns its own
Direction. The "1:1 archive-on-confirm" model from the `order-direction` draft is **rejected** — it
loses the multi-rate ПСЦ case.

### 1.2 `directions` (Направление)

The operational hub. One Direction = one route + client + owner-binding(s) + mailbox bindings + rate
card. This is the Tab-1 card.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | uuid | PK | |
| `order_id` | uuid | FK→orders, **NULLABLE** | NULL for manually-created and historical-import directions (resolves CRITIC-consistency M3; reconciles the schema-delta NOT NULL contradiction) |
| `display_name` | text | nullable | e.g. "Асбест → Голышманово / Июнь 2025" |
| `status` | enum | `draft`→`open`→`active`→`closed` / `suspended` | See §1.3 |
| `status_changed_at` / `status_changed_by` | timestamptz / uuid | NOT NULL | Audit |
| `origin_station_id` | uuid | FK→stations, nullable | ESR resolved downstream (D15) |
| `destination_station_id` | uuid | FK→stations, nullable | |
| `origin_raw` / `destination_raw` | text | nullable | Preserved when ESR unresolved |
| `cargo` | text | nullable | |
| `tonnage_per_wagon` | numeric(10,3) | nullable | |
| `wagons_planned` | integer | nullable | From Order/ПСЦ |
| `client_counterparty_id` | uuid | FK→counterparties, **NULLABLE** | **D16: operator-confirmed only, never auto-written** |
| `client_rate` | numeric(14,2) | **NULLABLE** | Ставка клиента (operator-confirmed). Nullable so historical-import directions whose rate lives in imported ReportRows are representable (M3) |
| `client_rate_suggested` | numeric(14,2) | nullable | LLM value, **kept separate** from confirmed `client_rate` (resolves CRITIC-correctness H1) |
| `owner_rate` | numeric(14,2) | **NULLABLE** | Ставка собственника (default; per-owner override in binding) |
| `owner_rate_suggested` | numeric(14,2) | nullable | LLM value, separate |
| `rate_unit` | enum | `per_wagon`/`per_tonne`/`per_trip`/`lump_sum` | |
| `rate_model` | enum | `per_wagon_trip` / `lump_sum` | Controls ReportRow emission (ADR-D6) |
| `currency` | char(3) | default 'RUB' | |
| `payment_terms_raw` | text | nullable | |
| `valid_from` / `valid_to` | date | nullable | Rate validity window |
| `is_synthetic` | boolean | NOT NULL default false | TRUE = historical-aggregation direction with no Order/mailbox/ПСЦ (M3) |
| `created_by` | uuid | FK→users, NOT NULL | |
| `created_at` / `updated_at` | timestamptz | NOT NULL | |

**No denormalized rollup counters in MVP.** The `order-direction` draft's `wagons_loaded` /
`earned_margin_total` columns are **deferred to P6** (premature optimization — YAGNI). All Tab-1
numbers are derived live from a view (§4.6) until volume proves a counter is needed.

**Indexes:** `(status)`, `(client_counterparty_id)`, `(origin_station_id, destination_station_id)`,
`(order_id)`, `(created_at DESC)`.

### 1.3 Direction lifecycle state machine

```
   DRAFT ── operator wires docs/route/rate, not yet bound ──┐
     │  (rates may be NULL here)                            │
     │  operator binds owner mailbox + client email         │
     ▼                                                       │
   OPEN  (configured; mailbox bound; wagons not yet moving)  │
     │  ACTIVATION GUARD (see below) must pass to leave OPEN │
     │  first dislocation matched via owner mailbox          │
     ▼                                                       │
  ACTIVE (wagons moving; deals accumulating; rows emitting) ◄┘ reactivate
     │                                                       ▲
     │  all wagons_planned completed OR operator closes      │
     ▼                                            suspend ───┘
  CLOSED (read-only for margin; forwarding grace window — M2)
     │
  SUSPENDED (paused: no forwarding, no new matching)
```

**ACTIVATION GUARD (OPEN → ACTIVE prerequisites — folds CRITIC fixes H1, M1, C3):**
A direction **cannot** activate until all of:
1. `client_counterparty_id` is set (operator-confirmed, D16).
2. `client_rate` and `owner_rate` are both operator-confirmed (not just `*_suggested`).
3. **Sanity check passes:** `client_rate > owner_rate` (per unit). A non-positive planned margin
   blocks activation with a hard warning (catches LLM rate-swap, H1).
4. At least one active owner mailbox binding **and** one active client forward binding exist.
5. If the bound owner mailbox is shared with another `open`/`active` direction, a wagon→direction
   discriminator (`expected_wagon_ids` or per-wagon assignment) is populated (C3).

**Late dislocation after CLOSED (resolves CRITIC-correctness M2):** Forwarding eligibility is
**separate** from deal-mutation eligibility. A straggler dislocation arriving at a bound mailbox after
the direction is `closed` is **still forwarded to the client** during a grace window
(`valid_to + 60 days`, configurable), even though the matched Deal is frozen for margin (locked: late
movements log as anomaly only). Resolution must therefore consider `status IN ('open','active')`
**plus** recently-closed directions within the forwarding grace window.

---

## 2. Drag-Drop ПСЦ / Заявка Price-Extraction Lane (P5)

> **Phase gate (resolves CRITIC-consistency G3):** This lane is **P5**. It is specified at full
> fidelity here but **must not be built before P5**. P0–P4 ship without it. The locked plan introduces
> the worker at P2 and the LLM at P5; LLM runs **once per file, never per row** (D10).

### 2.1 Two ingestion lanes (must not be conflated)

| Dimension | **Lane A — Doc Extraction (P5, THIS §)** | **Lane B — Email Dislocation (P3, §3)** |
|---|---|---|
| Trigger | Operator drag-drop ПСЦ/Заявка | Inbound dislocation email |
| Output | `directions.*_rate_suggested`, route, cargo, plan | `wagon_movements` → `deals` → `report_rows` |
| Idempotency | SHA-256 of file (`source_documents.content_hash`) | SHA-256 of attachment (`ingested_files.sha256`, locked) |
| LLM | Structured extraction (tool-use), once per file | None for known formats; quarantine for unknown |
| Direction link | `source_documents.order_id` → directions (operator-set) | mailbox → direction (routing, §3) |

The two lanes are additive: Lane A fills the **price/config side**, Lane B fills the
**operational/movement side**. The report joins both.

### 2.2 Pipeline

```
1. Browser: operator drags ПСЦ + Заявка onto a Direction/New-Direction drop zone.
   Client computes SHA-256 (SubtleCrypto) before upload.
2. Next.js API: re-validate MIME (python-magic on worker side), recompute SHA-256 (integrity),
   idempotency check on source_documents.content_hash, write to StorageAdapter
   (/uploads/{order_id}/{doc_type}/{sha256}.{ext} — Railway volume now, S3/R2 swap later; ADR-D8),
   INSERT source_documents (status=pending), enqueue ARQ extract_doc_task.
3. ARQ worker extract_doc_task:
   - text extraction: PDF→pdfplumber (if char_count<50 → vision path); DOCX→python-docx;
     XLSX→openpyxl; image→vision path.
   - Claude tool-use call (claude-sonnet model, prompt caching on stable system+tool schema).
   - rule-based confidence scoring (station-dict hit, INN-in-counterparties, numeric-parse).
   - write extracted_prices rows (1 doc → N price lines, ADR-D2); status needs_review/auto_accept.
   - Redis pub/sub: { channel: doc_extracted, order_id, status, confidence }.
4. Next.js SSE → operator confirm/correct UI (§7.3).
5. Operator confirms → directions created/updated; rates land in *_suggested first, then promoted
   to confirmed only on explicit operator keystroke (H1).
```

### 2.3 Extraction confidence → UI treatment

| `overall_confidence` | Status | Non-money fields | **Money fields (rate, currency, VAT, unit)** |
|---|---|---|---|
| ≥ 0.85 | auto-accept *(non-money only)* | Green, single "Confirm" | **Never auto-accepted — always require keystroke (H1)** |
| 0.60–0.84 | needs_review | Yellow, tab-through | Always explicit confirm |
| < 0.60 | low_confidence | Red, re-enter | Always explicit confirm |

> **CRITICAL RULE (resolves CRITIC-correctness H1):** Monetary fields (`client_rate`, `owner_rate`,
> `currency`, VAT basis, `rate_unit`) are **never** auto-accepted at any confidence. Confidence gates
> only non-money fields (route, cargo, wagon count). The LLM value is stored in `*_rate_suggested`;
> the operator must press a key to promote it to the confirmed `*_rate`. This honors the locked rule
> that prices are operator-entered and operator override always wins. The UI also flags
> `client_rate ≤ owner_rate` (negative margin) before allowing activation.

### 2.4 Extraction tables (scaffold only until P5 — YAGNI; do **not** create earlier)

`source_documents` (file + extraction state, SHA-256 unique), `extracted_prices` (1 doc → N price
lines; raw + resolved station/counterparty FKs; `confirmed_by_operator`). Full Drizzle/SQL lives in
`schema-delta` and is reproduced in `DB_SCHEMA.md` at the P5 migration, not before.

### 2.5 LLM extraction contract (worker → `extracted_prices`)

```jsonc
{
  "extraction_version": "1.0",
  "doc_type_detected": "psc" | "zayavka" | "unknown",
  "confidence": 0.91,
  "route":  { "origin_raw": "Асбест", "origin_esr": null, "destination_raw": "Голышманово", "destination_esr": null },
  "cargo":  { "name": "щебень", "code_etsnv": null },
  "wagons_planned": 30,
  "tonnage_per_wagon": 68.5,
  "client": { "name": "ООО ...", "inn": "...", "rate": 2800.00, "rate_unit": "per_wagon", "currency": "RUB", "payment_terms": "30 дней" },
  "owner":  { "name": "ООО ...", "inn": "...", "rate": 1900.00, "rate_unit": "per_wagon", "currency": "RUB" },
  "validity": { "valid_from": "2025-06-01", "valid_to": "2025-08-31" },
  "rates": [ /* one block per route line; 1 ПСЦ → N → N candidate Directions */ ],
  "unresolved_fields": [...],
  "conflicts": [...]      // e.g. rate in ПСЦ ≠ rate in Заявка → operator chooses
}
```
Stations are extracted **as written** and normalized downstream against the ESR dictionary (D15 — no
invented ESR/road codes). VAT must be resolved before P5 ships (§9 ADR-D4).

---

## 3. n8n-Style Per-Direction Email Routing (P3)

> **Phase gate (resolves CRITIC-consistency G3):** Ships in **P3**. MVP ships **sender-match only**.
> Dedicated-alias MX (`inbound.rns.app` catch-all) and wagon-intersection scoring are **deferred to
> post-MVP** — both are new infra not in the locked plan and are quarantine fallbacks today.

### 3.1 The binding model

A Direction wires three "nodes" (the n8n feel): an **owner** (provides wagons) bound to a **source
mailbox** (where that owner's dislocations arrive), and a **client** bound to a **forward email**.

`direction_owner_bindings` (1 direction → N owners — supports split wagon lots):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `direction_id` | uuid FK→directions | |
| `owner_id` | uuid FK→counterparties | |
| `inbound_mailbox` | text NOT NULL | **PRIMARY routing key** (sender address, normalized lowercase) |
| `expected_wagon_ids` | text[] | wagon→direction discriminator; **required** before activation when mailbox is shared (C3) |
| `wagon_count_allocated` | integer | nullable |
| `owner_rate_override` | numeric(14,2) | nullable; per-owner rate |
| `status` | enum active/inactive | |

`direction_client_bindings` (forward target):

| Column | Type | Notes |
|---|---|---|
| `direction_id` | uuid FK→directions | |
| `client_id` | uuid FK→counterparties | |
| `forward_to_email` | text NOT NULL | |
| `forward_cc_emails` | text[] | optional CC |
| `forward_subject_tmpl` | text | default `Дислокация {direction_name} от {date}` |
| `status` | enum active/inactive | |

**Mailbox uniqueness (resolves CRITIC-consistency M1):** the schema-delta `(direction_id, mailbox)`
unique index does **not** prevent the same mailbox on two directions. Add the correct constraint:

```sql
CREATE UNIQUE INDEX dir_owner_mailbox_active_unique
  ON direction_owner_bindings (inbound_mailbox)
  WHERE status = 'active'
    AND direction_id IN (SELECT id FROM directions WHERE status IN ('open','active'));
-- Enforced in app layer too (cross-table partial index limits): block activation if mailbox already
-- bound to another open/active direction WITHOUT a wagon→direction discriminator.
```
A shared mailbox across directions is **allowed** only when each binding carries `expected_wagon_ids`
(or per-wagon assignment), so the fan-out splitter (§3.3) can route per wagon.

### 3.2 Resolution priority chain

```
INBOUND EMAIL (attachment = dislocation)
  │
  ▼  PRIORITY 0 — SOURCE-A GUARD (resolves CRITIC-correctness C2)
  │  If attachment matches the Source-A full-fleet-export content signature
  │  → IGNORE mailbox scope. Route by CONTENT through the locked pipeline.
  │  A full export spans ALL directions; mailbox-routing it would leak a
  │  competitor's fleet to one client (C4) or double-count vs Source C (D9).
  │
  ▼  PRIORITY 1 — Sender match (MVP)        [alias match deferred post-MVP]
  │  SELECT bindings WHERE inbound_mailbox = :from
  │    AND direction.status IN ('open','active', <closed within grace window — M2>)
  │  count = 1 → resolved scope = that direction
  │  count = 0 → QUARANTINE (unknown_sender)
  │  count > 1 → PRIORITY 2
  │
  ▼  PRIORITY 2 — Per-wagon fan-out split (resolves CRITIC-correctness C3) [post-MVP]
     Parse attachment, extract wagon set W.
     For EACH wagon w in W: assign to the unique active direction whose
       expected_wagon_ids ∋ w  (or wagon→direction assignment).
     - every wagon resolves → SPLIT the file per direction, fan out forwards.
     - a wagon resolves to 0 or >1 directions → that WAGON goes to
       per-wagon quarantine (NOT the whole file; never silently drop — C3).
     Hard invariant: every inbound wagon resolves to exactly one active
     direction or is individually quarantined.
```

> **Mailbox is a SCOPING FILTER, not a substitute for matching (C2).** After resolution, every
> dislocation **still** passes through the locked `event_key` cross-source dedup (D9) and the
> `(wagon, waybill)` + date-window deal matcher. Mailbox routing narrows the candidate scope; it never
> replaces the matcher. This is the single highest-leverage correctness fix.

### 3.3 Process + forward (idempotency — resolves CRITIC-correctness H3)

```
1. ingest attachment → ingested_files (SHA-256, locked idempotency D6); set ingested_files.direction_id
   (the promoted sender_email→direction routing key, ADR-2002) for non-Source-A files.
2. parse → event_key dedup (D9) → (wagon, waybill) match → upsert wagon_movements
   → resolve direction→deal at MATCH time (deal.direction_id set here, never on movements — C1).
3. FORWARD IDEMPOTENCY anchored on (content_sha256, direction_id) — NOT RFC Message-ID.
   Message-ID is optional/forgeable; SHA-256 is the locked proven key. The same physical attachment
   to the same direction forwards EXACTLY ONCE.
4. Outbox pattern: forward state is a column transition (forward_status: pending→sent) set in the
   SAME DB transaction as the movement write. Forward send happens only AFTER movements commit;
   at-least-once send + receiver-visible idempotency header guarantees no duplicate/no-loss to client.
```

`email_routing_log` records `(content_sha256, direction_id, resolution_method, from_address,
received_at, forward_status, forwarded_at, wagon_numbers_found)`. Quarantine reuses the locked
`quarantine_rows` model extended with reason `unknown_sender` / `ambiguous_direction` /
`parse_error` / `attachment_missing`, and is **per-wagon** when a fan-out split partially resolves.

### 3.4 Routing rules table

| Rule | Trigger | Condition | Action |
|---|---|---|---|
| R-0 | Any inbound | Source-A signature | Route by content; ignore mailbox (C2) |
| R-1 | Inbound at mailbox | From matches exactly 1 active binding | Dispatch scoped to that direction |
| R-2 | Inbound at mailbox | From matches 0 | Quarantine `unknown_sender` |
| R-3 | Inbound at mailbox | From matches >1 | Per-wagon fan-out split (post-MVP); else quarantine `ambiguous_direction` |
| R-4 | Inbound | No/unparseable attachment | Quarantine `attachment_missing`/`parse_error` |
| R-5 | Duplicate `(sha256, direction_id)` | Already forwarded | `forward_status=deduped`; no re-forward (H3) |
| R-6 | Direction closed, within grace | Straggler dislocation | Forward to client; do NOT mutate frozen deal (M2) |
| R-7 | Operator resolves quarantine | Assigns direction | Re-trigger scoped parse+forward |

---

## 4. Per-Direction Finance Metrics + Invoice/Payment Model

### 4.1 Card-face metrics (Tab-1, no drill-in)

| Metric | RU | Formula | Source |
|---|---|---|---|
| Shipped wagons | Отгружено | `COUNT(DISTINCT d.wagon_id) WHERE d.direction_id=? AND has loading movement` | deals → wagon_movements |
| In transit | В пути | `COUNT(DISTINCT d.wagon_id) WHERE d.direction_id=? AND d.status='in_transit'` | deals |
| Completed | Выполнено | `COUNT(DISTINCT d.wagon_id) WHERE d.direction_id=? AND d.status='completed'` | deals |
| Earned margin | Заработано | `SUM(rr.revenue_ua − rr.cost_owner)` over direction's ReportRows | report_rows (locked formula D17) |
| Invoiced | Выставлено | `SUM(allocation)` of non-cancelled invoice lines for direction | invoice_lines (§4.4) |
| Paid | Оплачено | `SUM(payment × allocation_ratio)` for direction | payments + invoice_lines (§4.4) |
| Receivable | Дебиторка | Invoiced − Paid (client-side, see H4 note) | derived |
| Completion % | Выполнение | `completed / wagons_planned × 100` | deals + directions |

> **`wagons_shipped` is counted through `deals` (CRITIC-correctness C1), NOT through
> `wagon_movements.direction_id`.** The `finance-rollups` §4 and `schema-delta` view both counted via
> `wagon_movements.direction_id` — both are **wrong** and are corrected here. There is no
> `wagon_movements.direction_id` column.

### 4.2 Drill-in metrics

**Block A — Отгружено:** loaded / in-transit / delivered counts; remaining vs plan; tonnage shipped.
**Block B — Заработано** (reconciles exactly with locked D17, same `report_rows` slice as Tab 2):
- Выручка (УА) = `SUM(rr.revenue_ua)`; Затраты = `SUM(rr.cost_owner)`;
  **Маржа (факт) = `SUM(rr.revenue_ua − rr.cost_owner)`** (identical to TAB-2, no separate computation);
- Маржа (план) = `wagons_planned × (client_rate − owner_rate)` for `per_wagon` rate model;
- Сделок с данными = `COUNT(rr WHERE revenue_ua>0 AND cost_owner>0)` (locked emit rule);
- Ожидают стоимости = `COUNT(deals WHERE cost_owner IS NULL)`.
**Block C — Оплачено** (§4.4). **Block D — Per-wagon table** with оборот,сут shown as the locked
**cross-row** value (`turnover_days`, `turnover_provisional` excluded from averages — D1).

### 4.3 Invoices & Payments — grain decision (resolves CRITIC-correctness H4)

> **DECISION: invoice grain = client + period, NOT direction.** A client Счёт-фактура is monthly and
> routinely covers **multiple directions**. A `direction_id NOT NULL` on `invoices` (as in
> `schema-delta`/`finance-rollups`) makes a multi-direction invoice unrepresentable and forces the
> operator to split arbitrarily. We therefore use an **allocation junction**.

### 4.4 Tables

`invoices` (client+period scoped — **no `direction_id`**):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `invoice_number` | text UNIQUE | СФ-2025-0042 |
| `client_id` | uuid FK→counterparties | who is billed |
| `invoice_date`, `period_from`, `period_to`, `due_date` | date | |
| `amount_billed`, `amount_vat`, `amount_billed_net` | numeric(15,2) | `net = billed − vat`; **`net` must reconcile to `revenue_ua`** of covered rows (ADR-D4) |
| `vat_rate` | numeric(5,2) | nullable |
| `status` | enum | draft/issued/partially_paid/paid/overdue/cancelled |
| `created_by`, timestamps | | |

`invoice_lines` (allocation — the junction that makes per-direction paid derivable):

| Column | Type | Notes |
|---|---|---|
| `invoice_id` | uuid FK→invoices | |
| `report_row_id` | uuid FK→report_rows | the trip being billed |
| `direction_id` | uuid FK→directions | derived from the row's deal; denormalized for fast rollup |
| `amount` | numeric(15,2) | allocated client-revenue portion (net) for this row |

`payments` (receipt against an invoice):

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `invoice_id` | uuid FK→invoices | |
| `payment_date` | date | bank value date |
| `amount`, `amount_net` | numeric(15,2) | |
| `payment_reference` | text | |
| `status` | enum pending/confirmed/failed | |

**Per-direction paid (H4 fix):**
```sql
-- paid for a direction = invoice payments distributed by that direction's allocation share
SELECT SUM(p.amount_net * (il_dir.amt / il_tot.amt)) AS paid_net
FROM payments p
JOIN (SELECT invoice_id, SUM(amount) amt FROM invoice_lines WHERE direction_id=:dir GROUP BY invoice_id) il_dir
  ON il_dir.invoice_id = p.invoice_id
JOIN (SELECT invoice_id, SUM(amount) amt FROM invoice_lines GROUP BY invoice_id) il_tot
  ON il_tot.invoice_id = p.invoice_id
WHERE p.status='confirmed';
```

### 4.5 Unbilled earned margin (corrected — resolves CRITIC-correctness H4)

The `finance-rollups` §5 compared `earned_margin − invoiced_net`, mixing margin (net of cost) against
client-revenue invoices — **wrong**. Corrected: unbilled is a **client-revenue** comparison.
```sql
unbilled_revenue =
  SUM(rr.revenue_ua) FOR direction's report_rows
  − SUM(il.amount) FROM invoice_lines il WHERE il.direction_id=:dir AND invoice not cancelled
```
Surface as a warning badge when `> 0`. ("Незакрытая выручка".)

### 4.6 Direction KPI view (live; materialize only if volume demands — P6)

```sql
CREATE OR REPLACE VIEW direction_kpis AS
SELECT
  d.id AS direction_id, d.status, d.wagons_planned, d.client_rate, d.owner_rate,
  COUNT(DISTINCT dl.wagon_id) FILTER (WHERE dl.direction_id = d.id)              AS wagons_shipped,   -- via deals (C1)
  COALESCE(SUM(rr.revenue_ua - rr.cost_owner)
           FILTER (WHERE dl.direction_id = d.id), 0)                            AS earned_margin,    -- D17
  COALESCE(SUM(il.amount)
           FILTER (WHERE il.direction_id = d.id), 0)                            AS invoiced_net,     -- §4.4
  COALESCE((/* per-direction paid, §4.4 allocation */), 0)                      AS paid_net
FROM directions d
LEFT JOIN deals          dl ON dl.direction_id = d.id          -- direction_id ONLY on deals
LEFT JOIN report_rows    rr ON rr.deal_id      = dl.id
LEFT JOIN invoice_lines  il ON il.direction_id = d.id
GROUP BY d.id;
```

### 4.7 `lump_sum` rate model (resolves CRITIC-correctness M4)

Locked D17 emits a ReportRow only when revenue+cost both present per deal. A `lump_sum` direction has
a single revenue event, not per-wagon. **Decision:** `directions.rate_model = 'lump_sum'` directions
emit ReportRows by **operator-triggered confirmation** (allocate revenue across trips or emit one
synthetic row), not by per-deal data completeness. The default `per_wagon_trip` model is unchanged.
Implement before onboarding any lump-sum ПСЦ.

---

## 5. Two-Tab Information Architecture

**Design stance (honors `design-quality.md`):** dark-luxury + editorial hierarchy — **not** a
dashboard template. Deliberate scale contrast (route string is hero, money is amber, paid is green,
exceptions red, in-transit blue). Semantic color, not decorative. Motion clarifies the
`wired → live → alert` state transition. Cards use intentional rhythm, depth (status pulse dot,
layered surfaces), and designed hover/focus states. PWA-first: 1-col → 2-col → 3-col reflow.

Tokens (CSS custom properties, per `coding-style.md`): base `oklch(12% 0.01 260)`, amber accent for
money, green for paid/confirmed, red for exceptions, blue for transit. Animate `transform`/`opacity`
only.

### 5.1 Routing

```
/                    → redirect → /directions
/directions          → Tab 1 grid
/directions/[id]     → drill-in
/directions/[id]/setup → wire-up panel (drawer overlay on desktop)
/reports             → Tab 2 PV table
/reports/[rowId]     → row detail (drawer desktop / page mobile)
```
Persistent two-item tab bar: Направления / Отчётность + bell + avatar. No sidebar on mobile.

### 5.2 Tab 1 — Card grid (Актуальные направления)

```
DESKTOP (≥1024px) — 3-col
┌─────────────────────────────────────────────────────────────────────┐
│  АКТУАЛЬНЫЕ НАПРАВЛЕНИЯ                       [+ Новое направление]  │
│  Фильтр: [Все] [Live] [Ошибки] [Черновики]            🔔 2   👤      │
│                                                                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐    │
│  │ ● LIVE           │  │ ◌ WIRED          │  │ — DRAFT          │    │
│  │ Асбест→Голышм.   │  │ Екб → Находка    │  │ Ченс.→Усть-Луга  │    │
│  │ Щебень           │  │ Металл           │  │ Зерно            │    │
│  │                  │  │                  │  │                  │    │
│  │ 12 в пути   7 ✓  │  │ 0 в пути   0 ✓   │  │ [Привязать →]    │    │
│  │ ₽ 1 240 000      │  │ ₽ 0              │  │                  │    │
│  │ заработано       │  │ заработано       │  │                  │    │
│  │ ████░░ 67% опл.  │  │ —                │  │                  │    │
│  │ ⚠ 2  сег. 14:32  │  │ Ожид. дислок.    │  │                  │    │
│  │ Вагон-Сервис     │  │ РЖД-Партнёр      │  │                  │    │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
TABLET 768–1023 → 2-col   PHONE <768 → 1-col, stats in 2×2 sub-grid
```

**Card states:** `draft` (desaturated, dashed border, "Привязать" CTA) · `wired` (solid border,
amber pulse, "Ожидает дислокаций") · `live` (full color, green pulse) · `error` (red border, alert
count) · `loading` (shimmer on numerals only, structure stable) · `archived` (40% opacity).

### 5.3 Drill-in (per-direction full report)

```
← Направления     Асбест → Голышманово / Щебень     ● LIVE   ⚙ Настройка
─────────────────────────────────────────────────────────────────────────
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│ ОТГРУЖЕНО│  │ЗАРАБОТАНО│  │ВЫСТАВЛЕНО│  │ ОПЛАЧЕНО │
│    7     │  │₽1 240 000│  │₽ 900 000 │  │₽ 600 000 │
│ из 40    │  │          │  │          │  │ 67% ████ │
└──────────┘  └──────────┘  └──────────┘  └──────────┘

В ПУТИ: 12 вагонов   [маршрут — станции текстом в P0/P1; карта P3+]

ВАГОНЫ ПО РЕЙСАМ   [Все][В пути][Завершены][Проблемы]
№ вагона   Операция         Станция        Дата      Оборот,сут  Маржа
52001234   Погружен         Асбест        01.06.26   —           —
           В пути → Голышм.  Дружинино     02.06.26
52001235   Выгружен         Голышманово   31.05.26   11*         ₽177 000
52001236   ⚠ Не сопоставлен  —             сег.       —           —
  (* cross-row turnover, D1; provisional values flagged, excluded from averages)

ФИНАНСЫ / СЧЕТА          [+ Добавить счёт]
№ счёта     Сумма        Дата       Статус
СФ-2026-12  ₽450 000    15.05.26   ✓ Оплачен
СФ-2026-18  ₽450 000    01.06.26   ⏳ Ожидает

ПОЧТА / ДИСЛОКАЦИИ   Входящих: 34  Переслано: 34  Ошибок: 2  [Журнал]
АЛЕРТЫ (2)
  ⚠ Вагон 52001236 — нет в реестре заявки (per-wagon quarantine)
  ⚠ Дислокация 03.06 10:11 — не удалось переслать
```

### 5.4 Wire-up panel (n8n node config — desktop drawer / mobile sheet)

```
┌─ Настройка направления                              #D-2047 ─┐
│ ① ДОКУМЕНТЫ                                                  │
│   [Перетащите ПСЦ + Заявку сюда]   [📄 ПСЦ] [📋 Заявка]      │
│   → AI читает и предзаполняет ↓ (P5)                         │
│ ② ИЗВЛЕЧЁННЫЕ ПАРАМЕТРЫ                       [✎ Редакт.]    │
│   Маршрут [Асбест ▼] → [Голышманово ▼]                       │
│   Груз [щебень]  Вагонов [40]  Тоннаж [68.5]                 │
│   Ставка клиента [₽ 1 800/т] 🟡 предложено AI — подтвердите   │
│   Ставка владельца [₽ 1 200/т] 🟡 подтвердите                │
│   ⚠ Клиент НЕ заполняется автоматически (D16): [выбрать ▼]   │
│ ③ СОБСТВЕННИК + ВХОДЯЩАЯ ПОЧТА                               │
│   [Вагон-Сервис ▼]   [owner@firm.ru]  [Проверить] ✓          │
│   Ожидаемые вагоны (для общего ящика): [50012345, ...]       │
│ ④ КЛИЕНТ + ПЕРЕСЫЛКА                                         │
│   [ООО ... ▼]   [client@firm.ru]   CC [...]                  │
│ ─ СХЕМА ПОТОКА ─                                             │
│   [СОБСТВЕННИК]──→[НАПРАВЛЕНИЕ]──→[КЛИЕНТ]                   │
│        ↑[ПОЧТА ВХОДЯЩАЯ]                                     │
│ [Сохранить и активировать] ← заблокировано пока не пройден    │
│                              ACTIVATION GUARD (§1.3)          │
└──────────────────────────────────────────────────────────────┘
```

Node states: grey (unwired) → amber (wired) → green (verified) → red (error). The
"Сохранить и активировать" button is **disabled** until the §1.3 activation guard passes (client set,
both rates operator-confirmed, `client_rate > owner_rate`, mailbox + forward bound, discriminator
present if mailbox shared).

### 5.5 Tab 2 — Отчётность (PV table)

The canonical 17-column monthly **Отчет ПВ**, one row per completed trip/deal (locked spec).
Columns 1–17: № · Дата отгрузки · Номер вагона (8-digit norm) · Номер накладной · Клиент ·
**От компании = "Приоритет Логистика"** (fixed config constant, ADR-D7, never user-editable) ·
Станция отправления · Станция назначения · Груз · Тоннаж · Сумма УА · Ставка УА ·
Сумма от Поставщика · Ставка Поставщика · **Маржа (col11 − col13)** · **Оборот,сут (cross-row, D1)** ·
Примечание. Filters: Месяц / Клиент / Направление / Поставщик / Статус строки. Footer totals.
Server-side xlsx export (SheetJS) respecting filters, matching the Отчет ПВ sheet format.

---

## 6. Phase Placement (corrected — folds CRITIC-consistency G3 + the "P0 scaffold" falsehood)

> **CORRECTION (resolves CRITIC-consistency):** The upstream `phasing-delta`/`schema-delta` drafts
> narrated the new tables as part of "the locked P0 scaffold." This is **FALSE** — `MVP_PLAN.md`
> enumerates the P0 canonical tables exhaustively (stations, counterparties, wagons, wagon_movements,
> deals, ingested_files, quarantine_rows, auth, migrations) and the Order/Direction tables are
> **none** of them. Adding them is a **proposed deviation (ADR-D1)** and must be labeled as such.
> Tables are scaffolded **at the migration of the phase that first uses them**, not at P0.

| Phase | Ships | Scaffold-only (Drizzle defs, no behavior) |
|---|---|---|
| **P0** | Auth + two-tab shell (empty grid + empty PV placeholder). **Locked P0 table list only.** | — |
| **P1.5** | **Manual Direction CRUD** (replaces locked "manual deal CRUD") + historical ПВ import → deals linked to directions (client+route match or operator-assign) → grid + drill-in margin from history + xlsx export | `directions` (rates **nullable**, `order_id` **nullable**, `is_synthetic`), `deals.direction_id` nullable FK — created at the **P1.5** migration |
| **P2** | Worker + ARQ + Redis + Source C parser + manual upload UI binding a file to a Direction (`ingested_files.direction_id`) | — |
| **P3** | All 4 parsers + station dict + lifecycle + cross-row turnover + **direction-mailbox binding UI** + **Gmail sender-match routing** + **auto-forward to client** + live отгружено/заработано | `direction_owner_bindings`, `direction_client_bindings`, `email_routing_log` |
| **P4** | Deal matching + auto-report xlsx + **invoice/payment UI + оплачено** | `invoices`, `invoice_lines`, `payments` |
| **P5** | **Drag-drop ПСЦ/Заявка + LLM extraction** → Direction pre-fill (suggested rates) → confirm | `orders`, `source_documents`, `extracted_prices` |
| **P6** | SSE realtime + push + hardening + (optional) materialized KPI counters | — |

**Smallest correct first slice:** P1.5a manual Direction CRUD → P1.5b historical import → P1.5c PV
table + export. Build the Direction form **before** the importer (the importer needs directions to
assign deals to). No email, no LLM, no worker in this slice.

---

## 7. Conflicts Resolved (definitive — so the schema is buildable in one pass)

| # | Conflict across drafts | DECISION |
|---|---|---|
| 1 | `direction_id` grain (CRITIC C1) | **`deals` only.** Drop it from `wagon_movements`/`wagons`. KPIs count via deals. |
| 2 | Direction schema: rich-denorm (`order-direction`) vs bindings (`schema-delta`) vs flat (`phasing-delta`) | **Bindings model** (`schema-delta`) — alone supports multi-owner split lots + hot-path mailbox index. **Drop denorm counters until P6.** |
| 3 | Order↔Direction cardinality (CRITIC H2) | **Order 1→N Direction.** Reject 1:1 archive-on-confirm. Each `extracted_prices` line → ≤1 Direction. |
| 4 | `directions.order_id` NOT NULL vs nullable | **Nullable** (manual + historical + synthetic directions, M3). |
| 5 | `directions.*_rate` NOT NULL vs nullable | **Nullable** (+ separate `*_rate_suggested`), so historical rates from imported rows work and LLM never writes confirmed money (H1, M3). |
| 6 | `client_counterparty_id` NOT NULL (`order-direction`) vs D16 | **Nullable, operator-confirmed only.** LLM may suggest, never persist silently (D16, G2). |
| 7 | Invoice grain: per-direction vs per-period (CRITIC H4) | **Per client+period** with `invoice_lines` allocation junction. Per-direction paid derived by allocation ratio. |
| 8 | Forward idempotency: Message-ID vs SHA-256 (CRITIC H3) | **`(content_sha256, direction_id)`** + outbox transition. Message-ID secondary signal only. |
| 9 | Mailbox routing vs Source-A full export (CRITIC C2) | **Priority-0 Source-A guard**: route full exports by content, never by mailbox. Mailbox = scoping filter feeding the locked matcher, never a replacement. |
| 10 | Shared mailbox / >1 direction (CRITIC C3) | **Per-wagon fan-out split** + per-wagon quarantine; `expected_wagon_ids` required to activate a shared-mailbox direction. |

---

## 8. Locked Decisions (this layer)

- **D-PD-1:** `direction_id` is on `deals` only; never on `wagons`/`wagon_movements`. Turnover stays a
  direction-independent per-wagon cross-row cycle (D1).
- **D-PD-2:** Order 1→N Direction; one ПСЦ → many rate lines → many candidate Directions.
- **D-PD-3:** Money fields (`client_rate`, `owner_rate`, currency, VAT, unit) are **never**
  auto-accepted; LLM writes `*_suggested`; operator promotes by keystroke; activation blocks on
  `client_rate ≤ owner_rate` (H1).
- **D-PD-4:** `client_counterparty_id` nullable, operator-confirmed only (D16).
- **D-PD-5:** Mailbox routing is a scoping filter; Source-A full exports route by content; every
  dislocation still passes `event_key` (D9) + `(wagon, waybill)` matching (C2).
- **D-PD-6:** Shared mailbox → per-wagon fan-out split + per-wagon quarantine (C3).
- **D-PD-7:** Forward idempotency on `(content_sha256, direction_id)`, outbox transition; exactly-once
  client forward (H3).
- **D-PD-8:** Forward eligibility (grace window after CLOSED) is separate from deal-mutation
  eligibility (M2).
- **D-PD-9:** Invoice grain = client+period; `invoice_lines` allocation; per-direction paid derived.
- **D-PD-10:** New tables are NOT P0; scaffolded at the migration of their first-use phase (ADR-D1).

---

## 9. Open ADRs / Questions for the Operator

| ID | Item | Status | Needs operator decision? |
|---|---|---|---|
| **ADR-D0** | **"ПСЦ" = "Протокол согласования цены" (price agreement protocol).** Assumed throughout. Affects only the P5 LLM prompt scope + a doc_type label; **zero impact on P0–P4.** | ASSUMPTION | **YES — confirm before P5.** If wrong, rename `source_doc_type` enum + adjust prompt only. |
| **ADR-D1** | New Order/Direction tables are a **proposed deviation** from the locked P0 canonical-table list; scaffolded per-phase, not at P0. | PROPOSED | YES — approve the additive schema. |
| **ADR-D4** | **VAT handling.** Invoices carry VAT (20% RU); locked Маржа has none. `invoice.amount_billed_net` must equal `revenue_ua` of covered rows or AR diverges 20%. If ПСЦ rates are VAT-inclusive, the LLM must strip VAT into net before populating suggested rates. | BLOCKER for P4 invoice UI | **YES — confirm VAT-inclusivity against a real ПСЦ.** |
| **ADR-D5** | **Billing grain:** one client Счёт-фактура covering multiple directions/months (period-scoped) vs per-direction. We chose period+allocation. | DECIDED (period) | Confirm matches РНС practice before P4 UI. |
| **ADR-D6** | **`lump_sum` directions:** ReportRow emitted by operator confirmation, not per-deal completeness. | DECIDED | Confirm whether any current contract is lump-sum. |
| **ADR-D7** | **"От компании" = "Приоритет Логистика"** stays a fixed config constant in the PV column, never a user-editable Direction field. | DECIDED | Confirm no second billing entity is needed per direction. |
| **ADR-D8** | **Object storage** behind a `StorageAdapter` (Railway volume now, S3/R2 later, one-line swap). | DECIDED | None. |
| **ADR-D9** | **Dedicated-alias MX** (`d-{uuid}@inbound.rns.app` catch-all) — new infra. Deferred post-MVP; MVP ships sender-match only. | DEFERRED | Decide if/when alias mode is wanted (some owners send only to a fixed address). |
| **OQ-1** | **"Оплачено"** = client receipts (assumed) vs owner cost paid out vs both? | OPEN | **YES.** |
| **OQ-2** | **Wagon-intersection threshold** (post-MVP P2 fan-out, default 0.6) — tune after real volume. | OPEN | Later. |
| **OQ-3** | Can a single Direction bill through **different legal entities** (beyond "Приоритет Логистика")? Affects ADR-D7. | OPEN | YES if multi-entity billing exists. |

---

## 10. Reconciliation with real fixtures (overrides §1–§9 on conflict)

Two real documents were provided after this spec was drafted — they resolve assumptions and correct the
price model. Golden fixtures: `examples/order-zayavka-cem1.md`, `examples/psc-vektor-rns.md`. See
`SCHEMA_DELTA.md` §9 for the schema changes.

1. **ADR-D0 RESOLVED:** ПСЦ = «Протокол согласования **договорной** цены». Confirmed.
2. **ADR-D4 RESOLVED:** real ПСЦ + ЗАЯВКА rates are **per wagon, `в т.ч. НДС 22%`** (VAT-inclusive, 22%, not 20%). Store `rate_basis=per_wagon`, `vat_inclusive=yes`, `vat_rate=22`; strip to net for AR reconciliation.
3. **ПСЦ side is auto-derived from РНС's role** — no operator prompt: РНС = **ЗАКАЗЧИК** ⇒ owner/cost ПСЦ; РНС = **ИСПОЛНИТЕЛЬ** ⇒ client/revenue ПСЦ. The counterparty's role flips accordingly.
4. **A ПСЦ is a versioned route-keyed RATE TABLE, not a scalar.** Each protocol holds many lines `(origin, dest, wagon_type) → rate/wagon`, issued as an Приложение to a parent Договор, superseded by a newer приложение (п.4). A Direction's cost/revenue is a **lookup snapshot** into the applicable protocol, frozen onto the deal at trip time (immutability D17/D8). New tables: `counterparty_contracts`, `price_protocols`, `price_protocol_rates`.
5. **Hierarchy:** ЗАЯВКА is a «Поручение № N к Договору № M» → model `counterparty_contracts ← orders ← directions`. Order gains `transport_kind`, `plan_kind`, `period_month`, `gu12_number`, `parent_contract_id`.
6. **Stations:** ЗАЯВКА carries inline ESR (`ст. NAME Дорога ж.д. (02220)`) → seeds dictionary directly; ПСЦ uses bare names → resolve via dictionary (watch homonyms). Грузоотправитель/Грузополучатель stored separately, never as Клиент (D16).
7. **Wagon ↔ Direction grain (critic C1, locked):** `direction_id` lives ONLY on `deals` (trip grain); a physical wagon serves many directions over time, turnover stays a per-wagon cross-trip cycle.
