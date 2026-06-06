# Запросы & Sourcing — Pre-Order Funnel Spec (ЗАПРОС / RFQ)

> **Status:** PROPOSED, additive. Extends `MVP_PLAN.md` (D1–D18), `PRODUCT_DIRECTIONS.md` (D-PD-1…10), `SCHEMA_DELTA.md` (§9 price_protocols, R1–R5). **No locked table altered destructively; no locked invariant contradicted.**
> **Source-of-truth precedence:** `MVP_PLAN.md` D1–D18 > `PRODUCT_DIRECTIONS.md` / `SCHEMA_DELTA.md` §9 > this doc.
> **This doc is the single source of truth for the pre-order funnel.** Where the upstream research findings disagreed, this doc resolves them (see §11 Resolutions). The discarded `owner-sourcing` flat-single-route + 20% VAT model is explicitly superseded.

The pre-order stage that comes **before** a Заявка. A **ЗАПРОС (RFQ)** is what a client sends first: "can you give N полувагонов on route A→B (cargo, period), at what price?" РНС does not own enough wagons, so it **polls owners** ("опрашиваем собов") to learn who can provide wagons and at what cost. From collected owner quotes РНС decides coverage, cost, margin, then quotes the client. On client acceptance the запрос converts into a ЗАЯВКА → НАПРАВЛЕНИЕ.

```
ЗАПРОС(RFQ) → опрос собственников → котировка клиенту → [won] → ЗАЯВКА → НАПРАВЛЕНИЕ → дислокации → ОТЧЁТ
   Запросы tab                                                    Направления tab          Отчётность tab
```

---

## 0. Grain & terminology

| Term | RU | What | Grain | New? |
|---|---|---|---|---|
| **Request** | Запрос (RFQ) | A client ask: N wagons, route(s), cargo, period, "at what price?". Pre-commercial. Unit of the **Запросы** tab. | One per client ask | **NEW** |
| **RequestLine** | Строка запроса | One origin→dest route within a request. The unit that becomes a Direction on win. | One per route line | **NEW** |
| **OwnerQuote** | Опрос собственника | One owner's spot reply on one route line: K wagons at cost X, availability window, validity. | One per (request_line, owner) | **NEW** |
| **ClientQuote** | Котировка клиенту | РНС's priced offer back to the client, versioned (re-quote on haggle). | One per quote version | **NEW** |
| Order | Заявка | (locked) Conversion target of a won Request. | One per order doc set | existing |
| Direction | Направление | (locked) Operational hub, Tab-2 card. | One per route line | existing |

**Multi-route grain decision (resolves C3):** routes live on `request_lines`, **not** flattened onto `requests`. The locked conversion is **Order 1 → N Direction** (R2 / D-PD-2); each line → one Direction. There is no `wagon_count` on the parent — UI shows `SUM(request_lines.wagons_requested)`. (Honors `rfq-entity` ADR-001's own recommendation.)

---

## 1. ЗАПРОС entity + status state machine

### 1.1 Status enum (resolves M4 — superset)

```
new → sourcing → quoted → { won | lost | no_bid | expired } | cancelled
```

| Status | Meaning |
|---|---|
| `new` | Created, no owners polled yet. |
| `sourcing` | ≥1 owner polled; collecting/awaiting replies; coverage & cost recompute live. |
| `quoted` | A client quote (`client_quotes`) has been sent; awaiting client decision. |
| `won` | Client accepted → triggers **win conversion** (§3). Terminal. |
| `lost` | Client declined / went elsewhere. Terminal. Requires structured `loss_reason` (§2.7). |
| `no_bid` | **РНС could not assemble a viable cover** (no park on direction, or cost > any winnable price). Distinct from `lost` — opposite strategic meaning (procurement critic RANK 7). Terminal. |
| `expired` | Decision window lapsed with no resolution. Terminal (reactivatable via clone). |
| `cancelled` | RFQ withdrawn before quoting. Terminal. |

### 1.2 State machine

```
                       start opros            send client quote
   create              ┌──────────┐           ┌──────────┐
 ─────────► [ NEW ] ──►│ SOURCING │──────────►│  QUOTED  │
              │        └────┬─────┘           └────┬─────┘
              │             │ couldn't cover        │ client wins  │ client declines │ window lapses
              │ withdraw    │ at a winnable price   ▼              ▼                 ▼
              ▼             ▼                     [ WON ]       [ LOST ]          [ EXPIRED ]
        [ CANCELLED ]   [ NO_BID ]                  │
                                                    ▼ CONVERSION (atomic, §3)
                                          creates Order(draft) + Direction(draft)×N

  Terminal: WON, LOST, NO_BID, EXPIRED, CANCELLED.
  Re-quote while still QUOTED = new client_quotes.version (request stays 'quoted').
  Re-source after loss/expiry = a NEW request via requests.cloned_from_request_id (§2.7) — carries
    prior owner quotes (re-validated) + historical competitor price. One-way valve preserved.
```

### 1.3 Transition rules

| From | To | Trigger | Preconditions | Side effects |
|---|---|---|---|---|
| `new` | `sourcing` | "Начать опрос" | ≥1 `request_lines` row | sets `assigned_to`; creates `request_owner_quotes` rows (status `polled`) per targeted owner |
| `new` | `cancelled` | "Отозвать" | — | sets `cancelled_at` |
| `sourcing` | `quoted` | "Отправить котировку клиенту" | ≥1 live `client_quotes` line covering each line; **all aggregates exclude expired quotes** (§2.5) | sets `client_quotes.status='sent'`, `sent_at` |
| `sourcing` | `no_bid` | "Не можем закрыть" | `loss_reason ∈ {no_capacity, price}` | sets `closed_at` |
| `sourcing` | `expired` | manual / scheduled | — | sets `expired_at` |
| `quoted` | `won` | "Отметить выигранным" | **projected margin guard (§2.6): if margin ≤ 0, hard warning before proceed** | sets `won_at`; **win conversion** (§3) |
| `quoted` | `lost` | "Отметить проигрыш" | structured `loss_reason` required | sets `lost_at`, `competitor_price` (nullable) |
| `quoted` | `expired` | validity lapses | — | sets `expired_at` |
| `won` | — | terminal | cannot reopen | `converted_order_id` set; data immutable downstream (D17) |
| `lost`/`no_bid`/`expired`/`cancelled` | — | terminal | reactivate = **clone** to new request | — |

**Money never auto-confirmed (D16/H1):** no transition writes a confirmed client identity or confirmed money. All client + rate values land in `*_suggested` columns on conversion and require an operator keystroke downstream.

---

## 2. Owner sourcing (опрос) + coverage & margin computation

### 2.1 `request_owner_quotes` — the canonical опрос table

This is the **one** owner-quote table (resolves C2). Parented on `request_lines` (per-line, matching R2). Carries the procurement critic's cost-stack fields so margin is not systematically optimistic.

**Cost-stack reality (procurement RANK 1–2):** a spot полувагон rate is *not* the all-in cost. Three terms must be explicit and basis-normalized before margin is trustworthy:
1. **Owner wagon rate** (rent / spot rate) — may be per-wagon-trip, per-ton, per-km, or daily×оборот.
2. **Порожний пробег** (empty-return) — who bears it, and the РЖД tariff on the empty leg. On one-way-heavy directions (ports, Кузбасс) this can exceed loaded margin.
3. **Провозная плата РЖД** (Прейскурант 10-01, via ЕЛС) — often the largest line item; may be paid by РНС (gross billing) or by the client directly (РНС bills wagon-component only).

Margin must be computed on a **single basis** (both sides wagon-component-only, OR both all-in) per request, never mixing.

### 2.2 VAT discipline (resolves C2 / RANK 3)

- **Default `vat_rate = 22.00`** (locked: `SCHEMA_DELTA §9`, real ПСЦ/ЗАЯВКА fixtures are `в т.ч. НДС 22%`). The discarded 20% default is a correctness defect.
- VAT is **per-row data**, never a global constant (D-PD-3). Each quote/line carries `vat_rate` **and** `vat_treatment ENUM('inclusive','exclusive','not_vat_payer')`. The boolean `cost_includes_vat` is killed — it cannot express «не плательщик НДС» (УСН owners).
- **All margin math is done on NET (без НДС) values**, normalized per-row by that row's own treatment. Never average mixed-basis rates.
- A `not_vat_payer` owner means РНС cannot reclaim входной НДС → effective cost is *higher* than headline. Flag such owners visually; they look cheaper but often aren't.

### 2.3 Owner-quote status

```
polled → responded → { accepted_into_coverage } 
       → declined
       → expired   (quote_valid_to lapsed)
```

`accepted_into_coverage BOOLEAN` is the operator's manual selection into the winning cover set. Selection is **manual** (operator picks; advisory greedy is shown but never auto-committed — see §2.4).

### 2.4 Coverage computation (resolves RANK 4)

Partial coverage is the **norm**, not the edge. Coverage must distinguish *nominal* from *deliverable*:

```
-- single shared SQL predicate, reused by every aggregate (RANK 5):
quote_is_live(q)  :=  q.status IN ('responded','accepted')
                  AND (q.quote_valid_to IS NULL OR q.quote_valid_to >= now())

-- nominal (what owners say they can give)
wagons_offered_nominal = Σ q.wagons_offered WHERE quote_is_live(q)

-- DELIVERABLE = window-aware: only wagons whose availability overlaps the request period
wagons_deliverable     = Σ q.wagons_offered
                         WHERE quote_is_live(q)
                           AND q.avail_from <= line.period_to
                           AND q.avail_to   >= line.period_from
                           AND q.commitment = 'firm'   -- soft promises don't count toward deliverable

coverage_pct = LEAST(wagons_deliverable / line.wagons_requested, 1.0) * 100
deficit      = GREATEST(line.wagons_requested - wagons_deliverable, 0)
```

- **Double-counting guard:** the same physical park is sometimes offered by an owner and a sub-lessor. `owner_group_id` (nullable) + an operator "возможный дубль парка" flag prevent counting the same wagons twice.
- **Soft vs firm:** `commitment ENUM('soft','firm')`. «да, дам 30» is soft until confirmed; only `firm` counts toward deliverable coverage.
- **No buggy auto-allocator.** The greedy cheapest-first selection from the discarded `owner-sourcing` finding had a partial-last-owner cost bug and ignored availability windows. We ship a **ranked, sortable list** (by net cost, by window fit, by commitment) and let the operator select. An advisory "Рекомендация" highlight may suggest a cheapest-firm-window-compatible set, but it is display-only and unit-tested on the partial-fill path before it ships.

### 2.5 Expiry (resolves RANK 5)

Every coverage/margin aggregate **must** apply the shared `quote_is_live()` predicate above — expired quotes never feed live coverage or margin. Additionally:
- Card signal: «3 из 4 котировок истекают ≤48ч».
- When РНС sends a client quote, snapshot the underlying owner quotes' validity. **Warn if client SLA (`requests.valid_until`) outlives owner-cost validity** — that gap is uncovered price risk РНС eats.
- `requote_requested_at` lets the operator re-poll an owner whose quote expires before client decision, without losing history.

### 2.6 Margin computation (basis-normalized, net-of-VAT)

```
-- per wagon, all NET (без НДС), all same basis (wagon-component OR all-in per request.cost_basis):
revenue_net   = client_quote_line.rate_per_wagon  → normalized to net via its vat_treatment
owner_cost_net= weighted avg of accepted owner quotes' cost_rate → net via each row's treatment
empty_run_net = line.empty_run_cost_estimate (operator input; mandatory when empty_return_party='rns')
provozn_net   = line.provozn_estimate          (when provozn_payer='rns')

margin_per_wagon = revenue_net − owner_cost_net − empty_run_net − provozn_net
margin_pct       = margin_per_wagon / revenue_net * 100
total_margin     = margin_per_wagon * wagons_deliverable   -- NOT wagons_requested (don't count uncovered)
```

**Labeling discipline (D7/D17):** this is **projected planning math from quotes**, never `report_rows`-derived actual margin. The UI label is explicit: **«ориентировочная маржа (нетто; вагонная составляющая, без порожнего и провозной — если не заданы)»**. Excluded terms are always shown alongside; never green-light a quote off a single rolled-up number that hides empty-run / provozn / VAT-basis. Actual `Заработано` exists only after deals close on the resulting Direction (existing `direction_kpis`).

### 2.7 Loss intelligence + re-sourcing (resolves RANK 7)

```
loss_reason ENUM('price','no_capacity','client_cancelled','timing','competitor','other')
competitor_price NUMERIC(14,2)   -- nullable, "we lost at X, market ~Y"
lost_to TEXT                      -- nullable competitor name
cloned_from_request_id UUID       -- nullable self-FK: a re-source carries forward prior owner quotes
                                  --   (as fresh re-validated rows) + the historical competitor price
```

`lost` (client said no) vs `no_bid` (РНС couldn't assemble a cover) are distinct statuses — opposite meanings for strategy. Lost-price data feeds the quote helper: «на этом направлении проиграли при ₽1 980; рынок ~₽1 850».

### 2.8 Cross-request owner capacity (resolves RANK 6)

Owners have finite parks. The same owner replies «могу дать 30» to three live requests. A per-request view is blind to this.
- **Owner exposure view:** for an owner + overlapping period, `Σ wagons_offered (open requests)` vs `counterparties.park_size` (nullable, owner-supplied).
- Warn when an owner's offered wagons are committed across multiple live requests.
- On win-conversion, flag/decrement committed capacity; warn if a second won request double-books the same owner-period.

### 2.9 Relation to `price_protocols` (the key decision — ADR-RFQ-2)

**A won owner spot quote does NOT auto-create a `price_protocols` rate line.** Spot quotes are one-off cost evidence; protocols are versioned, route-keyed *contractual* instruments (Приложение to a Договор). Auto-seeding would pollute the contractual price-book and corrupt the "resolve applicable rate at trip date" lookup the locked model depends on.

| Property | `price_protocol_rates` (ПСЦ) | `request_owner_quotes` (spot) |
|---|---|---|
| Lifetime | Standing until superseded | Single request/period |
| Backing | Signed Договор/Приложение | An email/phone "да, можем дать 30 по X" |
| Reuse | Every future Direction on that route | Once, for this request |
| Authority | Source of truth | Evidence → Direction rate *suggestion* |

- **Pre-fill hint (informational, not binding):** at poll creation, if the owner has an active ПСЦ on the route (РНС=ЗАКАЗЧИК → owner=ИСПОЛНИТЕЛЬ → that rate is our cost), pre-fill `cost_rate` and set `price_protocol_id` for traceability. Operator can override. The binding number is always the quote row, never the protocol.
- **Optional explicit promotion (operator-driven, never automatic):** if РНС signs a standing deal off a good spot quote, the operator may promote it to a new ПСЦ rate line via `price_protocols.seeded_from_owner_quote_id`. Mirrors the existing `directions.seeded_from_extracted_price_id` pattern.

---

## 3. Funnel integration — Запрос → Order → Direction

The RFQ stage sits **upstream of `orders`** and converges into it on win. Nothing downstream of `orders` changes shape.

```
requests (ЗАПРОС) ─1:N─ request_lines ─1:N─ request_owner_quotes (опрос, spot)
   │                        │ operator selects coverage set + builds client_quotes
   │ [WON] conversion (atomic)
   ▼
orders (Заявка, draft) ─1:N─ directions (Направление, draft)   ← EXISTING, unchanged shape
                                  │ resolves rate against price_protocols (or carries snapshot)
                                  ▼  deals → report_rows → invoices/payments   ← EXISTING, locked
```

### 3.1 Conversion (one atomic operator action)

```
Request (status=won)
  ├─► creates 1 Order
  │     orders.request_id          = request.id                 (back-link)
  │     orders.client_suggested_id ← request.client_suggested_id  (SUGGESTED — D16)
  │     orders.status              = 'draft'
  │
  └─► for EACH request_line with ≥1 accepted owner quote:
        creates 1 Direction (R2: Order 1→N Direction)
          directions.order_id              = order.id
          directions.station_origin_esr    ← line.origin_esr (resolved via dict, D15; raw preserved)
          directions.station_dest_esr      ← line.dest_esr
          directions.cargo_name            ← line.cargo_name
          directions.wagon_count_planned   ← line.wagons_requested
          directions.rate_owner_suggested  ← accepted owner_quote.cost_per_wagon   (SUGGESTED — D16)
          directions.rate_client_suggested ← client_quote_line.rate_per_wagon      (SUGGESTED — D16)
          directions.status                = 'draft'   (activation guard still applies downstream)
```

### 3.2 What carries forward — and at what trust level

| Carried value | From | Lands in | Trust |
|---|---|---|---|
| Client identity | `requests.client_suggested_id` | `orders.client_suggested_id` | **SUGGESTED only.** RFQ origin is high-quality evidence, still **not authority** (D16). Operator must re-confirm `directions.client_counterparty_id`. |
| Route | accepted line | `directions.station_*_esr` (+ `_raw`) | Resolved via dict (D15); raw preserved if unresolved. Operational fact. |
| Cargo, period, wagons | line | `directions.cargo_name`, period, `wagon_count_planned` | Operational, safe. |
| **Client price (revenue)** | `client_quote_lines.rate_per_wagon` | `directions.rate_client_suggested` | **SUGGESTED.** Promotion to confirmed `rate_client` is an operator keystroke. Activation blocks on `rate_client ≤ rate_owner` (H1). |
| **Owner cost** | `request_owner_quotes.cost_per_wagon` | `directions.rate_owner_suggested` | **SUGGESTED.** Same promotion rule. |

### 3.3 How a spot quote reaches money (identical to the locked snapshot path)

```
request_owner_quotes.cost_per_wagon (spot)
  └─► conversion → directions.rate_owner_suggested (SUGGESTED, D16)
        └─► operator promotes → directions.rate_owner (confirmed cache)
              └─► at deal match → deals.cost_owner (frozen snapshot, D8/D17)
                    └─► report_rows.cost_owner → margin = revenue − cost (D7, export only)
```

This is the **same snapshot path** the existing model uses for protocol-resolved rates (`SCHEMA_DELTA §9.2`). The spot quote merely substitutes for the protocol lookup as the *source* of the suggested rate. Conversion happens entirely **before** any deal exists → D17/D8 immutability untouched.

### 3.4 Integrity rules

1. Only `accepted_into_coverage=true` quotes feed Direction suggestions; unselected quotes remain as audit history.
2. `requests.converted_order_id` and the first Direction id are set in the same DB transaction.
3. **Idempotent-guarded:** if `requests.converted_order_id IS NOT NULL`, conversion returns the existing Order (no duplicate).
4. Conversion is the **only** write crossing into the locked Направление world; everything left of it is pre-sale scratch (freely mutable; money not frozen until a deal closes — D17 untouched).

---

## 4. "Запросы" tab IA + wireframes

### 4.1 Funnel nav (3 surfaces) — ADR-D12

The three surfaces are **temporal stages of one object's life**, not peers. Nav is a **funnel rail** with a live count badge per stage; a won запрос "graduates" rightward (transform/opacity only).

```
ЗАПРОС ──opros──▶ котировка ──[won]──▶ НАПРАВЛЕНИЕ ──дислокации──▶ ОТЧЁТ
 Запросы tab                            Направления tab            Отчётность tab
```

**Routing:** `/` → redirect → `/requests` (pipeline-home; ADR-D12, surface explicitly to operator) · `/requests` · `/requests/[id]` (drill-in) · `/requests/new` · `/directions`, `/reports` unchanged.

### 4.2 Board decision — HYBRID

Status-laned board on desktop, where each lane is a **dense sortable mini-table** (rows are table-rows, not fat chip-cards); a single grouped vertical list on mobile. Shape from kanban, density from table. **Not** the generic shadcn kanban (banned): asymmetric lane widths (sourcing widest), sticky lane headers with live roll-up stats, mono tabular money. `lost|no_bid|expired|cancelled` collapse into one "closed" lane (7 states ≠ 7 lanes).

### 4.3 Desktop board (S2)

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│  ЗАПРОСЫ ───────▶ НАПРАВЛЕНИЯ ───────▶ ОТЧЁТНОСТЬ              🔔 2   👤   [+ Запрос]    │
│   ◆ 8              ● 14                 ▦ июнь                                            │
│  Фильтр: [Все] [Срочные] [Готовы к котировке] [Мои]      сорт: [SLA ▼] [маржа] [покр.]  │
├──────────┬──────────────────────────────┬─────────────┬──────────┬──────────────────────┤
│ NEW  2   │ SOURCING            4         │ QUOTED   1  │ WON   1  │ ЗАКРЫТО  (14) ▸       │
│ Σ 70 ваг │ Σ покрытие 68%   себ ₽1.2м   │ марж +₽1.4м │          │  lost·no_bid·expired  │
├──────────┼──────────────────────────────┼─────────────┼──────────┼──────────────────────┤
│●Екб→     │●Асбест→Голышм  Плв·щебень 40 │●Тайшет→     │●Лена→    │  (свернуто)           │
│ Находка  │ покр(дост) ███████░ 72%      │ Ванино  60  │ Усть-Луга│                       │
│ Плв·мет  │ собы 4/6  себ(нетто) ₽1 180  │ покр 100%✓  │ покр 100%│                       │
│ 30 ваг   │ ⚠ порож/провозн не заданы    │ кл ₽1 980   │ марж     │                       │
│ опрос→   │ марж ∅ (нет котир.)   🟡 3д  │ марж +₽1.4м │ +₽980к   │                       │
│          │                              │ ждём клиен. │ ✓ принят │                       │
│●Чел→     │●Кузбасс→Мурм  Плв·уголь 50   │ отпр 14:20  │ [Создать │                       │
│ Брест    │ покр ████░░ 38% ⚠ −31 ваг    │             │  заявку→]│                       │
│ Плв·зерно│ себ ₽2 050  собы 2/5  🔴 9д  │             │          │                       │
│ 40 ваг   │ ▲ просрочен — закрепить      │             │          │                       │
└──────────┴──────────────────────────────┴─────────────┴──────────┴──────────────────────┘
 lanes asymmetric · sticky lane header w/ rollup · rows mono-aligned · coverage = DELIVERABLE
 advance status by row action (tap/click) · SLA-breach rows pin to lane top
 (drag-to-advance optional desktop ≥1280 only; uses optimistic flip — see §6 H1)
```

### 4.4 Desktop drill-in (S4) — right drawer 560px

```
┌────────────────────────────── Запрос #R-2031 ──────────────────────── ✕ ┐
│ Асбест → Голышманово        Полувагон · щебень          ● SOURCING       │
│ Запрошено 40 ваг · период Июнь 2026 · клиент: [выбрать ▼] (не задан)     │
│ создан 31.05 · SLA ост. 3д · базис: вагонная составляющая ────────  🟡    │
├──────────────────────────────────────────────────────────────────────────┤
│ ПОКРЫТИЕ (доставляемое, окно совпадает)                                    │
│   ███████████████████░░░░░░  29 / 40 ваг  (72%)        дефицит −11 ваг    │
│   из них firm 24 · soft 5 (не в зачёт)                                     │
│                                                                            │
│ ОПРОС СОБСТВЕННИКОВ                                    [+ Опросить собов] │
│ Собственник     Статус    Ставка/ваг(нетто) Предл Окно       НДС   До     │
│ Вагон-Сервис    ● ответил  ₽1 180           15    01–30.06   22%  10.06   │
│ РЖД-Партнёр      ● ответил  ₽1 240           14    08–25.06   22%  08.06⚠  │
│ ТрансЛес         ● ответил  ₽1 310 (без НДС) 8     05–30.06   0%★  12.06   │
│ УГМК-Транс       ◌ ждём     —                —     —          —    —       │
│ СибВагон         ✕ отказ    —                —     —          —    —       │
│ ★ не плательщик НДС — входной НДС не зачесть, эфф. себест. выше            │
│ ── блендир. себест. (нетто, 29 ваг, дешевле→дороже) = ₽1 224/ваг ──        │
│ + порожний пробег: [₽ ____ /ваг]  кто несёт: [РНС ▼]                       │
│ + провозная плата: [₽ ____ /ваг]  плательщик: [РНС ▼]                      │
│                                                                            │
│ КОТИРОВКА КЛИЕНТУ                                                          │
│   Ставка клиенту [₽ ____ /ваг]  ⌨ ввод оператора (D16/H1)  НДС [22% ▼]    │
│   ▸ при ₽1 980 → маржа +₽21 924/ваг × 29(дост.) = +₽636к (нетто)          │
│     (без порожнего/провозной — задайте выше для точной маржи)              │
│   [Отправить котировку]  (заблок. если маржа ≤ 0 — guard H1)              │
│                                                                            │
│ ─────────────────────────────────────────────────────────────────────── │
│ [Не можем закрыть ▾]  [Отметить проигрышем ▾]      [Выигран → Заявка]     │
└────────────────────────────────────────────────────────────────────────┘
 convert → orders+directions (R2/D-PD-2), rates land *_suggested (D16), snapshot path §3.3 (D17)
```

### 4.5 Phone (S2 list + S4 page)

```
 BOARD (grouped list)            DRILL-IN (full page)
┌──────────────────────┐        ┌──────────────────────┐
│ ЗАПРОСЫ        🔔 👤 │        │ ←  Запрос #R-2031     │
│ ◆8 ─ ●14 ─ ▦июнь    │        │ Асбест→Голышманово    │
│ funnel rail (compact)│        │ Плв·щебень  ● SOURCING│
├──────────────────────┤        │ 40 ваг · Июнь · 🟡 3д │
│ SOURCING 4  покр68%  │←sticky ├──────────────────────┤
│┌────────────────────┐│        │ ПОКРЫТИЕ 72% (дост.)  │
││● Асбест→Голышм     ││        │ ███████░░  29/40 −11  │
││ Плв·щебень   40 ваг ││        │ firm 24 · soft 5      │
││ покр ███████░ 72%  ││        ├──────────────────────┤
││ собы4/6 себ₽1 180  ││        │ СОБЫ 4/6   [+опрос]  │
││ ⚠ порож не задан   ││        │┌────────────────────┐│
││ марж ∅      🟡 3д  ││        ││Вагон-Сервис ●₽1 180││
│└────────────────────┘│        ││ 15ваг 01–30.06 22% ││
│┌────────────────────┐│        │├────────────────────┤│
││● Кузбасс→Мурм 🔴9д ││        ││ТрансЛес ●₽1 310★0% ││
││ покр ████░ 38% −31 ││        ││УГМК-Транс ◌ждём    ││
│└────────────────────┘│        │└────────────────────┘│
├──────────────────────┤        │ бленд ₽1 224/ваг нетто│
│ QUOTED 1 · NEW 2    ▸│        ├──────────────────────┤
│ WON 1 · ЗАКРЫТО 14  ▸│        │ КОТИРОВКА [₽___/ваг] │
├──────────────────────┤        │ →маржа +₽636к (нетто) │
│ ◆Запросы ●Напр ▦Отч │        ├──────────────────────┤
│  bottom funnel bar   │        │[Закрыть][Выигран →]  │
└──────────────────────┘        └──────────────────────┘
 tap row = open · tap-hold = action sheet (no swipe-to-advance on smallest bp — H4)
```

### 4.6 Card face — load-bearing fields

`status rail (color)` · **route** (hero, semibold display family) · `wagon_type · cargo` (muted) · `wagons_requested` · **coverage% (deliverable)** micro-bar · `owners responded/polled` · **best/blended net cost** (mono amber-rail) · **projected margin** (mono, green +/red ≤0) · excluded-terms warning (`⚠ порож/провозн не заданы`) · **SLA** clock chip (red past `valid_until`).

---

## 5. SCHEMA DELTA (Drizzle + SQL)

> Conventions match locked schema: `uuid` PK `default gen_random_uuid()`; money `NUMERIC(14,2)`; ts `TIMESTAMPTZ` UTC (D1/D11); ESR `CHAR(6)` → `stations.esr_code`; wagon counts `INTEGER`. New enums follow `pgEnum` style. **Scaffolded at the phase that first uses them (proposed P1.6/P1.7), not P0** — consistent with D-PD-10.

### 5.1 Enums

```sql
CREATE TYPE request_status       AS ENUM ('new','sourcing','quoted','won','lost','no_bid','expired','cancelled');
CREATE TYPE owner_quote_status   AS ENUM ('polled','responded','declined','accepted','expired');
CREATE TYPE client_quote_status  AS ENUM ('draft','sent','accepted','rejected','superseded');
CREATE TYPE vat_treatment        AS ENUM ('inclusive','exclusive','not_vat_payer'); -- D-PD-3: VAT is per-row data
CREATE TYPE quote_commitment     AS ENUM ('soft','firm');                            -- RANK 4: only firm counts
CREATE TYPE cost_basis           AS ENUM ('wagon_component','all_in');               -- RANK 2: normalize basis
CREATE TYPE rate_scope           AS ENUM ('loaded_only','round_trip','daily');       -- RANK 1: empty-run handling
CREATE TYPE empty_run_party      AS ENUM ('owner','rns','client');
CREATE TYPE provozn_payer        AS ENUM ('rns','client');
CREATE TYPE request_loss_reason  AS ENUM ('price','no_capacity','client_cancelled','timing','competitor','other');
```

### 5.2 `requests` — respects D16 (client SUGGESTED only), D15 (raw + nullable ESR), R2

```typescript
// src/db/schema/requests.ts
export const requests = pgTable("requests", {
  id:               uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  requestNumber:    text("request_number"),                      // human ref e.g. R-2026-0031
  status:           requestStatus("status").notNull().default("new"),

  // D16: client SUGGESTED only — RFQ originator is evidence, not authority
  clientSuggestedId:uuid("client_suggested_id").references(() => counterparties.id, { onDelete: "set null" }),
  clientRaw:        text("client_raw"),

  cargoName:        text("cargo_name"),
  wagonType:        text("wagon_type").notNull().default("ПВ"),
  costBasis:        costBasis("cost_basis").notNull().default("wagon_component"), // RANK 2: margin basis
  periodFrom:       timestamp("period_from", { withTimezone: true }),
  periodTo:         timestamp("period_to",   { withTimezone: true }),

  receivedAt:       timestamp("received_at", { withTimezone: true }),
  validUntil:       timestamp("valid_until", { withTimezone: true }), // client SLA clock
  channel:          text("channel"),                             // email | phone | manual | web_form
  sourceRef:        text("source_ref"),                          // email message-id / call note
  notes:            text("notes"),
  assignedTo:       uuid("assigned_to").references(() => users.id),

  // conversion outcome (set once, on win) — back-link to spine
  convertedOrderId: uuid("converted_order_id"),                  // FK added in §5.7 after orders

  // RANK 7: loss intelligence + re-sourcing thread
  lossReason:       requestLossReason("loss_reason"),
  competitorPrice:  numeric("competitor_price", { precision: 14, scale: 2 }),
  lostTo:           text("lost_to"),
  clonedFromRequestId: uuid("cloned_from_request_id"),           // self-FK (§5.7)

  wonAt:            timestamp("won_at", { withTimezone: true }),
  lostAt:           timestamp("lost_at", { withTimezone: true }),
  expiredAt:        timestamp("expired_at", { withTimezone: true }),
  cancelledAt:      timestamp("cancelled_at", { withTimezone: true }),
  closedAt:         timestamp("closed_at", { withTimezone: true }), // no_bid

  createdBy:        uuid("created_by").notNull().references(() => users.id),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  statusIdx: index("idx_requests_status").on(t.status),
  clientIdx: index("idx_requests_client").on(t.clientSuggestedId),
  openIdx:   index("idx_requests_open").on(t.status, t.createdAt),   // pipeline board
}));
```

### 5.3 `request_lines` — one route per line; D15 raw preserved; becomes a Direction on win (R2)

```typescript
export const requestLines = pgTable("request_lines", {
  id:             uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId:      uuid("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
  sortOrder:      smallint("sort_order").notNull().default(0),
  originEsr:      char("origin_esr", { length: 6 }).references(() => stations.esrCode, { onDelete: "set null" }),
  destEsr:        char("dest_esr",   { length: 6 }).references(() => stations.esrCode, { onDelete: "set null" }),
  originRaw:      text("origin_raw").notNull(),                  // D15: raw preserved, never invent ESR
  destRaw:        text("dest_raw").notNull(),
  cargoName:      text("cargo_name"),
  etsngCode:      varchar("etsng_code", { length: 8 }),
  wagonsRequested:integer("wagons_requested").notNull(),
  tonnagePerWagon:numeric("tonnage_per_wagon", { precision: 10, scale: 3 }),
  distanceKm:     integer("distance_km"),

  // RANK 1/2: cost-stack terms made explicit (operator inputs; mandatory when party = rns)
  emptyRunParty:      emptyRunParty("empty_run_party"),
  emptyRunCostEstimate:numeric("empty_run_cost_estimate", { precision: 14, scale: 2 }), // net, per wagon
  provoznPayer:       provoznPayer("provozn_payer"),
  provoznEstimate:    numeric("provozn_estimate", { precision: 14, scale: 2 }),         // net, per wagon

  matchedPriceProtocolId: uuid("matched_price_protocol_id").references(() => priceProtocols.id),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  requestIdx: index("idx_request_lines_request").on(t.requestId),
  stationsIdx:index("idx_request_lines_stations").on(t.originEsr, t.destEsr),
}));
```

### 5.4 `request_owner_quotes` — the canonical опрос table (resolves C2; VAT default 22; cost-stack)

> **REVISION (2026-06-06) — enum convention.** The snippet below uses `pgEnum` helpers
> (`ownerQuoteStatus`, `quoteCommitment`, …). The actual codebase house convention is **`text` column +
> `CHECK` constraint, never `pgEnum`** (stated verbatim in `requests.ts`, `directionBindings.ts`,
> `counterpartyContacts.ts`, `counterpartyDocuments.ts`; zero `pgEnum` in `src/lib/db/schema/`). When
> this table is implemented, the **canonical form is `text + CHECK`**, not `pgEnum`. The mail-integration
> work (see [`MAIL_AI_INTEGRATION.md`](./MAIL_AI_INTEGRATION.md)) ships a **minimal `text+CHECK` subset**
> of this table now (status / polledVia / cost / wagons / sourceMessageId) for outbound carrier RFQ; the
> remaining cost-stack/VAT/coverage columns below are added additively when the full sourcing engine
> lands. Treat the field list below as the design target, the enum **mechanism** as superseded.

```typescript
export const requestOwnerQuotes = pgTable("request_owner_quotes", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  requestLineId: uuid("request_line_id").notNull().references(() => requestLines.id, { onDelete: "cascade" }),
  ownerId:       uuid("owner_id").notNull().references(() => counterparties.id, { onDelete: "restrict" }),
  status:        ownerQuoteStatus("status").notNull().default("polled"),

  polledAt:      timestamp("polled_at", { withTimezone: true }),
  respondedAt:   timestamp("responded_at", { withTimezone: true }),

  wagonsOffered: integer("wagons_offered"),
  commitment:    quoteCommitment("commitment").notNull().default("soft"),   // RANK 4: firm vs soft
  ownerGroupId:  uuid("owner_group_id"),                                     // RANK 4: dedupe same park
  possibleDuplicatePark: boolean("possible_duplicate_park").notNull().default(false),

  costPerWagon:  numeric("cost_per_wagon", { precision: 14, scale: 2 }),     // SPOT owner cost, one-off
  currency:      char("currency", { length: 3 }).notNull().default("RUB"),
  rateScope:     rateScope("rate_scope").notNull().default("loaded_only"),   // RANK 1: empty-run handling
  rateBasis:     text("rate_basis").notNull().default("per_wagon_trip"),     // per_wagon_trip|per_ton|per_km|daily
  dailyRate:     numeric("daily_rate", { precision: 14, scale: 2 }),         // RANK 1: when cost = daily×оборот
  expectedTurnoverDays: integer("expected_turnover_days"),

  // VAT per-row (resolves C2/RANK 3) — default 22% (locked SCHEMA_DELTA §9); treatment expresses УСН owners
  vatRate:       numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default(sql`22.00`),
  vatTreatment:  vatTreatment("vat_treatment").notNull().default("inclusive"),

  availFrom:     timestamp("avail_from", { withTimezone: true }),            // RANK 4: window-aware coverage
  availTo:       timestamp("avail_to",   { withTimezone: true }),
  quoteValidTo:  timestamp("quote_valid_to", { withTimezone: true }),        // RANK 5: expiry
  requoteRequestedAt: timestamp("requote_requested_at", { withTimezone: true }),
  ownerConditions: text("owner_conditions"),
  notes:         text("notes"),
  polledVia:     text("polled_via").notNull().default("manual"),             // manual|email|phone|telegram|arq_agent

  accodintoCoverage: boolean("accepted_into_coverage").notNull().default(false),
  priceProtocolId:   uuid("price_protocol_id").references(() => priceProtocols.id), // §2.9 hint only
  promotedToRateId:  uuid("promoted_to_rate_id").references(() => priceProtocolRates.id, { onDelete: "set null" }),

  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt:     timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  lineIdx:     index("idx_owner_quotes_line").on(t.requestLineId),
  ownerIdx:    index("idx_owner_quotes_owner").on(t.ownerId),
  coverageIdx: index("idx_owner_quotes_coverage").on(t.requestLineId, t.accodintoCoverage),
  // RANK 6: cross-request owner exposure (owner + period)
  exposureIdx: index("idx_owner_quotes_exposure").on(t.ownerId, t.availFrom, t.availTo),
  uqLineOwner: uniqueIndex("uq_owner_quote_line_owner").on(t.requestLineId, t.ownerId),
}));
```

### 5.5 `client_quotes` + `client_quote_lines` — versioned котировка; VAT per-row net math

```typescript
export const clientQuotes = pgTable("client_quotes", {
  id:        uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  requestId: uuid("request_id").notNull().references(() => requests.id, { onDelete: "cascade" }),
  version:   integer("version").notNull().default(1),            // re-quote bumps version
  status:    clientQuoteStatus("status").notNull().default("draft"),
  sentAt:    timestamp("sent_at", { withTimezone: true }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  validTo:   timestamp("valid_to", { withTimezone: true }),
  notes:     text("notes"),
  createdBy: uuid("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  requestIdx: index("idx_client_quotes_request").on(t.requestId),
}));

export const clientQuoteLines = pgTable("client_quote_lines", {
  id:            uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  clientQuoteId: uuid("client_quote_id").notNull().references(() => clientQuotes.id, { onDelete: "cascade" }),
  requestLineId: uuid("request_line_id").notNull().references(() => requestLines.id, { onDelete: "restrict" }),
  ratePerWagon:  numeric("rate_per_wagon", { precision: 14, scale: 2 }).notNull(), // client revenue
  currency:      char("currency", { length: 3 }).notNull().default("RUB"),
  rateBasis:     text("rate_basis").notNull().default("per_wagon"),
  rateIncludesProvozn: boolean("rate_includes_provozn").notNull().default(false),  // RANK 2: basis flag
  // VAT per-row (D-PD-3) — default 22%
  vatRate:       numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default(sql`22.00`),
  vatTreatment:  vatTreatment("vat_treatment").notNull().default("inclusive"),
  wagonsQuoted:  integer("wagons_quoted").notNull(),
}, (t) => ({
  quoteIdx: index("idx_client_quote_lines_quote").on(t.clientQuoteId),
}));
```

### 5.6 Partial-unique constraints (one live quote per request)

```sql
-- only one live (sent/accepted) client quote per request; draft re-quotes allowed
CREATE UNIQUE INDEX uq_client_quote_live
  ON client_quotes (request_id) WHERE status IN ('sent','accepted');
```

### 5.7 Changes to existing locked/spine tables — additive, nullable, backward-compatible

```sql
-- back-link orders → source request (nullable: orders may still be created without an RFQ)
ALTER TABLE orders
  ADD COLUMN request_id UUID REFERENCES requests(id) ON DELETE SET NULL;
CREATE INDEX idx_orders_request ON orders(request_id);
-- (R2/M3: identical stance to directions.order_id being nullable; no existing row needs backfill)

-- complete requests → orders back-link now that orders.request_id exists
ALTER TABLE requests
  ADD CONSTRAINT fk_requests_order
  FOREIGN KEY (converted_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- self-FK for re-sourcing thread (RANK 7)
ALTER TABLE requests
  ADD CONSTRAINT fk_requests_cloned_from
  FOREIGN KEY (cloned_from_request_id) REFERENCES requests(id) ON DELETE SET NULL;

-- §2.9: optional explicit promotion of a spot quote into a standing protocol (NEVER automatic)
ALTER TABLE price_protocols
  ADD COLUMN seeded_from_owner_quote_id UUID REFERENCES request_owner_quotes(id) ON DELETE SET NULL;
```

**No other locked table is touched.** `deals`, `wagon_movements`, `report_rows`, `invoices`, `directions`, `direction_*_bindings` are unchanged.

### 5.8 `request_pipeline` read view (live KPI; YAGNI — not materialized until volume demands)

```sql
CREATE OR REPLACE VIEW request_pipeline AS
SELECT
  r.id AS request_id, r.status, r.client_suggested_id, r.valid_until,
  COALESCE(SUM(rl.wagons_requested), 0) AS wagons_requested,

  -- DELIVERABLE coverage (RANK 4/5): live + window-overlap + firm only
  COALESCE(SUM(oq.wagons_offered) FILTER (
     WHERE oq.accepted_into_coverage AND oq.commitment = 'firm'
       AND oq.status IN ('responded','accepted')
       AND (oq.quote_valid_to IS NULL OR oq.quote_valid_to >= now())
       AND oq.avail_from <= rl.period_to AND oq.avail_to >= rl.period_from
  ), 0) AS wagons_deliverable,

  COUNT(DISTINCT oq.owner_id) FILTER (WHERE oq.status IN ('responded','accepted')) AS owners_responded,
  COUNT(DISTINCT oq.owner_id) AS owners_polled
FROM requests r
LEFT JOIN request_lines rl ON rl.request_id = r.id
LEFT JOIN request_owner_quotes oq ON oq.request_line_id = rl.id
GROUP BY r.id;
-- projected_margin (net, basis-normalized, minus empty-run/provozn) is computed CLIENT-SIDE from
-- already-loaded rows (H1: trivial arithmetic, no round-trip) and labeled as planning math (D7/D17).
```

---

## 6. Performance & motion (from visual-direction + design-perf critic)

- **Tokens:** single source of truth = `visual-direction` (`tokens.css`/`typography.css`): dark-default `oklch(12% 0.012 260)` base, amber accent `oklch(78% 0.155 75)`, **Inter + Geist Mono** (fallback IBM Plex Mono), mono `tabular-nums slashed-zero` mandatory on all money/IDs. `component-system §0` palette demoted to anatomy-only (blue brand accent deleted).
- **H1 (drag/INP):** advance-status = **optimistic flip** (transform/opacity only) + background mutation + rollback on failure. Coverage/margin recompute **client-side** from loaded rows. Drag-to-advance desktop ≥1280 only; mobile uses tap + action sheet (no swipe-collision — H4). Prefer `content-visibility:auto` over JS virtualization for ≤~200 rows (sidesteps drag conflict — L2).
- **H2 (contrast):** amber is **accent/CTA fill (dark text on it)**, not money-text on light surfaces. Money stays near-neutral with an amber rail. Compute WCAG/APCA ≥4.5:1 (body) / ≥3:1 (UI) both themes before build.
- **H3 (reduced-motion):** under `prefers-reduced-motion`, replace pulse keyframe with a static solid dot (1ms duration does not stop an opacity *loop*); graduation = cross-fade, no translate.
- **M1:** opaque sticky headers + hairline border, **not** `backdrop-filter: blur` on scrolling stickies.
- **M3:** coverage bar = `transform: scaleX` (label outside) standardized.
- **L1/L3:** VAT util takes a rate arg (no baked `0.22`); preload the single mono weight used for money to avoid CLS on hero numerals.

---

## 7. Locked-decision audit

| Locked | Honored | How |
|---|---|---|
| **D16** (Клиент never auto-filled) | ✅ | `requests.client_suggested_id` + `orders.client_suggested_id` + `directions.client_*_suggested`; conversion never writes confirmed client. RFQ origin = high-quality evidence, still requires operator confirm. |
| **D17 / D8** (money immutable post-close; gated emit) | ✅ | Conversion is pre-deal. Rates flow suggested→confirmed→snapshot-on-deal-match. `projected_margin` is explicitly NOT report margin. |
| **D7** (margin derived on export, both sides present) | ✅ | No stored margin; pipeline margin is a client-side/view planning number, labeled. |
| **D15** (no invented ESR) | ✅ | `request_lines`/quotes carry `*_raw` + nullable resolved ESR FK; resolved via dict. |
| **D-PD-3** (VAT per-row data, unknowns explicit) | ✅ | `vat_rate` + `vat_treatment` per quote/line; default 22%; `not_vat_payer` modeled; no baked constant. |
| **R2 / D-PD-2** (Order 1→N Direction) | ✅ | Conversion creates 1 Order, N Directions (one per accepted line). |
| **H1** (money never auto-accepted; activation blocks `client ≤ owner`) | ✅ | Quote rates land in `*_suggested`; existing activation guard unchanged; pre-sale negative-margin warning added. |
| **§9.2** (ПСЦ = versioned route-keyed contractual table) | ✅ | Spot quotes kept out of `price_protocols`; opt-in promotion only via `seeded_from_owner_quote_id`. |
| **D-PD-10 / P0 list** | ✅ | New tables are additive, not P0; scaffolded at first-use phase. |

---

## 8. ADRs (proposed — flagged for operator approval; none contradict locked physics)

- **ADR-RFQ-1:** Add the pre-order RFQ layer (`requests`, `request_lines`, `request_owner_quotes`, `client_quotes`, `client_quote_lines`) as an additive delta above `orders`. Scaffolded at the phase that first uses it (proposed **P1.6/P1.7**, after manual Direction CRUD, before worker/email). *Approve additive schema + sequencing.*
- **ADR-RFQ-2:** Owner spot quotes are one-off cost evidence, **not** auto-seeded `price_protocols` rates. Promotion is explicit operator action. *Confirm РНС wants a "save as standing rate" button at all.*
- **ADR-D12 (landing/nav):** Default `/` → `/requests` (pipeline-home); two-item tab bar becomes a three-stage funnel nav. *Confirm operator wants Запросы as home — this overrides the locked `/ → /directions` redirect, surface explicitly.*
- **ADR-D19/D20 (tokens):** Dark theme default (deliberate long-session control-board exception to ECC "no default dark"); Geist Mono (fallback IBM Plex Mono) mandatory numeric typeface with `tabular-nums slashed-zero`. *Ratify.*

---

## 9. Open questions (must resolve before margin is trusted for decisions)

- **OQ-1 (empty-run, RANK 1):** Are owner spot quotes **loaded-leg-only** or do they include the порожний return? The entire margin math hinges on this. Default assumed `loaded_only` + explicit operator `empty_run_cost_estimate`.
- **OQ-2 (provozn, RANK 2):** For each deal, who pays the РЖД provozная плата — РНС (gross billing, include in client rate) or client (РНС bills wagon-component only)? Determines `cost_basis` normalization.
- **OQ-3 (VAT, RANK 3):** Owner side default 22% inclusive confirmed? Do РНС-side owners ever quote `без НДС` / УСН (`not_vat_payer`)? Confirm given the 2026 rate context.
- **OQ-4 (blended cost):** Confirm multi-owner cover cost = weighted-avg of accepted firm-window-compatible owners (not single-owner best). Affects the displayed blended number.
- **OQ-5 (sourcing channel):** MVP = manual entry of spot quotes; mailbox/ARQ-assisted owner replies reuse existing ingestion infra later. Confirm manual-first acceptable.

---

## 10. Resolutions of upstream finding conflicts (for the record)

| Conflict | Resolution |
|---|---|
| Owner-quote table specced 3 ways (C2) | One table: `request_owner_quotes`, parented on `request_lines`, `vat_rate` default **22.00** (locked). `owner-sourcing`'s 20% + flat single-route discarded. |
| Single vs multi-route grain (C3) | Line grain (`request_lines`); no `wagon_count` on parent; required by R2 conversion. |
| 3 token systems / palettes (C1) | `visual-direction` is canonical (dark-default, amber, Inter+Geist Mono); `component-system §0` palette → anatomy-only; blue brand accent deleted. |
| Status enum fork (M4) | Superset: `new→sourcing→quoted→{won|lost|no_bid|expired}|cancelled`; closed states collapse to one board lane. |
| Coverage optimism (RANK 1–7) | Deliverable (window+firm+live) coverage; explicit empty-run & provozn terms; net-of-VAT per-row; expiry filtered in one shared predicate; cross-request owner exposure; structured loss + clone thread; no buggy auto-allocator. |

---

**Files referenced (all absolute, none modified):**
`/Users/mishanikhinkirtill/Desktop/SimpleCargo/docs/planning/MVP_PLAN.md`,
`/Users/mishanikhinkirtill/Desktop/SimpleCargo/docs/planning/DB_SCHEMA.md`,
`/Users/mishanikhinkirtill/Desktop/SimpleCargo/docs/planning/DOMAIN_MODEL.md`,
`/Users/mishanikhinkirtill/Desktop/SimpleCargo/docs/planning/SCHEMA_DELTA.md`,
`/Users/mishanikhinkirtill/Desktop/SimpleCargo/docs/planning/PRODUCT_DIRECTIONS.md`.

---

## 11. RECONCILIATION — request INTAKE by client (operator refinement, overrides on conflict)

> Added after the workflow per operator: **requests are sent BY CLIENTS as tables/files**, dropped in,
> auto-organized BY CLIENT, and EXPLODED into one request card PER DIRECTION. Maps onto the existing
> `requests → request_lines` grain; this is an intake + IA addition, not a schema overhaul.

### 11.1 Third drag-drop extraction lane: `client_request`
Add `client_request` to `source_doc_type` (alongside `psc`, `zayavka` — see SCHEMA_DELTA §3). Clients send
heterogeneous Excel tables / files (arbitrary formats, like dislocations). Reuse the SAME pipeline: drop →
object storage → ARQ Python worker → Claude structured-output extraction (once per file, D10) → staged rows
→ operator confirm. Parsing a client request table = the dislocation-normalization problem (many formats),
so reuse header-autodetect + the LLM column-mapping path.

### 11.2 On drop: operator tags the CLIENT (D16), system EXPLODES into per-direction lines
- The operator **labels which client** the dropped file belongs to (manual — never auto-confirmed, D16;
  LLM may suggest into `client_suggested_id`).
- One client file/table holds **many routes** → the extractor emits **one `request` (per client+intake)**
  with **N `request_lines`**, one per route row (`origin→dest`, `wagon_type`, `wagons_requested`, cargo,
  ЕТСНГ, period). Each line is the card that, on win, becomes one Direction (R2). This is exactly the
  existing `requests → request_lines` grain — the upload simply *populates* it instead of manual entry.
- Stations: ESR inline (`(02220)`) seeds the dict directly; bare names resolve via the dict (`*_raw` kept, D15).
- **Idempotency / dedup:** file `content_sha256` (existing `ingested_files` pattern) prevents re-ingesting
  the same file; line-level dedup of overlapping requests from the same client over time keys on
  `(client_id, origin_esr, dest_esr, wagon_type, period)` → update/supersede instead of duplicate cards.

### 11.3 "Запросы" tab is GROUPED BY CLIENT
Revise the §IA board: the top grouping is **per client** (client → that client's per-direction request
cards/lines), each card carrying coverage% / owners-responded / best net cost / projected margin / status
as already specced. A client header row rolls up its lines (total wagons requested, lines won/open).
Filters: by client, status, route, period. (A golden fixture for a real client request table is still
pending from the operator — once provided, add to `examples/` and pin the explode logic to it.)

### 11.4 Phase placement
Manual request entry + by-client board ship first (P1.6/P1.7, with ADR-RFQ-1). The drag-drop
`client_request` extraction lands with the other doc-extraction (ПСЦ/заявка) in **P5** — it is the same
worker+LLM lane. Until then, operator enters request lines manually or pastes a table.

---

## 12. COST MODEL — `tech_trip` vs `rental` (resolves OQ-1, operator-confirmed)

> Operator answer to the empty-run question: there is **no single answer** — owner cost and who bears the
> порожний пробег depend on the **deal cost model**. This is a first-class dimension on every owner quote
> and on the converted Direction/Deal. It drives the honest-margin math (§3).

### 12.1 The two models
| `cost_model` | What РНС pays the owner | Порожний пробег (empty run) | Provozная плата РЖД | Margin formula (per wagon, net) |
|---|---|---|---|---|
| **`tech_trip`** (технический рейс) | **тариф + предоставление** (provision fee, per trip) | **NOT РНС's separate cost** — covered in the owner's tariff / borne by owner | per the deal (typically РНС via ЕЛС on the loaded leg) | `client_rate − (provision + provozn_loaded_if_rns)` |
| **`rental`** (аренда) | **арендная ставка** (rent, руб/вагон/**сутки**) × turnover days | **РНС BEARS IT** — РНС organizes & moves the empty wagon onward | **РНС pays loaded AND empty legs** | `client_rate − (rent_per_day × turnover_days + provozn_loaded + provozn_empty + repositioning)` |

### 12.2 Why this matters
- **Empty-run allocation is derived from `cost_model`**, not asked per quote: `tech_trip` ⇒ empty-run cost = 0 to РНС; `rental` ⇒ empty-run + onward repositioning = РНС cost. (Replaces the standalone `empty_return_party` guess.)
- **Under `rental`, turnover (оборот) is a direct cost driver:** cost rises with every day the wagon is held (rent × days). This ties the verified `оборот` KPI straight to money — faster turnover = fewer rent-days = more margin. The projected-margin view for a rental quote MUST take an expected-turnover input (days), or it is meaningless.
- **Under `tech_trip`,** margin is per-trip and turnover affects only how many trips/month the wagon can do (throughput), not the per-trip cost.

### 12.3 Schema impact (additive)
- `request_owner_quotes` + `directions`/`deals` gain `cost_model` enum `('tech_trip','rental')`.
- `tech_trip` fields: `provision_fee` (предоставление, per wagon/trip), `tariff_payer` ('rns'|'client').
- `rental` fields: `rent_per_wagon_day`, `expected_turnover_days` (for the quote estimate; actuals from `оборот`), `empty_run_cost_estimate`, `provozn_loaded`, `provozn_empty`, `repositioning_cost`, all net + VAT-tagged.
- The §3 `projected_margin` computation branches on `cost_model`; the "excluded terms" warning stays, but for `rental` the empty-run/provozn are REQUIRED inputs (not optional) before a green margin shows.

### 12.4 Open micro-confirm (low impact)
- In `tech_trip`, is **«тариф»** the РЖД provozная (paid to РЖД via ЕЛС) bundled with **предоставление** as one owner invoice, or two separate payables? Affects only AR/invoice line splitting (P4), not the margin number.
