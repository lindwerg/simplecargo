# SimpleCargo — Free RZD Rail-Tariff Calculator: Design Document

> Status: design / planning. Author: lead architect synthesis of 8 adversarially-verified research findings.
> Date: 2026-06-07. Replaces no existing doc; complements `tariff_rates`/`tariff_indexations` already in `src/lib/db/schema/tariffs.ts`.
>
> Conventions in this doc:
> - **CONFIRMED** — verified against a primary source or the repo file directly.
> - **NEEDS-VERIFICATION** — plausible but a skeptic flagged it as dubious / unconfirmed; must be checked against the actual ТР-1 2026 text before it touches the price layer.
> - All ₽ amounts are per-wagon unless stated; all distances are integer km.

---

## 1. Executive Summary

**Can we build a free RZD tariff calculator? Yes — in two clearly separable halves with very different accuracy ceilings.**

1. **Distance (ТР-4)** — buildable to near-exact accuracy, *if and only if* we obtain one external artifact (Книга 3, the transit-point ↔ transit-point distance matrix). Roughly half of the graph (the station→transit "spur" edges) already sits unused in the repo seed CSVs and reconstructs for free. CONFIRMED: 18,065 spur edges, 1,199 transit-point nodes, 99.8% name→ESR resolution.
2. **Tariff (provozная плата, ТР-1 2026)** — buildable but accuracy-bounded by data acquisition. The formula structure (И-scheme infra+traction × class/correction coefficients + В-scheme wagon component, then compounded indexation) is CONFIRMED. The *numeric rate tables and the class coefficient as a (class, distance) lookup* still need to be scraped/parsed; the legacy 0.75/1.0/1.54 scalar is **wrong as a literal formula input** (NEEDS-VERIFICATION → must be a table lookup).

**Realistic accuracy.** Distance: ±0.5% / ±5 km once Книга 3 is loaded verbatim (do NOT synthesize it by graph search). Tariff: target ±5% for КП auto-fill (GREEN), ±10% acceptable-with-flag (YELLOW), beyond = manual. For SimpleCargo's actual business — нерудные/щебень (class 1), полувагон, собственный/арендованный park — the path is the *narrowest and most achievable slice* of the full tariff (own-wagon = pay infrastructure И + порожний, no В component).

**Effort.** Distance engine: ~1–1.5 weeks of build once Книга 3 is sourced (sourcing is the schedule risk, not coding). Tariff engine: ~2–3 weeks including ЕТСНГ class table seed, scheme/belt rate tables, coefficient stack, and validation harness. The work is dominated by **data acquisition and curation**, not algorithm complexity (Dijkstra over ~1,000 nodes is trivial).

**Biggest risk.** The Книга 3 transit↔transit distance matrix is genuinely *absent* from the repo and is the single load-bearing dependency for any multi-section route. Without it the distance graph is disconnected stars and nothing non-trivial computes. Everything else is curation; this is a hard external dependency.

**Recommended first phase.** Phase 1 = parse the existing CSV `field[4]` into a `tariff_edges` spur layer + `tp_node` set (zero external dependency, immediately useful, de-risks the parser), in parallel with a spike to **acquire and shape Книга 3**.

---

## 2. Calculation Model — провозная плата (new ТР-1 2026)

### 2.1 Regulatory baseline (CONFIRMED)

- Прейскурант 10-01 (2003) was superseded on **2026-01-01** by «**Тарифное руководство №1**», approved by **Приказ ФАС России от 06.11.2025 № 894/25**, registered Минюст 22.12.2025 № 84708. Today (2026-06-07) the new doc is in force. CONFIRMED.
- ФАС statement: «основной порядок тарификации сохранится» — the *methodology* (И/В split, distance belts, class adjustment, compounded indexation) is preserved; the 2026 doc re-indexes and integrates 22 years of amendments. So the 10-01 *shape* is reusable; the *numbers* must be the 2026 ones. CONFIRMED.
- The full ТР-1 2026 text is **freely readable** (no paywall) at `sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/` — TOC, Приложение N 1 (~36 tables), Приложение N 2 (tariff schemes). This **corrects** an earlier research headline that claimed all tables are paywalled. Numeric cells are paginated HTML (need page-by-page scraping), not a single export. CONFIRMED.

### 2.2 The general formula (loaded car, повагонная отправка)

```
ПП_безНДС = ( И(i_scheme, L) × K1(class, L) × K3 × K4 × K5 )      ← infrastructure + traction
          + В(v_scheme, L)         [ONLY if wagon = общий/инвентарный парк РЖД]
          + порожний(L, axles)     [ONLY if wagon = собственный/арендованный]
          + Σ доп.сборы            [optional pass-through, see 2.6]
          (× Kминстрой)            [discount, by effective date]
          (× Kконтейнер)           [+5% if container, 2026+]
ПП_итог  = ПП_безНДС × ∏(1 + indexation_i/100)   over applicable indexations
КП line  = ПП_итог × (1 + НДС)     [НДС 22% domestic 2026; 0% export/international]
```

Key structural facts (CONFIRMED): the class/correction coefficients apply to the **И (infrastructure)** component only; the **В (wagon)** component is class-independent and charged *only* for RZD-owned cars. For собственный/арендованный wagons (≈95% of real traffic, and SimpleCargo's case) you pay **И + порожний**, no В.

### 2.3 Schemes (И* / В*)

- **И-schemes** (инфраструктура + локомотивная тяга) — class-dependent. New ТР-1 enumerates **И1…И18** (observed in the TOC). NEEDS-VERIFICATION: the earlier "И1–И7 core, up to ~115–133" framing is **wrong** for ТР-1; treat scheme counts as the observed И1–И18 / В1–В15 until the classifier (new Прил. 7 equivalent) is read cell-by-cell.
- **В-schemes** (вагонная составляющая) — class-independent. New ТР-1 enumerates **В1…В15** (observed). Charged only for общий-парк wagons.
- The mapping `(wagon type, ownership, shipment type) → (i_scheme, v_scheme)` is the classifier. NEEDS-VERIFICATION: not yet extracted cell-by-cell; required to map any real route. This is the single most important *tariff-side* data-extraction task.

### 2.4 Class coefficient K1 — NOT a scalar (NEEDS-VERIFICATION, load-bearing)

The skeptic correction here is critical and overrides the convenient scalar:

- The legacy values 0.75 / 1.0 / 1.54 (1.74 for some class-3 sub-groups) are **DUBIOUS as a literal formula input**.
- In 10-01 Прил. 3, class adjustment is a *set of distance- and weight-dependent tables* (e.g. class-1 ranges ~0.75 at 1–1200 km down to ~0.55 at 5001+ km). New ТР-1 applies class adjustments interacting with a distance table (Табл. 5) under a **"max-of-two" rule** (point 16.7.3), plus fixed own-gondola class factors (~0.9346 / 0.9592 / 0.9774).
- **Decision:** model K1 as a `(class, distance[, weight]) → coefficient` lookup with the max-of-two rule, NOT three constants. The proposed `class_coeff` and `distance_corr` tables (§4) must be cross-applied per ТР-1 point 16.7. Building K1 as scalars *will produce wrong провозная плата* for class 1 and class 3 (class 2 = 1.0 is the only safe constant).
- For SimpleCargo's нерудные/щебень = **class 1** (CONFIRMED), so the class-1 distance table is the one that matters first.

### 2.5 Cargo class derivation from ЕТСНГ (CONFIRMED)

- Class (1/2/3) is **not** encoded in the 6-digit ЕТСНГ code — it is a separate per-position attribute in **Таблица №1** «Перечень позиций ЕТСНГ с указанием тарифных классов и МВН», carried forward into ТР-1 2026. CONFIRMED 4-column shape: код → наименование → класс → МВН (тонн).
- Derivation = pure dictionary lookup `etsngCode → {class, mvn}`.
- **МВН (минимальная весовая норма)** sets the повагонная floor: `chargeable_tons = max(actual_weight, МВН)`. МВН is multi-form: a single number, a per-wagon-type triplet (`кр, пв-г/п, пл-46`), or `г/п` = full carrying capacity. Must be stored as raw token + parsed structured map, never a bare integer.
- Our cargo (CONFIRMED, all class 1): 231000 (земля/песок/глина), 232087 (гравий), 232395 (щебень гранитный), 232408 (щебень из гравия), 232431 (щебень н.п.), 281000 (цемент, МВН=г/п). Default нерудные → class 1, МВН = г/п.
- **Best parseable source:** `railwagonlocation.com/ru/etsng-codes.php?start=0` (4-col table, paginated `?start=` step 300). NEEDS-VERIFICATION: sample-check railwagonlocation class/МВН values against the authoritative 2026 `consultant.ru` LAW_522347 Таблица №1 before seeding — they may be legacy 10-01.

### 2.6 Coefficients and indexation stack

Indexation chronology (apply multiplicatively, compounding by effective date):

| Year in force | What | % / coef | Effective from | Status |
|---|---|---|---|---|
| 2025 | base indexation | **+13.8%** | 2024-12-01 | CONFIRMED (ФАС №862/24, №863/24; Прав. №3248-р) |
| 2026 | base indexation | **+10.0%** | **2025-12-01** | CONFIRMED (note: NOT 2026-12-01 — operator note had wrong date) |
| 2026 | порожний пробег univ. ПС, permanent | **×1.1** | 2026-01-01 | CONFIRMED |
| 2026 | container (excl. термоконтейнеры) | **+5%** | 2026-01-01 | CONFIRMED as +5%; exact in-year date NEEDS-VERIFICATION (was draft order) |
| — | «+коэф 1.01 с 2026-03-01» | — | — | **DO NOT SEED** — no primary order; 1.01 is the safety надбавка already baked into the indexed base since 2024-12-01 |
| 2025 | минерально-строительные грузы (discount) | ×0.9492 | 2025-01-01 (→ 2025-12-31) | CONFIRMED; **not extended into 2026** → from 2026-01-01 do not apply |

Pre-2025 chronology (2022 +5.8%, 2022-06 +11%, 2023 ~+10%, 2023-12 +10.75%) is medium-confidence / partly researcher-computed — NEEDS-VERIFICATION but rarely matters since current КП use a 2026 as-of date.

Special coefficients (apply to И before summing with В, except indexation/НДС which are last):
- K3 commodity correction, K4 отправочный (повагонная/групповая/маршрутная), K5 coal/timber/metals exclusive — structure CONFIRMED, exact ranges NEEDS-VERIFICATION.
- Own/rented-wagon coefficient: 10-01 used ~0.85 (Раздел 2); ТР-1 2026 says own-wagon = единые тарифы × коэффициенты *without* group-В, but the exact 2026 numeric coefficient was NOT retrieved. NEEDS-VERIFICATION — directly affects the щебень/полувагон own-wagon path.

### 2.7 НДС (CONFIRMED)

ТР-1 tariffs are **без НДС** (net). 2026 domestic НДС = **22%** (raised from 20% on 2026-01-01); export/international often 0%. Repo `tariff_rates.vatInclusive` default `'no'` is correct; pricing schema already defaults `vatRate=22`. Apply НДС last, on the без-НДС total, conditioned on тип сообщения.

### 2.8 Full КП price composition (5 layers — compute vs enter)

| Layer | Component | Source | Repo home |
|---|---|---|---|
| 1 | РЖД провозная плата (И×K + порожний [+ В if общий парк]) | **COMPUTE** (this calculator) | `tariff_rates.baseAmount` today is a remembered all-in base — must be re-scoped to Layer-1-only |
| 2 | Вагонная составляющая оператора (deregulated market rate: ₽/wagon-trip OR ₽/wagon/day × оборот) | **ENTER** | `directions.rateOwner` / ПСЦ rate lines; `cost_model` tech_trip vs rental |
| 3 | Доп.сборы (ТР-3 / ТР-1 §сборы: подача-уборка, взвешивание, охрана, хранение) | **ENTER / pass-through** (usually omitted for inert stone) | not modeled — optional add-ons |
| 4 | НДС 22% | **COMPUTE** (flat %) | `vatRate` |
| 5 | Экспедиторская маржа (commission) | **ENTER** (`rateClient − rateOwner`) | `directions` |

**The conflation gap (CONFIRMED real):** `tariff_rates.baseAmount` today is an operator-entered all-in base that can silently bake in Layer-2 and margin. For the *carrier-quote-check* use case to work, the computed number must be **Layer-1 only (РЖД tariff, без НДС, без operator wagon rate)** — that is what we compare a carrier's РЖД pass-through against. See §4 for the re-scoping decision.

---

## 3. Distance Graph — ТР-4 algorithm + CSV reconstruction

### 3.1 Algorithm (CONFIRMED verbatim, studfile §4.1)

`L_T = l1 (origin → nearest ТП, Книга 2 col.5) + L_K (ТП↔ТП, Книга 3) + l3 (dest-ТП → dest, Книга 2)`.

- Same участок: `L_T = l2 − l1` (subtraction, eq 4.1) — needs Книга 1.
- Adjacent участки sharing a node: `L_T = l1 + l2` (eq 4.2) — needs Книга 1.
- General transit case: eq 4.3 above.
- **Multiple ТП:** col.5 lists all nearest ТП with spur km; enumerate every (origin-ТП_i × dest-ТП_j) pair and **take the minimum total** — O(m×n) candidates.
- Книга 3 is already a curated shortest distance «без обходных и соединительных ветвей», keyed by the alphabetically-first ТП (symmetric/upper-triangular). **PIN L_K to the published Книга-3 value — do NOT re-derive it by Dijkstra over a denser graph** (would find mathematically shorter but tariff-illegal paths).
- **Moscow узел +54 km, SPb узел +25 km** for cross-line moves. CONFIRMED with nuance: the +54 is *conditional* — NOT added if the wagon exits via the same Moscow-узел line it entered (passenger = +20). Encode same-line exclusion, not a flat adder. NEEDS-VERIFICATION: full list of other узлы with fixed distances.
- Rounding: «1–499 м не принимают, 500 м и более округляют до полных километров» (round-half-up at 500 m). Table values are whole km, so this only bites synthesized segments.
- Порожний пробег uses the **identical** distance graph; only the price layer differs (per-axle scheme, preceding-haul class, ×1.1). CONFIRMED.
- Cross-border (CIS): international distance = sum of tariff distance within each administration, segmented at the border crossing.

### 3.2 CSV reconstruction — REAL statistics (CONFIRMED, re-parsed with a quote-aware parser)

The repo CSVs (`scripts/seed-data/rzd-stations-20231230.csv` `;`-delimited w/ header; `cis-stations-20201230.csv` `,`-delimited, no header) carry `field[4]` «Транзитные пункты» as a **clean discriminated union**:

- Literal `"ТП"` → this station *is* a transit point. **RZD 572 + CIS 627 = 1,199 ТП nodes** (996 distinct normalized names). These rows have NO neighbor list.
- A comma-list of `Name-km` → nearest ТП + spur km (radial spur edges). 0 rows mix the two.

Verified statistics:
- Total rows: RZD = 12,991 data (12,992 incl header); CIS = 8,475 (no header — line 1 is data).
- Rows yielding an **actual spur list**: RZD **5,625 (43.3%)**, CIS **3,982 (47.0%)**. (The earlier 47.7%/54.4% figures were `spur + ТП` mixed and are wrong; the lower numbers are correct.)
- **Spur edges total: 18,065** (CONFIRMED exact). Bad-km tokens = 0 after branching on `"ТП"` first → km-parse 100% reliable.
- Spur-km verified: `"1268 км (БП.)"` → `Кандалакша-91, Кола-171`; `Кандалакша (эксп.)` (ESR 015701) → `Кандалакша-0, Мурманск-272` (`-0` = own ТП); bare `Кандалакша` (ESR 014906) flagged `ТП`.
- Name shape: 100% of RZD col-5 tokens match `^name-\d+$` (multi-hyphen names parse via `rsplit('-',1)`, e.g. `Комсомольск-Сортировочный-216`).
- TP name→ESR resolution: **836 distinct referenced names, 834 (99.8%) matched**; only 2 unmatched (`КУНЦЕВО I`, `ВИТЕМЛЯ`). 92.6% of referenced names are also `ТП`-flagged (cross-check).
- Homonyms: **280 names map to >1 ESR**. Tie-break "prefer the `ТП`-flagged row" resolves ~170; **~110 stay ambiguous** → road-aware tie-break + manual curation list.
- **Residual:** RZD 6,794 (52.3%) + CIS 3,866 (45.6%) ≈ **10,660 rows** with neither spur list nor `ТП` flag — over half of all stations. Needs a fallback/quarantine strategy (`stations.isQuarantined` exists) before КП auto-fill is trustworthy. This is *larger* than the homonym work item.

**Parser warning (CONFIRMED):** a naive `split(',')` corrupts the 627 CIS ТП rows (embedded commas in administration names, e.g. `ЗАО "Южно-Кавказская железная дорога"`). **Reuse the repo's existing quote-aware `parseCsvLine` and `normalizeStationName`** in `src/lib/db/seed/stations.ts` (which currently reads only fields[0]/[2]/[3] and discards field[4]); do not re-implement.

### 3.3 The gating gap (CONFIRMED HIGH)

- **Книга 3 (ТП↔ТП, 1,199-node matrix) is entirely absent** — all ТП rows have empty neighbor lists. Spur edges are radial; they give zero ТП↔ТП adjacency. Без Книга 3 the graph is disconnected stars and **no inter-section route computes**. This is THE blocker.
- Sources to digitize Книга 3 (text confirmed to exist; parseability to graph edges NEEDS-VERIFICATION): `docs.cntd.ru/document/901918296` (МПС приказ №55), `base.garant.ru/187381/` (and base/5367457), `tr4.info/tp/` (per-road ТП tables, 43 administrations).
- **Книга 1** (участок ordinal + cumulative km) for same/adjacent-section subtraction is also NOT in the CSVs. Intra-section pairs fall back to a (slightly long) spur+ТП route until Книга 1 is digitized.

### 3.4 Golden distance twin (CONFIRMED)

`rlw.gov.ru` open data publishes the same Книга 1/2 station→узел layer as a downloadable CSV: `https://rlw.gov.ru/opendata/7708525167-tarifstations/data-20231012-structure-20180312.csv` — **28,586 rows** (verified by download, 4.42 MB), columns `Код станции; Наименование станции; Код узла; Название узла; Расстояние; Участок; Линия; Дорога`. Use it as an *independent offline check* of leg-1/leg-3 spurs. Caveats: it does NOT contain Книга 3; encoding is double-mojibake (handle carefully); dataset is 2023-10, valid-through 2025-07-29 (already expired as of today) — Layer-C drift watch needed.

### 3.5 Accuracy expectation

- Leg 1 + Leg 3 (spurs): ~exact (official km straight from col.5).
- Leg 2 (L_K): exact ONLY to the extent Книга 3 is loaded verbatim; узел adders (54/25, conditional) and §2 «особые/кратчайшие расстояния» exceptions override the graph and must be tabled. Synthesizing L_K → material divergence (tens to hundreds of km). Tolerance target ±0.5% / ±5 km (whichever larger); anything worse is a graph defect, not absorbable tolerance.

---

## 4. Data Model — Postgres / Drizzle

**Reuse as-is:** `tariff_rates` and `tariff_indexations` (`src/lib/db/schema/tariffs.ts`, CONFIRMED present) and the existing `stations` geo schema (`esrCode` PK, `isQuarantined`).

**Re-scope decision (CONFIRMED needed):** keep `tariff_rates` as the **operator-remembered override / fallback** AND the **carrier-quote-check anchor**, but redefine its semantics to **Layer-1 (РЖД tariff, без НДС, без operator wagon rate)**. The new computed engine writes its output into the *same shape* (or a sibling `rzd_tariff_cache`) so `resolveTariff()` precedence is: explicit operator-remembered row > computed engine > null. This preserves the existing `resolve.ts` / `repository.ts` / `schema.ts` path.

### 4.1 Distance graph tables (ADD)

```sql
-- transit points (graph vertices). Seed from CSV rows where field[4] == 'ТП'.
tp_node(
  esr_code  char(6) PK references stations(esr_code),
  name      text,
  road_code text,
  is_border boolean default false,
  country   text                       -- 'RF' | CIS admin
)  -- ~1,199 rows

-- unified edge table (spur radial + backbone Книга 3). Matches ON CONFLICT DO NOTHING seed pattern.
tariff_edges(
  from_esr char(6) references stations(esr_code),
  to_esr   char(6) references stations(esr_code),
  km       integer not null check (km >= 0),
  layer    text not null check (layer in ('spur','backbone')),
  PRIMARY KEY (from_esr, to_esr, layer)
)  -- ~18,065 spur (free) + few-thousand backbone (Книга 3, MUST source)
   -- index on from_esr; store backbone with from_esr < to_esr (symmetric)

-- узел fixed-distance overrides (conditional same-line exclusion logic in code).
hub_fixed_distance(
  hub_name text, from_line text, to_line text, km integer,
  PRIMARY KEY (hub_name, from_line, to_line)
)  -- Moscow 54, SPb 25, … (multi-node city decomposition reconciled in code)

-- §2 особые/кратчайшие расстояния hard overrides (precedence over computed sum).
special_distance(
  a_esr char(6), b_esr char(6), km integer,
  PRIMARY KEY (a_esr, b_esr)
)
```

### 4.2 ЕТСНГ + class table (ADD)

```ts
// src/lib/db/schema/etsng.ts
etsng(
  code        varchar(6) PK,                 // "232431"
  name        text not null,
  tariffClass integer not null,              // CHECK 1..3
  mvnRaw      text,                           // "кр, пв-г/п, пл-46" | "40" | "г/п"
  mvnByWagon  jsonb,                          // { kr?, pv?, pl?, default? } each number | "gp"
  groupCode   varchar(2),                     // "23"
  sourceUrl   text, fetchedAt  timestamp
)  // ~2,000 rows; index on tariffClass, name
```

### 4.3 Rate-scheme + coefficient tables (ADD)

```sql
tariff_scheme(scheme_code PK,  -- 'И1'..'И18','В1'..'В15'
              kind text check (kind in ('I','V')),
              class_dependent boolean, description text)

wagon_scheme_map(wagon_type, ownership text,  -- 'rzd' | 'own'
                 shipment_type,
                 i_scheme_code, v_scheme_code,  -- v null for own wagons
                 PK(wagon_type, ownership, shipment_type))  -- from new Прил.7

tariff_rate_belt(scheme_code, dist_from_km, dist_to_km, rate_rub,
                 PK(scheme_code, dist_from_km))  -- one row per пояс дальности

-- K1 as a (class, distance) lookup — NOT a scalar (see §2.4)
class_coeff(freight_class, dist_from_km, dist_to_km, k1,
            PK(freight_class, dist_from_km))
distance_corr(dist_from_km, dist_to_km, k_table5,
              PK(dist_from_km))   -- long-haul taper; max-of-two with class_coeff per pt 16.7.3
empty_run_scheme(axles, dist_from_km, dist_to_km, rate_rub)  -- per-axle порожний
```

### 4.4 Coefficient stack table (ADD — `tariff_indexations` cannot represent these)

CONFIRMED: `tariff_indexations` has no porozhny/container/minstroy discriminator and no pct-vs-coef kind. Add:

```sql
tariff_coefficients(
  label text, kind text check (kind in ('index','coef')),
  multiplier numeric(8,4),         -- 1.1, 1.05, 0.9492, …
  applies_to text check (applies_to in ('all','porozhny','container','minstroy','class')),
  applies_to_class smallint,       -- when applies_to='class'
  effective_from timestamptz, effective_to timestamptz
)
```

### 4.5 Validation table (ADD, optional, Phase 8)

```sql
tariff_validation_runs(id, route_o_esr, route_d_esr, etcng, wagon, as_of_date,
  ref_source, ref_dist_km, our_dist_km, ref_tariff_rub, our_tariff_rub,
  dist_delta_pct, tariff_delta_pct, verdict, fetched_at)
```

---

## 5. Module / File Plan

Repo conventions (CONFIRMED from `src/lib/tariffs/`): pure logic separate from repository I/O; Zod schemas in `schema.ts`; Drizzle repos in `repository.ts`; resolve logic in `resolve.ts`; Vitest co-located (`resolve.test.ts`); files ≤800 lines.

### CREATE

```
src/lib/db/schema/etsng.ts            // etsng table (§4.2)
src/lib/db/schema/tariffGraph.ts      // tp_node, tariff_edges, hub_fixed_distance, special_distance
src/lib/db/schema/tariffSchemes.ts    // tariff_scheme, wagon_scheme_map, tariff_rate_belt,
                                      //   class_coeff, distance_corr, empty_run_scheme, tariff_coefficients

src/lib/distance/parseTransit.ts      // parseTransitField(field4): discriminated union → spur|tp
                                      //   reuses parseCsvLine + normalizeStationName from seed/stations.ts
src/lib/distance/graph.ts             // buildGraph(edges), in-memory backbone subgraph loader
src/lib/distance/dijkstra.ts          // pure shortest-path over backbone (pin to Книга-3 weights)
src/lib/distance/computeDistance.ts   // computeDistance(orig,dest,opts): full ТР-4 routine (§3.1)
src/lib/distance/repository.ts        // edge/tp/hub/special queries (Drizzle)
src/lib/distance/schema.ts            // Zod: DistanceInput, DistanceResult
src/lib/distance/computeDistance.test.ts  // golden: Серпухов→Ревякино=74, …→Печора=1850

src/lib/tariff/computeTariff.ts       // computeTariff(): the engine (signature below)
src/lib/tariff/classLookup.ts         // etsng → {class, mvn}; resolveMvn(mvnByWagon, wagonType)
src/lib/tariff/schemeResolve.ts       // (wagon,ownership,shipment) → (iScheme,vScheme); belt snap
src/lib/tariff/coefficients.ts        // K1(class,L) max-of-two, indexation compounding, coef stack
src/lib/tariff/repository.ts          // scheme/belt/coeff queries
src/lib/tariff/schema.ts              // Zod: TariffInput, TariffBreakdown
src/lib/tariff/computeTariff.test.ts  // golden routes (§7)

scripts/seed/etsng.ts                 // scrape/seed railwagonlocation (sample-verify vs LAW_522347)
scripts/seed/tariffGraph.ts           // CSV field[4] → tp_node + spur edges; Книга 3 → backbone
scripts/seed/tariffSchemes.ts         // sudact ТР-1 scrape → schemes/belts/coeffs
scripts/validate/tariffCrossCheck.ts  // Phase 8 Playwright vs gruzivagon (weekly, off-CI)
```

### MODIFY

```
src/lib/db/seed/stations.ts           // call parseTransitField on field[4] (currently discarded)
src/lib/tariffs/resolve.ts            // resolveTariff precedence: remembered > computed > null
src/lib/tariffs/schema.ts             // mark tariff_rates result as Layer-1 (РЖД-only) semantics
src/lib/documents/proposalKp.ts       // compose visible «Ставка» = (Layer1_computed + Layer2 + opt Layer3) × (1+НДС) + margin
src/components/requests/KpDocument.tsx // optional breakdown rows; store composition internally for quote-check
```

### computeTariff() signature + precedence

```ts
// src/lib/tariff/computeTariff.ts
interface TariffInput {
  originEsr: string; destEsr: string;
  wagonType: string;                 // canonical (src/lib/wagons)
  ownership: 'rzd' | 'own';
  shipmentType: 'wagon' | 'group' | 'route';
  etsngCode: string;                 // → class + МВН
  actualWeightTons: number;
  axles?: number;                    // for порожний
  asOfDate: Date;                    // drives indexation compounding
  traffic: 'domestic' | 'export' | 'import';  // НДС 22% vs 0%
  emptyReturn?: boolean;             // own-wagon порожний leg
}

interface TariffBreakdown {
  distanceKm: number;
  iComponent: number; vComponent: number; emptyRun: number; surcharges: number;
  preIndex: number; indexFactor: number; postIndex: number;
  vatRate: number; total: number;
  tariffClass: 1 | 2 | 3; chargeableTons: number;
  source: 'computed' | 'remembered'; confidence: 'green' | 'yellow' | 'red';
  warnings: string[];                // e.g. "Книга 3 edge missing", "K1 table fallback"
}

async function computeTariff(input: TariffInput): Promise<TariffBreakdown>;
```

**Precedence vs operator-remembered `tariff_rates`:** `resolveTariff()` returns an explicit operator-remembered Layer-1 row when one exists (exact route+wagon+class match) — operator override always wins; otherwise it calls `computeTariff()`; if the engine cannot resolve (missing Книга 3 edge / missing scheme map), it returns `null` with a warning rather than a guessed number. КП auto-fill consumes only `green`; `yellow` shows with a «проверьте» flag; `red`/null forces manual entry.

---

## 6. Integration

- **КП generation (`proposalKp.ts` / `KpDocument.tsx`):** for a repeat route with a remembered Layer-1 base, behavior is unchanged. For a new route, `computeTariff()` auto-fills the провозная (Layer 1); the operator adds Layer-2 (wagon rate from `directions.rateOwner` / cost_model) and margin; the visible «Ставка» = `(Layer1 + Layer2 + optional Layer3) × (1+НДС)`. Store the breakdown internally even if the КП shows a single bundled rate.
- **Carrier-quote checking:** compute the Layer-1 РЖД tariff for the carrier's stated route/wagon/class/date and compare against the carrier's РЖД pass-through line. GREEN/YELLOW/RED per §7 tolerance. This is *why* `tariff_rates` must be Layer-1-scoped — comparing against an all-in remembered rate would give false reds.
- **Directions / trades:** distance + computed Layer-1 feed margin analytics (`rateClient − rateOwner`); for `rental` cost_model, `оборот` drives Layer-2 cost (`rent × turnover_days`) — entered, never computed.

---

## 7. Validation

### Tolerance spec
- **Distance:** PASS if `|our − ref| ≤ max(5 km, 0.5%)`. Worse = graph defect to fix, not absorb.
- **Tariff:** GREEN (auto-fill) ≤ 5% AND distance passes; YELLOW (show + flag) 5–10%; RED (manual) > 10% or distance fail. Always compare same basis: per-wagon, без НДС, same as-of date, same ownership, same class.

### Golden routes (щебень class-1, полувагон unless noted)

| # | Route | Cargo (ЕТСНГ) | Reference | Status |
|---|---|---|---|---|
| 1 | Серпухов → Ревякино | 232395 | **74 km** (same-section subtraction) | CONFIRMED hard-assert (tr4.info) |
| 2 | Москва-Южный Порт → Печора | 232395 | **1850 km** (1601+249) | CONFIRMED hard-assert (tr4.info) |
| 3 | Москва-узел → СПб-узел | 232395 | node-fixed 54/25 sanity | anchor |
| 4 | Качканар (773008) → Лужская (076300) | 232395 | dist+tariff | NEEDS live ref run |
| 5 | Новокузнецк (860102) → Лужская | 232087 | long-haul stress | NEEDS live ref run |
| 6–15 | Урал/Сибирь/CIS routes (§ research table) | 231000/232408/232431 | dist+tariff | NEEDS live ref run |

CONFIRMED: distance anchors 74 km and 1850 km are real (from TR-4 worked examples). All other reference *numbers* are placeholders until one live capture run is executed.

### Harness (two layers)
- **Layer A — offline distance golden (Vitest, every commit):** fixture `scripts/seed-data/golden-distances.json` from rlw.gov.ru spurs + tr4.info hard-asserts; deterministic, no network.
- **Layer B — weekly tariff cross-check (Playwright, off-CI):** drive `gruzivagon.info/tariff` (free, no login, but image-captcha + queue). NEEDS-VERIFICATION: the reverse-engineered AJAX contract (`POST /components/ajax/ajax.php?task=PutTariff`, 13-field payload, `md5(JSON)` hash, GetStation/GetETCNG, queue) was *not* independently confirmed — re-capture via network tab before building. Also NEEDS-VERIFICATION: whether gruzivagon uses ТР-1 2026 or legacy 10-01 (affects systematic offset). Alta/r-tariff are login-gated → unusable for automation.
- **Layer C — monthly drift watch:** re-download rlw.gov.ru, diff spurs, open a task on change.

---

## 8. Phased Implementation Plan

Each phase is independently shippable. Dependencies noted.

**Phase 0 — Spike: source Книга 3 (parallel, no code).** Confirm a parseable Книга 3 (ТП↔ТП) source and shape it into `(a_esr,b_esr,km)`. *Gating for all distance-on-real-routes work.* Also confirm Книга 1 availability. **Biggest schedule risk lives here.**

**Phase 1 — Spur graph from CSV (no external dep).** CREATE `tariffGraph.ts` schema + `parseTransit.ts`; MODIFY `seed/stations.ts` to populate `tp_node` (1,199) + spur edges (18,065). Reuse quote-aware parser. Curate the ~110 ambiguous homonyms + quarantine the ~10,660 residual. Ship: spur lookups + ТП node set. *No dep.*

**Phase 2 — Distance engine.** CREATE `graph.ts`, `dijkstra.ts`, `computeDistance.ts`, `repository.ts`, `schema.ts` + golden tests (74/1850 hard-asserts). Load Книга 3 backbone (from Phase 0) + hub overrides (54/25 conditional). Ship: `computeDistance(orig,dest)`. *Depends on Phase 0 + 1.*

**Phase 3 — ЕТСНГ class seed.** CREATE `etsng.ts` schema + `seed/etsng.ts` + `classLookup.ts`. Sample-verify vs LAW_522347. Default нерудные → class 1, МВН=г/п. Ship: `etsng → {class, mvn}`. *No dep (parallel with 1–2).*

**Phase 4 — Tariff scheme + coefficient tables.** CREATE `tariffSchemes.ts` schema + `seed/tariffSchemes.ts` (sudact ТР-1 scrape: schemes И1–И18/В1–В15, belts, `class_coeff` as (class,L) table, `distance_corr`, `wagon_scheme_map`, `empty_run_scheme`). Seed `tariff_coefficients` (порожний 1.1, container 1.05; NOT 1.01; minstroy expired). *Depends on Phase 0 sourcing strategy; data-extraction heavy.*

**Phase 5 — Tariff engine.** CREATE `computeTariff.ts`, `schemeResolve.ts`, `coefficients.ts`, `tariff/repository.ts`, `schema.ts` + golden tests. Implement K1 max-of-two, indexation compounding, own-wagon (И + порожний, no В), НДС 22%/0%. Ship: `computeTariff()` → Layer-1 РЖД tariff. *Depends on 2,3,4.*

**Phase 6 — resolve precedence + re-scope.** MODIFY `resolve.ts` (remembered > computed > null), re-scope `tariff_rates` semantics to Layer-1. Ship: unified resolution. *Depends on 5.*

**Phase 7 — КП + quote-check integration.** MODIFY `proposalKp.ts`, `KpDocument.tsx`. Auto-fill провозная (green only); carrier-quote-check compare. Ship: КП auto-fill + quote check. *Depends on 6.*

**Phase 8 — Validation harness.** CREATE Layer A (Vitest golden — can land with Phase 2), Layer B (Playwright gruzivagon, after AJAX re-capture), Layer C (drift). Ship: continuous accuracy monitoring. *Layer A depends on 2; B/C on 5.*

---

## 9. Risks & Open Questions (consolidated)

**CRITICAL / gating**
1. **Книга 3 absent (HIGH, CONFIRMED).** ТП↔ТП matrix not in repo; spurs are radial; no inter-section route computes without it. Source parseability (cntd/garant/tr4.info) NEEDS-VERIFICATION. *Mitigation: Phase 0 spike before committing distance timeline.*
2. **K1 is not a scalar (NEEDS-VERIFICATION, load-bearing).** Must be a (class, distance[, weight]) max-of-two lookup; scalars 0.75/1.54 corrupt class-1/class-3 provozная. *Class 2 = 1.0 only safe constant.*
3. **Scheme classifier (new Прил.7) not extracted.** `wagon_scheme_map` cannot be built until read cell-by-cell; required to map any real route. И1–И18/В1–В15 counts observed but NEEDS-VERIFICATION.

**HIGH**
4. **`tariff_rates` conflation (CONFIRMED).** Today an all-in remembered base; must be re-scoped to Layer-1 (РЖД-only) or carrier-quote-check gives false reds. Product decision: bundled vs decomposed «Ставка» in КП — needs operator input.
5. **Own/rented-wagon 2026 coefficient unknown (NEEDS-VERIFICATION).** 0.85 is legacy 10-01; ТР-1 2026 numeric not retrieved — directly hits the щебень/полувагон own-wagon path that dominates real КП.
6. **Residual ~10,660 stations (CONFIRMED).** Over half have neither spur nor ТП flag — fallback/quarantine strategy needed before auto-fill is trusted (bigger than the homonym item).

**MEDIUM**
7. **Distance-belt breakpoints (NEEDS-VERIFICATION).** Exact пояса дальности steps not extracted free; needed to snap L to a belt row. Parse from sudact ТР-1.
8. **ЕТСНГ source vintage (NEEDS-VERIFICATION).** railwagonlocation may be legacy 10-01; sample-verify vs LAW_522347; МВН multi-form parser must handle triplets/г-п.
9. **gruzivagon AJAX contract + ТР-1-vs-10-01 (NEEDS-VERIFICATION).** Layer-B harness depends on an unconfirmed reverse-engineered API; re-capture before building. ±5% tariff tolerance is plausible but UNVALIDATED against any real delta.
10. **~110 ambiguous homonyms (CONFIRMED).** Road-aware tie-break + manual curation pass before trusting auto-fill.

**LOW**
11. Container +5% exact in-year date (was draft); «1.01 с 2026-03-01» **DO NOT SEED** (no primary order). 2 unmatched TP names + 1 corrupt CIS row (`Кимперсай` ESR "0" → drop). rlw.gov.ru encoding double-mojibake; dataset expired 2025-07-29. Full list of узлы beyond Moscow/SPb and §2 особые расстояния exceptions un-enumerated. Pre-2025 indexation chronology medium-confidence (rarely matters for 2026 as-of КП).
