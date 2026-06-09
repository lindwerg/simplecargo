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
| `npx vitest run src/lib/tariff src/lib/distance --reporter=dot` | **194 passed (15 files), 0 failed** | run 2026-06-09, 487 ms, setup 0 ms (hermetic, DB-free) |
| `npx tsc --noEmit --pretty false` | **exit 0, 0 errors** | run 2026-06-09 |
| Golden oracles to the kopeck | **ALL EXACT** | see §1 |
| Belt cells added this effort | **10 container plates (verbatim) + 1 RED placeholder** | `tr1-i-belts-container.json` |
| Fabricated numbers | **ZERO** (attested by all 5 sub-agents) | §6 |

**Headline:** The class-1 нерудные own-полувагон path remains certified to the kopeck and is now derived from
verbatim ТР-1 text (the hard-fitted 699 km uplift `1.0057499686370497` is DELETED — gap C4 closed). The
computable surface has expanded from "own-ПВ only" to **own-ПВ + own-ПЛ (yellow) + all loaded container schemes
(green plate, yellow +5%)**, with everything else returning honest RED rather than a confident wrong kopeck.

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
| **M1** per-step kopeck rounding | **CLOSED** | round01 per ТР-1 step (16.6/16.7.1/16.7.2/16.8/16.9); see §1 |
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

**Aggregate: ZERO fabricated tariff / distance / coefficient / belt numbers across the entire effort.** RED
placeholders added: empty-container positioning (1, in `tr1-i-belts-container.json`).
</content>
</invoke>
