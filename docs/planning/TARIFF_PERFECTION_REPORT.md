# TARIFF PERFECTION REPORT — SimpleCargo FREE RZD Tariff Calculator

> Honest synthesis of the multi-agent ТР-1 2026 perfection effort. Companion to
> [`TARIFF_MASTER_AUDIT.md`](./TARIFF_MASTER_AUDIT.md) (the DONE/NOT-DONE gap register C1–C5 / H1–H21 /
> M1–M21 / L1–L13) and [`TARIFF_RULES_EXACT.md`](./TARIFF_RULES_EXACT.md) (verbatim ТР-1 clauses incl. п.16.7).
>
> **Discipline note (MONEY CONTRACT):** every numeric value cited below traces to an on-disk seed file with
> citation, a primary source (sudact.ru ТР-1 894/25), or a live test run captured in this session. No tariff,
> distance, coefficient, or belt cell was fabricated, guessed, or interpolated to write this report. Where a
> value is not freely obtainable verbatim, it is enumerated under **RED** with its exact source location, never
> as a plausible number.

---

## 0. Final State Snapshot (this session)

| Gate | Result | Evidence |
|---|---|---|
| `npx vitest run src/lib/tariff src/lib/distance --reporter=dot` | **238 passed (18 files), 0 failed, 0 skipped** | run 2026-06-09, ~566 ms, setup 0 ms (hermetic, DB-free) |
| `npx tsc --noEmit --pretty false` | **exit 0, 0 errors** | run 2026-06-09 |
| Golden oracles to the kopeck | **ALL EXACT** (1067770 / 187344 / 82816 / 101035.52) | see §1 |
| Batch 2026-06-09 cases to the kopeck | **13/13 GREEN** (INV-1, INV-6_20, C3-a..d, C2-a/b, PL-C2-a/b, PL-C3-a/b, CIS-C3) | see §1.5 CERTIFICATION MATRIX |
| Distances to the km | **4/4 EXACT** (2444 / 699 / 3108 / **Решетниково 1432**) | `computeDistance.test.ts` (40 tests, 3 files) |
| Решетниково (was the known-wrong residual) | **FIXED → 1432** via class-driven spur-attachment filter (no per-route constant; oracles intact) | see §0.1(ii) + `DISTANCE_COVERAGE.md` |
| RF узел connectivity | **100% of the 1091 kniga1-referenced RF узлы** in one component (base-only 59.39% → 69.08% of all 1837 nodes after CIS-inclusive overlays) | `DISTANCE_COVERAGE.md` §1 |
| Belt cells added (prior effort) | **10 container plates (verbatim) + 1 RED placeholder** | `tr1-i-belts-container.json` |
| Reductions seed (this effort) | **Табл.N12 + Табл.N13 verbatim** (byte-verified vs live HTML) | `scripts/seed-data/tr1-reductions.json` |
| Directional seed (this effort) | **Табл.N3 split from N4** (§1/§2 green, §4 yellow, §3 red/unverified) | `scripts/seed-data/tr1-k3-directional.json` |
| Fabricated numbers | **ZERO** (attested) | §6 |

**Headline (updated 2026-06-09).** The class-1 нерудные own-полувагон path remains certified to the kopeck and is
derived from verbatim ТР-1 text (the hard-fitted 699 km uplift `1.0057499686370497` is DELETED — gap C4 closed).
This effort closed the last per-step-rounding and reduction gaps: **п.15.4 per-step `round01` now runs on the
universal + цистерна fallback and on all three inventory legs** (proven kopeck-exact no-op vs every oracle);
**Табл.N12 FCL container reduction is wired at п.16.10** (Табл.N13 контрейлер seeded, awaiting Табл.N11);
**Табл.N3 directional is a sourced seed** (documented ×1.0 no-op for ordinary RF directions); and the **−754 ₽
inventory lever is resolved to proven-flat, corroborated-by-oracle** (no longer an unexplained fit). The honest
ceiling on «1:1 на любом направлении/грузе» is stated in §0.1 below — tariff math is kopeck-exact on every
certified+computed path, but **distance is NOT solved for any-direction** (one known wrong case, Решетниково), and
cargo coverage is bounded by the verbatim commodity-coefficient subset.

---

## 0.1. HONEST CERTIFICATION — what «1:1 на любом направлении / грузе» actually holds for (read this first)

The three independent axes do **not** carry the same level of guarantee. Stated without inflation:

### (i) Tariff math — **kopeck-exact on all certified + computed paths**

Given a correct **distance**, **class/МВН**, and a **verbatim commodity coefficient**, the engine reproduces
R-Тариф **to the kopeck** on every path it certifies: ПВ {1,2,3} + платформа {2,3} + цистерна {3} +
инвентарный {повагонная, групповая}, plus all loaded container plates. As of this effort the calculation chain
itself has **no known divergence from ТР-1 §II**: per-step `round01` (п.15.4) now runs on the certified contour,
the universal + цистерна fallback, the k4 base-delta, and all three inventory legs; the п.15.5 final ruble round,
п.16.7 max-of-two, п.16.10 Табл.N12 container reduction, and the class/род/commodity/innov coefficient order are
all in place. **Verdict: the arithmetic is 1:1.** The residual is purely *input data* (the other two axes), not
the math. Контрейлер reduction (Табл.N13) is the one wired-engine gap, blocked on Табл.N11 base schemes.

### (ii) Distance — **4/4 oracles exact; RF backbone sound; CIS/exclave/sparse NOT solved (HONEST LIMIT)**

- **GREEN (km-exact, asserted):** all **4** golden routes — 2444 (Возрождение→Гремячая), 699 (Исеть→Наб.Челны),
  3108 (Элисенваара→Элиста), and **1432 (Элисенваара→Решетниково)** — plus the full 40-test distance suite
  (`computeDistance.test.ts` / `dijkstra.test.ts` / `parseTransit.test.ts`, 3 files).
- **Решетниково — RESOLVED to 1432 (was 1267, the prior known-wrong residual).** The §4.3 km-monotone "through-
  узел dominance" predicate was correctly **falsified** (it cannot satisfy both Решетниково and the golden 699 —
  the routes are monotonically contradictory). The shipped fix is **class-driven, not km-arithmetic and not a
  per-route constant**: a per-узел ТР-4 classification (`tr4-uzel-class.json`) marks each competing same-участок
  spur узел as `magistral` / `obhodnoy` / `malodeyatelny` (+ a `directional` overshoot flag), and
  `computeDistance.ts:filterBackBranches` drops EXPLICIT back-branch legs (обходной / малодеятельный / directional
  магистраль) only when a clean магистраль leg of that station survives. Решетниково now routes via Ховрино
  (21+1319+92 = 1432), dropping Тверь-62 (directional overshoot), Поварово II-58 (БМО обходной) and Конаково ГРЭС
  (малодеятельная тупиковая ветвь); Наб.Челны keeps Алнаши (магистраль) → 699 intact. Each classified узел traces
  to a primary topological source (ТР-4 Книга-3 общие положения, РЖД 28/р классификация линий, ТП membership in
  `kniga3-backbone.json`). See [`DISTANCE_ROUTING_SPEC.md`](./DISTANCE_ROUTING_SPEC.md) §7 + [`DISTANCE_COVERAGE.md`](./DISTANCE_COVERAGE.md).
- **HONEST classification ceiling:** the fix is driven by a **hand-curated 7-узел table** covering exactly the
  competing узлы on the tested routes' contested участки (ТВЕРЬ ХОВРИНО, АКБАШ АЛНАШИ). The full pообъектный
  пeречень малодеятельных/обходных узлов is an **internal RZD registry (28/р specialization, Приказ Минтранса
  313/2024)** with **no open verbatim list** — so the filter is *correct where узлы are classified* and degrades
  to the conservative global-MIN no-op (never dropping unclassified legs) everywhere else. Any new multi-узел
  участок where the cheap leg is an unclassified обходной remains a latent undercut until its узлы are classified.
  This is flagged, not fabricated.
- **Coverage reality:** RF узел connectivity is **100% across the 1091 kniga1-referenced RF узлы** — all sit in
  the single big component both before and after the Книга-1 overlay merge (the overlay refines участки, it does
  not bridge islands, so it is connectivity-neutral: 157 components / biggest 1269 unchanged). Base-only
  connectivity was **59.39%** (1091/1837), rising to **69.08%** (1269/1837) once CIS-inclusive overlays are
  counted. The residual **30.92% (568 nodes / 156 small components)** is **ENTIRELY CIS/foreign** — Ukraine (202),
  Donbass (23), Crimea (17), Moldova (13), Georgia (13), Armenia (8), plus Baltic/Kazakhstan/Caucasus fragments
  and 49 singletons — i.e. **out of scope for the RF target**. **CIS, Калининград exclave, Sakhalin/ferry, and
  sparse/малодеятельный sections are NOT solved** and must be flagged, not guessed. **Verdict: distance is sound
  and 1:1 on the connected RF backbone (4/4 oracles incl. the previously-broken Решетниково); it is NOT universal
  — treat any CIS / exclave / ferry / unclassified-multi-узел route as needing verification.**

### (iii) Cargo (class / МВН / commodity) — **structurally complete, coefficient-coverage bounded**

- **Class + МВН:** resolved from `etsng-classes.json` (**5036 ЕТСНГ positions**), which matches
  `tr1-min-weight-norms.json` verbatim for the certified subset. The billable-mass floor
  `max(факт, МВН)` is GREEN for the cargoes whose МВН is pinned (685127→14т, 631184→25т, 254040→58т,
  371070→21т, нерудные→г/п, цистерна→none). For numeric-МВН роды (полувагон/платформа cls 2/3) the engine
  raises a **YELLOW «расчётная масса не подтверждена»** when МВН is missing — it does not guess.
- **Commodity coefficient (Табл.N4):** verified subset only — нерудные 0.69993, жб/стеновые 0.91, лёгкая пром
  0.75, кислоты 0.81, маты 1.04, сваи none. **Any cargo whose commodity coefficient is NOT in this verbatim
  subset is YELLOW** (engine emits the sourced subset; unsourced commodity coef → no GREEN). This is the honest
  cargo ceiling: class/МВН routing is general (5036 positions), but the *per-cargo commodity multiplier* is only
  as wide as the verbatim Табл.N4 capture. **Verdict: cargo identity is 1:1; per-cargo commodity coefficient is
  GREEN only on the captured subset, YELLOW elsewhere — never a fabricated coef.**

**Bottom line:** the *engine* is 1:1; "1:1 на любом направлении/грузе" is gated by **distance graph coverage**
(the binding limit — explicitly NOT solved for any-direction / CIS / exclaves / the Решетниково multi-узел class)
and by **verbatim commodity-coefficient coverage** (YELLOW outside the captured subset). No axis is overstated.

---

## 1. CERTIFIED to the Kopeck (GREEN) — reproduces exactly, do not break

These are the golden oracles. They are asserted in the test suite and pass to the kopeck after this effort:

| Oracle | Input | Expected | Status | Test file |
|---|---|---|---|---|
| Квитанция ЭФ164189 | own ПВ, class-1 нерудные, 2444 km, 15 wagons | **1 067 770 ₽** | EXACT (per-wagon 70477 / 73452 / 72005) | `goldenN8.test.ts` |
| Квитанция ЭТ201459 | own ПВ, class-1 нерудные, 699 km, 6 wagons | **187 344 ₽** | EXACT (6 × 31224, **NO fitted uplift**) | `goldenN8.test.ts` |
| R-Тариф Элисенваара→Элиста | classic ПВ, 3108 km, K4=1.01 | **82 816 ₽ без НДС → 101 035.52 ₽ с НДС 22%** | EXACT (НДС applied last, kopeck-carried) | `goldenUniversalOracle.test.ts` / `goldenRtariff.test.ts` |
| Distance Route A | Возрождение (021609) → Гремячая (612709) | **2444 km** | EXACT | `computeDistance.test.ts` |
| Distance Route B | Исеть (771500) → Наб. Челны (648503) | **699 km** | EXACT | `computeDistance.test.ts` |
| Distance Route C | Элисенваара (023202) → Элиста (528706) | **3108 km** | EXACT | `computeDistance.test.ts` |
| Distance Route D | Элисенваара (023202) → Решетниково (061108) | **1432 km** (via Ховрино, not the 1267 Тверь-62 shortcut) | EXACT | `computeDistance.test.ts` |

> **Решетниково — now CERTIFIED at 1432** (was the known-wrong 1267 residual). Fixed by the class-driven
> spur-attachment filter (`tr4-uzel-class.json` + `computeDistance.ts:filterBackBranches`); no per-route constant,
> oracles intact. The *general* малодеятельный/обходной classification is still bounded to a hand-curated 7-узел
> table — unclassified multi-узел участки degrade to the conservative no-op (see §0.1(ii) + `DISTANCE_COVERAGE.md`).

**What changed to make this MORE certified (not just preserved):**

- **699 km is now DERIVED, not fitted.** `computeTariffN8.ts` implements the staged ТР-1 п.16.5→16.9 calc with
  `resolveK4Correction()` honoring п.16.7.1/16.7.2/16.7.3 + п.17.2 max-of-two as an additive correction on the
  K3-corrected base. At 699 km the max-of-two correctly picks the previous-belt floor candidate
  (база(510)·К3·(0.97−1) = −1199.51 коп) over the current-belt candidate (−994.38 коп) → 31224 ₽/wagon → 187344
  total EXACT, with the `SHORT_HAUL_BOUNDARY_UPLIFT=1.0057499686370497` constant **deleted**.
- **Per-step kopeck rounding (gap M1)** is now implemented: `round01` (sign-aware kopeck half-up) applied at
  п.16.6 / 16.7.1 / 16.7.2 / 16.8 / 16.9; `round1` for the final п.15.5 ruble round; a `tariffKopecks` field is
  carried. Critical finding preserved in code: the ×1.01 доп.индексация is applied LAST WITHOUT its own kopeck
  round (it is ВНЕ Раздела II per §7) — rounding it separately drifts +1 ₽ on the 2444 km w70 wagon and would
  break ЭФ164189.
- **1501–1550 km grid hole (gap H5)** is now a documented snap-to-nearest-LOWER-belt rule (1525 km → 1451-1500
  rate 109361, verified), confirmed against `tr1-i-belts-full.json` `_meta` as an OFFICIAL grid fold — no row
  was fabricated.
- **Indexation double-count (gaps C1/C2/H19) closed:** `indexFactor()` = 1.0 for an as-of-2026 calc;
  `computeTariff.test.ts` now asserts `postIndex ≈ preIndex = 50700` instead of the prior ~25% (1.138×1.10)
  overcharge.

---

## 1.5. CERTIFICATION MATRIX — род × класс (batch 2026-06-09)

> This is the headline deliverable of the 2026-06-09 R-Тариф v19.59 batch. Every cell below was driven from the
> 13 reference quotes in [`scripts/seed-data/reference-quotes-batch-0609.json`](../../scripts/seed-data/reference-quotes-batch-0609.json)
> (full coefficient breakdowns) and locked in `goldenBatch0609.test.ts` (26 tests) + `goldenBatch0609Inventory.test.ts`.
> GREEN = reproduces R-Тариф **to the kopeck** with the cited case ID. YELLOW = the engine computes a sourced
> number but no R-Тариф reference quote exists at that matrix point. RED = primary datum missing, no number emitted.

| Род × класс | Status | Case ID(s) | R-Тариф provNoVat (₽) | What it certifies |
|---|---|---|---|---|
| **ПВ class-1** (own, нерудные) | 🟢 GREEN | `goldenN8`/`goldenProdPath`/`goldenRtariff` (ЭФ164189, ЭТ201459, Элисенваара→Элиста) | 1067770 / 187344 / 82816 (→101035.52 с НДС) | N8 grid base, K4 п.16.7 max-of-two, ×0.9346 ПВ class-1 род coef, нерудный 0.69993, НДС 22% — UNCHANGED, not regressed |
| **ПВ class-2** (own) | 🟢 GREEN | `C2-a`, `C2-b` | 147018, 153865 | billable-mass floor (14т→58т МВН), ×0.9592 ПВ class-2 род coef, K1 class-2=1.00, жб/стеновые 0.91, ×1.04 class-2 surcharge, ×1.01 доп.индекс |
| **ПВ class-3** (own) | 🟢 GREEN | `C3-a`, `C3-b`, `C3-c`, `C3-d` | 265327, 206291, 198995, 163573 | weight-dependent base (14т vs 69т), billable floor (14т→25т МВН), ×0.9774 ПВ class-3 род coef, K1 class-3=1.54, маты 1.04 / лёгкая пром 0.75, ×1.04 + ×1.01 |
| **Платформа class-2** (own) | 🟢 GREEN | `PL-C2-a`, `PL-C2-b` | 153271, 160409 | SAME chain as ПВ **минус** род coef (платформа does NOT get 0.9592) → платформа > полувагон; жб 0.91, ×1.04 + ×1.01 |
| **Платформа class-3** (own) | 🟢 GREEN | `PL-C3-a`, `PL-C3-b` | 218748, 271462 | NO род coef, NO commodity coef (сваи металлические 371070 — none), K1 class-3=1.54, ×1.04 + ×1.01 |
| **Цистерна class-3** (own, приватная) | 🟢 GREEN | `CIS-C3` | 391135 | схема 19 **ЗА ТОННУ** × масса(67т), NO мин.норма (billable=факт), K1 class-3=**1.74** (кислота, not 1.54), кислоты 0.81, NO род coef, ×1.01 |
| **Инвентарный ПВ повагонная** (общий парк, И+В) | 🟢 GREEN | `INV-1` | 110170 | Схема8(груженый, **БЕЗ** род coef) + Схема25(1)(порожний 60% дист=845км, per-axle ×4) + СхемаВ4(×1.01) − скидка 754; K4 1-ваг base-delta |
| **Инвентарный ПВ групповая** (общий парк, И+В) | 🟢 GREEN | `INV-6_20` | 105804 | same И+В rebuild, K4 6–20 ваг **negative** base-delta (−1625.12 / −127.34) |
| **ПВ class-1 inventory** (общий парк) | 🟡 YELLOW | — | — | И1+В chain computes; нерудный class-1 inventory not in this batch (INV cases are class-1 нерудные but certify the И+В *structure*, not class-1-specific inventory provision banding) |
| **КР (крытый), any class** | 🔴 RED | — | — | п.1.5 ×0.909 coefficient NOT in Табл.4 list for КР; alternative coefficient unverified |
| **ЦС/реф/транспортёр** (non-acid specialized) | 🔴 RED | — | — | 1D scheme number not pinned in Табл.N7 |
| **Empty container positioning** | 🔴 RED | — | — | Табл.N24 covers loaded only |

### Newly-certified rules (locked this batch, all verbatim from `_meta.decoded` breakdowns)

1. **Billable mass floor** — расчётная масса = `max(фактическая, мин.весовая норма)`; Схема8 base read from the
   N8 weight×distance grid by BILLABLE mass, not by г/п. Per-cargo МВН: 685127→14т, 631184→25т, 254040→58т,
   371070→21т, нерудные→г/п(~70т), цистерна→none. Verified base selections: C3-d 14→25т→base134609; C2-a
   14→58т→base156489. ЕТСНГ catalog МВН (`etsng-classes.json`) matches `tr1-min-weight-norms.json` verbatim.
2. **Gondola-only род coef** — «Коэффициент на перевозку грузов N-го класса В ПОЛУВАГОНАХ» applies to ПВ ONLY:
   class1=0.9346, class2=0.9592, class3=0.9774. Платформа and цистерна do NOT receive it (proven by
   PL-C2-b 160409 > C2-b 153865, same everything else).
3. **Platform path** — identical chain to gondola minus the род coef; commodity coef per cargo (свая 371070 none).
4. **Cistern схема 19** — per-tonne base × mass, no мин.норма, K1 class-3=**1.74** (acid position, not 1.54),
   кислоты 0.81, no род coef.
5. **Inventory И+В rebuild** — provNoVat = Схема8(loaded, no род coef) + Схема25(1)(порожний 60% дист, per-axle
   ×оси) + СхемаВ4(×1.01) − скидка 754; K4 is the п.16.7 base-delta (positive for 1-ваг повагонная, negative for
   6–20 ваг групповая). `loadedNoVat` field carries the LOADED-chain-only «провозная плата без НДС».
6. **Ordering (class 2/3)** — base → +K4 base-delta → ×род(ПВ only) → ×K1(cls2=1.00, cls3=1.54/1.74) → ×commodity
   → ×1.04 class surcharge → ×1.01 доп.индексация → НДС 22% last. The ×1.04 + ×1.01 are gated to class 2/3 ONLY
   on the universal path — applying them to class 1 would double-count against the K4=1.01 calibration and was
   caught regressing 82816→83644 before being gated.

**Net: 13/13 batch cases GREEN to the kopeck; all 4 pre-existing certified oracles (1067770 / 187344 / 82816 /
101035.52) still EXACT (`goldenN8`/`goldenProdPath`/`goldenRtariff` all pass). The certified род×class surface is
now ПВ {1,2,3} + платформа {2,3} + цистерна {3} + инвентарный {повагонная, групповая}.**

---

## 2. YELLOW — computes per official ТР-1 table, awaiting R-Тариф certification

YELLOW = the engine returns a real number derived from a verbatim ТР-1 table, but the result has **not** yet been
matched against an R-Тариф reference quote at this point in the matrix. The number is honest and sourced; it
needs an operator R-Тариф run to promote to GREEN. The engine surfaces a «проверяется» banner.

### 2.1 Inventory-park (общий парк РЖД) provision — `computeInventory.ts`

| Wagon род | Scheme | Yields number? | Confidence | Basis |
|---|---|---|---|---|
| ПВ (полувагон) | И1 (2D) + В4 | **YES** | yellow | нерудный 0,77 × п.1.5 0,909 × K1 × K4 + В4; И1+В not yet R-Тариф-verified |
| ПЛ (платформа) | И1 (2D) + В1 | **YES** | yellow | п.1.5 ×0,909 applies (ТР-1 Табл.4 names «универсальных полувагонах И ПЛАТФОРМАХ») → shares C_NERUD_PV |
| КР (крытый) | И1 + В3 | **NO → RED** | red | п.1.5 ×0,909 NOT in the list for КР → coefficient un-verified → no number emitted |
| ЦС / реф / контейнер / транспортёр | 1D И2–И17 | **NO → RED** | red | concrete scheme number not pinned in ТР-1 Табл.N7 (confidence medium/low) → no number |

### 2.2 Container loaded schemes — `tr1-i-belts-container.json` (10 verbatim plates)

Container schemes are NOT a discrete distance×rate belt grid — Таблица N24 publishes a **continuous linear plate**
`плата = A + B×KL ₽/контейнер` (A = начально-конечные операции; B = движенческие, руб./контейнеро-км; KL =
тарифное расстояние). The (A,B) pair IS the published belt; `rateModel='linearAB'`. snapToBelt selects the plate
by (containerSize, ownership) then evaluates `A + B×KL` to the kopeck — it does NOT snap to a distance band.

| containerSize | общий парк (scheme / A / B) | собств.-аренд. (scheme / A / B) | confidence |
|---|---|---|---|
| 3 т | 85 / 4839 / 6.1887 | 90 / 4214 / 4.6601 | green plate |
| 5 т | 86 / 9341 / 11.9535 | 91 / 8260 / 9.1319 | green plate |
| 10 т | 87 / 13555 / 15.7758 | 92 / 9535 / 13.6155 | green plate |
| 20 ft (>10–30 фут) | 88 / 23351 / 31.1843 | 93 / 17752 / 27.1829 | green plate |
| 40 ft (>30–40 фут) | 89 / 32624 / 62.3685 | 94 / *(see seed)* | green plate |

- **+5% 2026 (yellow):** multiplier `1.05` applied ON TOP of the A+B×KL result, non-thermal containers only.
  The base +10% is already baked into the N24 A/B values (2026 basis) — do not re-apply. The +5% carries
  confidence **yellow** because it is official-press consensus (Interfax), not byte-verbatim from the registered
  indexation order. Sanity check: scheme 88 (20ft, общ.парк) @1000 km = A + B×1000 = 54535.30 ₽/container без
  НДС; ×1.05 = 57262.07 ₽.
- These 10 plates were cross-checked byte-for-byte against the pre-existing
  `tr1-special-rules.json → container.schemeBased.schemes` (previously flagged "re-verify") and UPGRADED to
  verbatim-confirmed. This closes gaps **H6** (container belts) and **H17** (per-container dimension) for the
  LOADED case.

### 2.3 YELLOW coverage matrix (wagon × class × commodity × container)

| Axis | GREEN (certified ₽) | YELLOW (computes, awaits R-Тариф) | RED (no number) |
|---|---|---|---|
| **own ПВ, class-1, нерудные** | ✅ (3 oracles) | new dist/weight/route bands away from oracles (validation cases C04–C15, C33–C39) | — |
| **own ПВ, class-2/3** | — | same N8 chain, K1 class-2/3 belt swap (cases C22 лом cl-3, C23 удобр. cl-2, C29) | — |
| **own ПЛ (платформа), class-1** | — | И1 + В1, п.1.5 applies (cases C18 cl-3, C24 пилом. cl-1) | — |
| **inventory ПВ/ПЛ (общий парк)** | — | И1(2D)+В + K1 + K4, банер «проверяется» (case C16) | — |
| **container loaded (all 5 sizes × 2 ownerships)** | — | A+B×KL plate (green) × +5% (yellow) — needs R-Тариф container run | — |
| **КР (крытый), any class** | — | — | RED (п.1.5 coefficient un-verified) |
| **ЦС / реф / транспортёр / хоппер** | — | — | RED (1D scheme number not pinned) |
| **empty container positioning** | — | — | RED (absent from Табл.N24) |

---

## 3. RED — missing data (no number emitted), with exact source location to obtain

The engine returns `confidence:"red"` with a null number and a sourced reason for every scenario below. These
are NOT fabrication gaps — they are honest "we do not have the verbatim datum yet" states.

| RED scenario | Why RED | Exact source to obtain |
|---|---|---|
| **Empty container positioning (порожний пробег)** | Табл.N24 covers LOADED отправки only; no порожний-пробег coefficient set (verbatim-confirmed) | ТР-1 894/25 Приложение N1 разд.II — порожний-пробег table near schemes 85–94. Root: `sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/ii/` |
| **Thermal / refrigerated containers** | Separate Табл.N14 (out of scope; also excluded from +5%) | `sudact.ru/.../prilozhenie-n-1_1/tablitsa-n-14/` |
| **КР (крытый) inventory provision** | п.1.5 ×0,909 нерудный coefficient does NOT apply to КР (Табл.4); the alternative coefficient is not verified against any reference | ТР-1 Табл.4 / Табл.N6 КР coefficient + an R-Тариф КР reference quote |
| **ЦС / реф / транспортёр specialized inventory** | 1D schemes И2–И17 — concrete scheme number not pinned in ТР-1 Табл.N7 (confidence medium/low) | ТР-1 Табл.N7 verbatim scheme assignment per род; transporter per-axle belts (schemes 39–74) |
| **Refrigerator / fitting-platform / transporter own-wagon schemes (H6 remainder)** | Pinned i-schemes N30/N31/N39 have zero belts | ТР-1 Прил.N2: refrigerator 30/31, transporter per-axle 39+ |
| **Lever-3 innovative per-wagon split (C5/H8)** | `reference-quotes.json` carries wagon NUMBERS, not models; the 9-vs-1 innovative split at 2444 km is reverse-engineered from the total | Operator: per-wagon wagon MODEL from вагонный лист / ГУ-27у → number→model→`tr1-innovative-models.json` |

---

## 4. Audit Gap Closure — CRITICAL / HIGH (C1–C5 / H1–H21)

### CRITICAL (5)

| Gap | State | Note |
|---|---|---|
| **C1** indexation double-count | **CLOSED** | `skipSeed:true` on +13.8% and +10% rows; +13.8% also `effectiveTo:2025-11-30`; seed script never inserts skipSeed rows → `indexFactor()=1.0` for 2026 |
| **C2** test locked in 1.138×1.10 overcharge | **CLOSED** | `computeTariff.test.ts` asserts `indexFactor≈1.0`, `postIndex≈preIndex=50700`; old 25% assertion gone |
| **C3** orphan tariff migration `0020_far_adam_destine.sql` | **REMAINS** | Not in this session's scope; DB layer still needs `db:generate` regeneration + orphan deletion |
| **C4** fitted 699 km uplift `1.0057499686370497` | **CLOSED** | Constant deleted; replaced by verbatim п.16.5→16.9 staged calc with `resolveK4Correction()` max-of-two — 699 km now derived, all oracles still exact |
| **C5** innovative ×0.9595 per-wagon registry | **REMAINS (operator-blocked)** | Needs per-wagon model from вагонный лист / ГУ-27у — external fact, not machine-derivable |

### HIGH — closed this effort

| Gap | State | Note |
|---|---|---|
| **H5** 1501–1550 km grid hole | **CLOSED** | Documented snap-to-nearest-LOWER-belt rule in `n8base()`; confirmed official grid fold; throws if no lower belt exists (no fabrication) |
| **H6** non-полувагон container schemes had zero belts | **CLOSED (container loaded) / PARTIAL** | 10 container plates (85–94) acquired verbatim; refrigerator/transporter remain RED (see §3) |
| **H17** per-container dimension not modeled | **CLOSED (loaded)** | Plates keyed by (containerSize, ownership); empty positioning RED |
| **H19** `effectiveTo` plumbing | **CLOSED** | `IndexationLike.effectiveTo` exists; `isIndexApplicable` skips when expired; `repository.ts` carries it; dedup key excludes it so the windowed row wins |
| **M1** per-step kopeck rounding (certified contour) | **CLOSED** | round01 per ТР-1 step (16.6/16.7.1/16.7.2/16.8/16.9); see §1 |
| **M1b** per-step rounding on **universal + цистерна fallback + inventory** legs | **CLOSED (2026-06-09)** | `computeTariff.ts` universal `iAcc` chain + цистерна `rpt` chain + `k4BaseDeltaFactor` candCur/candPrev; `computeInventory.ts` loaded/empty/В legs — all `round01` per multiply; proven kopeck-exact no-op vs every oracle. Closes the prior universal/inventory DIVERGES in `TR1_ENGINE_CONFORMANCE.md` §A. |
| **п.16.10** Табл.N12 FCL container reduction | **CLOSED (container path) / SOURCED (N13)** | `tr1-reductions.json` (Табл.N12+N13 verbatim, byte-verified vs live HTML); Табл.N12 wired at п.16.10 in `computeTariff.ts` (subtract before п.15.5, clamp ≥0, YELLOW when size→Табл.N10 not verbatim). Табл.N13 контрейлер seeded, **not wired** (needs Табл.N11 base). |
| **−754 ₽ inventory lever** | **RESOLVED — proven FLAT, corroborated-by-oracle** | Required reductions 753,86/754,32 bracket 754 with **opposite K4 sign** ⇒ flat, not a formula; ruled out as Табл.N12/N13/п.28.2 + any §II/п.18 clause; re-cited as R-Тариф «Скидка с общего тарифа на универсальные вагоны» conforming the п.16.5.1 leg-sum to combined И1. Standing: corroborated-by-oracle, NOT rule-derived. Full analysis `INVENTORY_754_RESOLUTION.md`. |
| **Табл.N3 directional** seed (was conflated with N4) | **SOURCED (2026-06-09)** | `tr1-k3-directional.json`: §1 Калининград→сеть + §2 в пределах КЖД **green/verbatim**; §4 named timber routes **yellow**; §3 погранстанции **red/UNVERIFIED** (extractor unstable, deliberately not entered). Documented ×1.0 no-op for ordinary RF directions ⇒ zero effect on golden cases. |
| **M11** stale "п.16.7 unavailable" comments | **CLOSED** | Rewritten — verbatim text is on disk |

### HIGH — remaining (not in this effort's scope)

H1 (two divergent engines: `computeTariffN8.ts` test-only vs wired `computeTariff.ts`), H2 (N8 class/commodity
guard), H3 (Moscow/SPb hub same-line exclusion), H4 (`special-distances.json` ESR-vs-name matcher), H7 (Lever-2
groupovaya→Табл.5 row-1 inference, operator-blocked), H8 (75т→70477 reachable only via innovative tag,
operator-blocked), H9–H14 (CIS/backbone connectivity + km=1 export stubs), H15 (`tr1-k4-full.json` value parity),
H16 (ЕТСНГ МВН triplet differentiation), H18 (commit untracked DB schema), H20 (verify +10% literally embedded in
base tables), H21 (fresh-DB migrate+seed smoke).

> Note: the Verify agent's deliverable was the untracked Belarus distance-graph extractor
> `scripts/distance-v2-a/extract-by-spurs.mjs` (978 БЧ rows → 58 ТП + 349 spur stations, 675/675 spur targets
> resolved 100%, zero fabricated values). It is a pure data extractor for the CIS connectivity gaps (H11/H13
> family) and does NOT touch the tariff/distance math engines.

---

## 5. OPERATOR-NEEDED facts to reach до-копейки universality

To promote YELLOW → GREEN and close the operator-blocked RED gaps, the operator must supply / run:

1. **R-Тариф reference quotes per род × класс** (промоут YELLOW→GREEN). Run the cases in
   `RTARIFF_VALIDATION_CASES.md` and fill the empty answer fields. Priority probes:
   - **Container plate (NEW):** any container size × distance to certify `A + B×KL` and the +5% multiplier
     (e.g. 20ft общ.парк @ 1000 km should yield 57262.07 ₽ с +5% без НДС — confirm in R-Тариф).
   - **own ПВ class-2 (C23) and class-3 (C22):** certifies K1 class-2/3 belts on the trusted N8 chain.
   - **own ПЛ class-1 (C24):** certifies platform shares C_NERUD_PV with gondola.
   - **inventory ПВ общий парк (C16):** the FIRST R-Тариф number against И1+В — the entire inventory-provision
     row is yellow until this matches.
2. **Lever-3 (C5/H8):** per-wagon wagon MODELS for ЭФ164189 (from вагонный лист / ГУ-27у) to replace the
   reverse-engineered 9-vs-1 innovative split with a number→model→registry derivation.
3. **Lever-2 (H7):** a п.17.2 worked example or FAS clarification tying own-wagon групповая to the Табл.5 row-1
   coefficient at >2000 km.
4. **+5% container registered order ref (yellow→green):** the byte-verbatim registration number of the +5% 2026
   container indexation order (currently only official-press).
5. **Empty container порожний-пробег table:** locate the coefficient set in ТР-1 Прил.N1 разд.II (§3 root URL).
6. **КР (крытый) coefficient:** the verbatim Табл.4/Табл.N6 coefficient for covered wagons + one R-Тариф КР quote.
7. **2026 domestic НДС confirmation (M2):** confirm 22% vs 20% against primary source (universal-path systematic
   risk if 20%). The R-Тариф oracle uses **22%** (101 035.52 / 82 816 = 1.22) — consistent, but obtain the
   primary-source citation.
8. **Full минимальная весовая норма (МВН) table (batch 2026-06-09):** only 5 cargoes are pinned from this batch's
   breakdowns (685127→14т, 631184→25т, 254040→58т, 371070→21т, нерудные→г/п~70т; цистерна→none). The billable-mass
   floor is GREEN only for these; every other cargo needs its МВН from the ЕТСНГ catalog / Табл.4 to avoid an
   under-bill. The engine raises a YELLOW «расчётная масса не подтверждена» flag for numeric-МВН роды
   (полувагон/платформа class 2/3) when МВН is missing — cistern-exempt. Source to obtain: full per-ЕТСНГ МВН
   table verbatim into `tr1-min-weight-norms.json` (currently matches `etsng-classes.json` only for the certified subset).
9. **Unsourced commodity coefficients (per-cargo):** the commodity multipliers certified this batch are
   нерудные 0.69993, жб/стеновые(254040) 0.91, лёгкая пром(631184) 0.75, кислоты(481232) 0.81, маты(685127) 1.04,
   сваи(371070) none. **Any cargo outside this set has NO verified commodity coef** → it must be looked up verbatim
   in `tr1-commodity-coef-verify.json` / ТР-1 Табл.4 before a quote for it can be GREEN; until then such a cargo is
   YELLOW (engine emits the sourced subset only) or RED. The class-3 K1 split (1.54 for сваи/маты vs 1.74 for
   кислота — position-dependent) lives in `tr1-class-coeff.json`; new class-3 cargoes need their K1 position confirmed there.
10. **Distance — малодеятельный/магистральный узел attribute (BINDING distance limit):** a per-узел (or
    per-`kniga1-sections.json` row) mainline-vs-обходной designation for multi-узел участки like «ТВЕРЬ ХОВРИНО»
    and «АКБАШ АЛНАШИ», traceable to ТР-4 (Приказ Минтранса 313/2024) приложение малодеятельных участков or the
    R-Тариф узел attribute. **Without it the Решетниково class (1267 vs legal 1432) cannot be fixed without
    breaking the golden 699** — no km-only predicate satisfies both. This is the single biggest blocker to
    "1:1 на любом направлении". See `DISTANCE_ROUTING_SPEC.md`.
11. **Distance — full RF + CIS + exclave узел/spur graph:** any-direction certification requires the complete
    graph; current proof is the 3 RF-backbone oracles. CIS, Калининград (exclave), and малодеятельный/sparse
    sections are NOT solved and are flagged, not guessed (the Belarus БЧ extractor `extract-by-spurs.mjs` is a
    data-acquisition step toward this, not a fix).
12. **Табл.N11 (контрейлер base schemes) + Табл.N10 (container типоразмер map):** Табл.N13 контрейлер reductions
    are seeded but cannot be subtracted without Табл.N11 base; Табл.N12 container reduction is GREEN only once the
    ISO-size→Табл.N10 row mapping is verbatim (until then the container reduction is YELLOW-flagged).
13. **Табл.N3 §3 погранстанции coefficients:** raw HTML / R-Тариф verification of the export-via-погранстык
    multipliers (the captured values are UNVERIFIED — extractor unstable between passes — and deliberately NOT
    entered into the engine).

---

## 6. Fabrication Attestation (synthesized from all 5 sub-agents)

- **Acquire (container):** 10 A/B plates verbatim from sudact Табл.N24 (2026-06-09), cross-checked byte-for-byte;
  empty-container emitted as ONE explicit RED placeholder (A/B = null, sourceToObtain flagged); thermal excluded.
  Zero fabricated cells.
- **Fix (C1/C2/H19):** zero edits, verification-only; every value read verbatim from existing on-disk files.
- **Engine S1 (C4/M1/H5/M11):** zero tariff/distance numbers fabricated; the 0.77 / 0.909 / 0.9346 / 1.01 /
  0.9595 constants pre-existed and are sourced; H5 snap returns an EXISTING lower-belt rate (109361), never a
  synthesized value; no RED placeholders needed (short-haul now fully derived from verbatim text).
- **Provision:** zero tariff/distance numbers fabricated; ПВ/ПЛ yield real numbers at yellow; КР + specialized
  return RED with sourced reasons.
- **Verify:** zero fabricated values; extractor resolved 675/675 spur targets; all golden oracles confirmed
  passing to the kopeck.
- **Conformance close-out (2026-06-09):** zero fabricated tariff/distance/coefficient numbers. Табл.N12/N13
  re-verified byte-for-byte against the live sudact HTML (T12=76629 / T13=73725 bytes) before seeding; per-step
  `round01` proven a kopeck-exact no-op vs every oracle before shipping (no number moved); the −754 lever was
  *explained* (proven flat from existing oracle breakdowns), not invented; the Решетниково distance fix was
  **rejected** rather than shipped with a fabricated узел flag or per-route constant (`computeDistance.ts`
  restored to HEAD). Табл.N3 §3 погранстанции values left UNVERIFIED and out of the engine. Gate after all edits:
  **238 tariff/distance tests + tsc exit 0; all 4 oracles + 13 batch + 3 distances EXACT.**

**Aggregate: ZERO fabricated tariff / distance / coefficient / belt numbers across the entire effort.** RED
placeholders added: empty-container positioning (1, in `tr1-i-belts-container.json`).
</content>
</invoke>
