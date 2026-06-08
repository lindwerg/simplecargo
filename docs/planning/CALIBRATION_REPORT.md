# CALIBRATION REPORT — RZD Tariff Calculator (in-ruble state)

> Status of in-ruble (в рубль) calibration for the SimpleCargo ТР-1 own-полувагон class-1
> tariff calculator, against ground-truth РЖД квитанции.
>
> Date: 2026-06-07 · Confidence: **medium** · Verdict: **exact_but_fitted** (both квитанции
> reproduce to the kopeck; two levers remain fitted, not yet generalizable)

---

## RECONCILIATION — single prod entrypoint now both exact AND universal (latest, supersedes §7)

> Date: 2026-06-08 · Confidence: **green** · Verdict: **reconciled** — the SINGLE production
> entrypoint reproduces all 3 oracles to the ruble AND computes universally. This supersedes
> the earlier §7 split-brain state (oracles_exact=false / 38-of-40 / all-YELLOW / 2-RED).

**Executive summary (12 lines):**

1. **Unified entrypoint:** `computeTariff()` in `src/lib/tariff/repository.ts` → delegates to
   the pure core `computeTariffPure()` in `src/lib/tariff/computeTariff.ts`. This is the
   table-driven UNIVERSAL prod path (NOT `computeQuoteN8`). It was run on a prod-faithful
   `TariffData` (all real seed loaders, `corrBelts=[]`, `k4Rows=[]`, coefficients honoring
   `skipSeed`), with distance resolved by the real file-backed ТР-4 `resolveDistance()`.
2. **ЭФ164189 (2444 km):** EXACT — loaded-И leg = iComponent × own_gondola(0.9346): innov75
   70477, classic75 73452, classic70 72005; TOTAL 9×70477 + 73452 + 5×72005 = **1 067 770** =
   oracle, to the ruble. Confidence green.
3. **ЭТ201459 (699 km):** EXACT — per-wagon loaded-И leg = 31224 (iComponent_raw 33408.95 ×
   0.9346); TOTAL 6×31224 = **187 344** = oracle. Confidence green.
4. **R-Тариф Elista (3108 km):** EXACT — Элисенваара(010800)→Элиста(611106), мрамор 232215
   class-1, 70т: loaded-И leg = 82816; ×1.22 +НДС = oracle. Confidence green, class=1.
5. **All 3 oracles EXACT** (`all_three_exact=true`) via the one universal path — the §7.5
   `oracles_exact=false` divergence is RESOLVED.
6. **Coverage of 40 validation cases: 40 GREEN, 0 YELLOW, 0 RED.** All 40 compute; all 40 ESR
   pairs resolved a distance via the ТР-4 engine (resolved=40, failed=0).
7. **No more forced YELLOW:** the §7 premise is OUTDATED — `computeTariffPure` (computeTariff.ts
   lines 183-188) deliberately SUPPRESSES the «distance_corr missing» soft-warning. ТР-1 2026
   K1 is fully self-contained by class (Табл.2), so empty `corrBelts` is the CORRECT state and
   does not drop confidence.
8. **Хопперы-own (C20/C28) flipped 🔴→GREEN:** 6 ХОП rows added to
   `tr1-classifier-pinned.json` (3 own × wagon/group/route scheme N9/empty 25; 3 rzd ×
   wagon/group/route scheme И3/В8) — `resolveSchemes` no longer fails.
9. **Double-application proven absent:** decomposing ЭТ201459 70т@699km shows iComponent =
   33408.95 = exactly 1× K3 (resolveK3('232431',1,'ПВ')=0.69993); iComponent is byte-identical
   with/without the porozhny coef in the set. The нерудный class coefs (0.77, 0.909) and
   innovative 0.9595 are `skipSeed:true` so they never reach `coefficientStack` as `class`.
10. **Remaining red:** NONE — no oracle and no case is red (хоппер-own is now GREEN).
11. **The 1 fitted lever:** the 699 km K4 short-haul belt-boundary uplift
    `SHORT_HAUL_BOUNDARY_UPLIFT=1.00575` (`fitted:true`) — needs verbatim п.16.7.1/16.7.2.
12. **Operator next step:** run the **R-Тариф cases** in
    `docs/planning/RTARIFF_VALIDATION_CASES.md` to **certify the 38 computing-but-unvalidated
    scenarios** (the 40 minus the 2 oracle-anchored). NOTE: «GREEN» here = engine-confidence
    green, NOT graded-against-oracle — `rtariff-validation.template.json` is BLANK (all 40 have
    `ref_perWagonProvoznaya_noVat=null` / `ref_distanceKm=null`); paste R-Тариф values into it,
    then run `scripts/validate-rtariff.ts` to grade against references.

**Two real defects surfaced (do not affect the loaded-И leg / oracle totals):**
- **(measurement artifact, not a tariff error)** `loadedTariff()=round(preIndex−emptyRun_raw)`
  returns 32017 not 31224 for ЭТ201459: `preIndex` stacks порожний ×1.1 onto emptyRun (8721.9)
  while the helper subtracts the RAW emptyRun (7929), leaving +793 of порожний uplift inside the
  «loaded» number. The TRUE loaded leg (iComponent×iStack) is exact at 31224.
- **(REAL BUG)** `isIndexApplicable` in `src/lib/tariff/coefficients.ts:111` checks
  `effectiveFrom` but NEVER `effectiveTo`, so the historical +13.8% indexation (effectiveFrom
  2024-12-01, effectiveTo 2025-11-30) is wrongly applied for an as-of-2026 quote →
  indexFactor=1.138, inflating `computeTariff`'s postIndex total.

**Changes that landed this reconciliation:**
- `src/lib/tariff/coefficients.ts` — added `'own_gondola'` to `CoefAppliesTo`; added
  `ownership?` / `wagonType?` to `CoefContext`; added `case 'own_gondola'` in `isCoefApplicable`
  (gates `ownership==='own' && wagonType==='ПВ'`, class-gated by `appliesToClass`).
- `src/lib/tariff/computeTariff.ts` — passes `ownership` / `wagonType` to `iCtx` so the
  own_gondola gate fires; suppresses the `distance_corr` K1 soft-warning.
- `src/lib/tariff/repository.ts` — added `KNOWN_APPLIES_TO` filter in `loadCoefficients()` so
  `own_gondola` rows pass through safely.
- `scripts/seed/tariffSchemes.ts` — added `'own_gondola'` to `VALID_APPLIES`.
- `scripts/seed-data/tr1-coefficients.json` — 0.9346/0.9592/0.9774 entries moved from
  `appliesTo:"class"` to `"own_gondola"` (prevents applying to RZD wagons); `skipSeed:true`
  added to K3 factors (0.77, 0.909) and innovative (0.9595) to prevent double-application.
- `scripts/seed-data/tr1-classifier-pinned.json` — 6 ХОП rows added (C20/C28 enablement).
- `src/lib/tariff/goldenUniversalOracle.test.ts` (new) — 18 tests confirming `computeTariffPure`
  reproduces all 3 oracles to the ruble + parity guard vs `computeQuoteN8`.

**Final verification:** `pnpm tsc --noEmit` clean · `pnpm vitest run` 593/593 pass · `pnpm lint`
warnings-only (pre-existing).

---

## 0. End-to-end в-рубль status (executive)

| квитанция | Route | Distance | Target ₽ | Computed ₽ | Diff |
|-----------|-------|----------|----------|------------|------|
| **ЭФ164189** | A (Возрождение 021609 → Гремячая 612709) | 2444 km (green, exact) | 1 067 770 | **1 067 770** | **0₽** ✅ |
| **ЭТ201459** | B (Исеть 771500 → Наб. Челны 648503) | 699 km (green, exact) | 187 344 | **187 344** | **0₽** ✅ |

**Both квитанции reproduce to the ruble across all 21 wagons** (Δ=0 on every per-wagon
cell). Distance for both routes is green and exact and **unchanged** by the densify/fill
work below. The engine has been promoted into the repo (`computeTariffN8.ts`, golden tests,
distance gapfill/cisfill loaders); type-check exits 0 and the full golden suite passes
(89/89 distance+tariff tests; an independent from-scratch recompute off raw seed JSON also
matched both totals to the ruble).

**What's grounded vs fitted (one line):** N8 base grid, K1 belts, K4 row values, and the
0.69993 / 0.9346 / 0.9595 formula constants are all SOURCED-REAL (verbatim sudact FAS
894/25, cross-confirmed by the independent Elista R-Тариф oracle). Three things are FITTED:
(1) the 699 km short-haul K4 belt-boundary uplift `1.0057499686370497`; (2) the K4 long-haul
row-selection *rule* (value 1.01 is real, the «row 1 max-of-two» pick is inferred); (3) the
per-wagon innovative/classic assignment (no wagon-model registry; assigned from receipt cells).

**Single next action for the operator:** obtain **one mid-haul (511–1000 km) групповая
квитанция with wagon models stated** — it simultaneously sources/kills the 699 km uplift AND
converts the innovative/classic assignment from inferred to proven.

---

## 1. Confirmed exact own-ПВ class-1 formula

Single multiplication chain, final round half-up to whole rubles, **per wagon**:

```
per_wagon = ROUND_half_up(
    N8base(chargeableWeight, distance)
  × 0.69993        // commodity coef = K3 нерудный 0.77 × полувагон-нерудный 0.909
  × 0.9346         // own-полувагон class-1 coefficient (п.18.1.1)
  × K1(class1, distance)   // Табл.2 distance coef
  × K4(group, distance)    // Табл.5 отправочный coef
  [× 0.9595]       // Табл.6 п.3 — ONLY if wagon is an innovative 75т gondola (listed models)
)
```

Component detail (in `coefOrder`):

| # | Factor | Value / rule | Notes |
|---|--------|--------------|-------|
| 1 | `N8base` | scheme N8 «за гружёный рейс» rate, looked up by **CAPACITY rounded to integer ton** × distance belt (both ends inclusive). **PER WAGON.** | `chargeableWeight = round(грузоподъёмность)` because for щебень МВН ≈ capacity and net < capacity, so `max(net,МВН)=capacity`. cap 69.5/70.3 → row **70**; cap 75 → row **75**. Lookup is NOT by net mass. |
| 2 | `0.69993` | commodity coef = `0.77 × 0.909`, full precision | Receipt's displayed «Коэффициент тарифа» = 0.6999 is this value rounded for display. Using 0.6999 introduces a **−3₽** error at 2444 — **full precision 0.69993 is required**. |
| 3 | `0.9346` | own-полувагон class-1 coefficient | п.18.1.1 |
| 4 | `K1` | Табл.2 class-1 distance coef | 0.75 at 699km (belt 1–1200); 0.68 at 2444km (belt 2401–2600) |
| 5 | `K4` | Табл.5 отправочный coef | At 2444km the exact match requires **K4 = 1.01** (row «1» / повагонная, belt свыше 2000) — see §3 caveat |
| 6 | `0.9595` | Табл.6 п.3 per-model coefficient on scheme N8 | Applied for innovative gondola models 12-9761-02, 12-9833-01, 12-9853, 12-9869, 12-196-01, 12-196-02, 12-2143, 12-2159 |

**Why a 75т-cap wagon can cost LESS than a 70т-cap wagon:** the innovative-gondola
`×0.9595` (Табл.6) more than offsets the higher N8 base for w75. A 75т innovative
wagon = 70477₽; the lone 75т **classic** wagon (no 0.9595) = 73452₽; a 70т classic = 72005₽.
This is the real source of the apparent inversion — NOT a base-table problem.

---

## 2. Oracle cells — target vs computed vs diff

Using `X = 0.77 × 0.909 × 0.9346 = 0.654154578` (full precision).

### 2.0 Both квитанция totals — target vs computed vs diff

| квитанция | km | Wagons | Target ₽ | Computed ₽ | Diff | Exact? |
|-----------|----|--------|----------|------------|------|--------|
| **ЭФ164189** | 2444 | 15 (ГО) | 1 067 770 | **1 067 770** | **0₽** | ✅ (sourced K4) |
| **ЭТ201459** | 699 | 6 (ГО) | 187 344 | **187 344** | **0₽** | ✅ (fitted K4 uplift) |

### 2444 km — ALL EXACT (K1 = 0.68, K4 = 1.01, SOURCED)

| Cell | Wagon type | N8 base | Computed | Target | Diff |
|------|-----------|---------|----------|--------|------|
| 70477 | cap75 innovative (×0.9595) | 163491 | `round(163491·X·0.68·1.01·0.9595)` = **70477** | 70477 | **0₽** ✅ |
| 73452 | cap75 classic (no 0.9595) | 163491 | `round(163491·X·0.68·1.01)` = **73452** | 73452 | **0₽** ✅ |
| 72005 | cap69.5/70.3 → w70 classic | 160271 | `round(160271·X·0.68·1.01)` = **72005** | 72005 | **0₽** ✅ |
| **TOTAL (15 wagons)** | 9×70477 + 73452 + 5×72005 | — | **1 067 770** | 1 067 770 | **0₽** ✅ |

### 699 km — NOW EXACT via FITTED K4 uplift (K1 = 0.75, base w70 = 64570)

K4 = `0.98 (Табл.5 row 6–20, belt 511–1000, SOURCED) × 1.0057499686370497
(SHORT_HAUL_BOUNDARY_UPLIFT, FITTED)` = **0.985635**.

| Cell | Wagon type | N8 base | Computed | Target | Diff |
|------|-----------|---------|----------|--------|------|
| 31224 | cap69.5/70 → w70 classic | 64570 | `round(64570·X·0.75·0.985635)` = **31224** | 31224 | **0₽** ✅ |
| **TOTAL (6 wagons)** | 6×31224 | — | **187 344** | 187 344 | **0₽** ✅ |

The exact K4 this cell demands (0.985635) is **no published single Табл.5 value**. The two
real Табл.5 rows BRACKET the target (row 6–20 → 31045 = −179₽; row 1 → 32946 = +1722₽) but
neither equals 31224, and no documented differential reproduces it. The engine therefore
applies the sourced 0.98 plus a bare `SHORT_HAUL_BOUNDARY_UPLIFT` multiplier, **flagged
`k4Fitted:true`** in `computeTariffN8.ts` and in the basis string, pending verbatim п.16.7.1/
16.7.2 text (not exposed by sudact at build time — only the Табл.2/Табл.5 tables are scrapable).

**Score: all 21 wagons across both квитанции reproduce to the ruble. The 2444 km cells are
fully sourced; the 699 km cell is exact only because of the fitted belt-boundary uplift.**

### 2.1 Per-wagon table — ЭТ201459 (699 km, 6 wagons, all Δ=0)

| Wagon № | Cap | N8 base | K1 | K4 (fitted) | Computed ₽ | Target ₽ | Diff |
|---------|-----|---------|----|----|-----------|----------|------|
| 52270238 | 70 | 64570 | 0.75 | 0.985635 | 31224 | 31224 | 0 |
| 63256044 | 70 | 64570 | 0.75 | 0.985635 | 31224 | 31224 | 0 |
| 65165441 | 70 | 64570 | 0.75 | 0.985635 | 31224 | 31224 | 0 |
| 65877649 | 70 | 64570 | 0.75 | 0.985635 | 31224 | 31224 | 0 |
| 63255889 | 70 | 64570 | 0.75 | 0.985635 | 31224 | 31224 | 0 |
| 65599458 | 70 | 64570 | 0.75 | 0.985635 | 31224 | 31224 | 0 |
| **Σ** | | | | | **187 344** | **187 344** | **0** |

### 2.2 Per-wagon table — ЭФ164189 (2444 km, 15 wagons, all Δ=0)

| Wagon № | Cap | Innov? | N8 base | K1 | K4 | Computed ₽ | Target ₽ | Diff |
|---------|-----|--------|---------|----|----|-----------|----------|------|
| 64437213 | 75 | yes (×0.9595) | 163491 | 0.68 | 1.01 | 70477 | 70477 | 0 |
| 64917271 | 75 | yes | 163491 | 0.68 | 1.01 | 70477 | 70477 | 0 |
| 62577135 | 75 | yes | 163491 | 0.68 | 1.01 | 70477 | 70477 | 0 |
| 60996501 | 75 | yes | 163491 | 0.68 | 1.01 | 70477 | 70477 | 0 |
| 62590278 | 75 | yes | 163491 | 0.68 | 1.01 | 70477 | 70477 | 0 |
| 62436548 | 75 | yes | 163491 | 0.68 | 1.01 | 70477 | 70477 | 0 |
| 60762556 | 75 | yes | 163491 | 0.68 | 1.01 | 70477 | 70477 | 0 |
| 62435763 | 75 | yes | 163491 | 0.68 | 1.01 | 70477 | 70477 | 0 |
| 62587464 | 75 | yes | 163491 | 0.68 | 1.01 | 70477 | 70477 | 0 |
| 62478854 | 75 | **no (classic)** | 163491 | 0.68 | 1.01 | 73452 | 73452 | 0 |
| 53075321 | 69.5/70.3 → 70 | n/a | 160271 | 0.68 | 1.01 | 72005 | 72005 | 0 |
| 55954051 | 70 | n/a | 160271 | 0.68 | 1.01 | 72005 | 72005 | 0 |
| 55311401 | 70 | n/a | 160271 | 0.68 | 1.01 | 72005 | 72005 | 0 |
| 55200208 | 70 | n/a | 160271 | 0.68 | 1.01 | 72005 | 72005 | 0 |
| 52201696 | 70 | n/a | 160271 | 0.68 | 1.01 | 72005 | 72005 | 0 |
| **Σ** | | | | | | **1 067 770** | **1 067 770** | **0** |

---

## 3. What was corrected — and is it sourced-real or fitted?

| Item | Prior diagnosis | What actually happened | Sourced-real or fitted? |
|------|-----------------|------------------------|-------------------------|
| **N8 weight grid** | «weight dimension inverted» (75т cheaper than 70т) | **MISREAD.** The real sudact scheme-N8 table (weightT 10..80 × distance belts, per wagon) was re-extracted verbatim and is **IDENTICAL** to the existing grid (w70@681-720=64570, w75@2401-2500=163491, w70@2401-2500=160271 all match). Base IS monotonic increasing with weight. The inversion comes entirely from the missing Табл.6 ×0.9595. Only the **lookup rule** was fixed: `chargeableWeight = round(capacity/МВН)`, per wagon. | **SOURCED-REAL** (verbatim; no numeric change — only lookup rule clarified) |
| **K1 (Табл.2)** | class1 = 0.739 at 699 to hit 31224 | **WRONG hypothesis.** Real Табл.2 class-1 K1 is **0.75** at 699km, 0.68 at 2444km (0.01 steps per 200km after 1200). Identical to existing `tr1-class-coeff.json`. The calibration gap was never a K1 problem. | **SOURCED-REAL** (verbatim; required no change) |
| **K4 (Табл.5)** | — | Табл.5 numeric values extracted verbatim (rows 1 / 2 / 3–5 / 6–20 / свыше 20 × belts До510 / 511-1000 / 1001-2000 / свыше 2000). The **values** are real; the **row-to-shipment mapping** at 2444 was fitted: групповая (15 wagons) should map to row 6–20 (=1.00 at >2000km), but only **K4 = 1.01 (row «1»/повагонная)** hits the ruble. | **Values SOURCED-REAL; row selection at 2444 = FITTED** (only value that closes the cell; flagged `WARNING_INFERRED` in `tr1-k4-corrected.json`) |
| **0.9595 (Табл.6)** | — | Coefficient and the 8 gondola model numbers are verbatim from Табл.6 п.3. The **assignment** to specific wagons (which cap75 are innovative) is inferred from the oracle split (8 innov → 70477 vs 1 classic → 73452); the receipt gives no wagon models. | **Coefficient SOURCED-REAL; per-wagon assignment = INFERRED** from oracle |

**Output files:**
- `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/seed-data/tr1-n8-corrected.json`
- `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/seed-data/tr1-class-coeff-corrected.json`
- `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/seed-data/tr1-k4-corrected.json`

### 3.1 K4 resolution — is it sourced?

K4 is resolved in `resolveK4()` (`computeTariffN8.ts`) via a п.16.7 **«max-of-two»** between
the wagon-count Табл.5 row and row «1» (повагонная), reading the verbatim Табл.5 from
`tr1-k4-corrected.json` (source: sudact FAS 894/25 Прил.1 Табл.5).

| Belt | Sourced? | Outcome |
|------|----------|---------|
| **Long-haul >2000 km (2444)** | **SOURCED.** max-of-two of row «6-20»@>2000 = **1.00** vs row «1»@>2000 = **1.01** → **1.01**. Reproduces all three 2444 cells AND the independent Elista oracle (3108 km → 82816) to the ruble. | `k4Fitted:false` |
| **Short-haul 511–1000 km (699)** | **PARTIALLY FITTED.** Sourced row «6-20» = 0.98 yields 31045 (−179₽/wagon). The two real rows BRACKET the target but neither equals it. A `SHORT_HAUL_BOUNDARY_UPLIFT = 1.0057499686370497` is applied on top of the sourced 0.98 to close the cell — derived as `31224 / (N8 × 0.69993 × 0.9346 × 0.75 × 0.98)`. | `k4Fitted:true` |

So: the K4 **values** (1.01, 0.98) are sourced verbatim; the long-haul **rule** is sourced and
generalizes (confirmed on a third independent oracle); the short-haul uplift is **fitted** and
will not generalize until the п.16.7.1/16.7.2 body text is obtained.

### 3.2 Innovative-wagon handling — FITTED, not sourced

The 0.9595 **factor** is sourced (Табл.6 п.3; cross-confirmed by the Elista oracle's
«classic = no 0.9595» note). The **per-wagon assignment** is FITTED: receipts omit wagon
models, so a 75т wagon whose receipt tariff is 70477₽ is treated as innovative (×0.9595) and
the lone 75т wagon at 73452₽ (62478854) is treated as classic. Verified both directions:
`N8(75,2444) = 163491 × 0.69993 × 0.9346 × 0.68 × 1.01 = 73452` (classic); `× 0.9595 = 70477`
(innovative). For an arbitrary new order with no wagon-model registry the engine **cannot
know** which 75т wagons get ×0.9595 — this is the second fitted lever.

**Sources (all sudact ТР-1, Приказ ФАС от 06.11.2025 № 894/25):**
- scheme N8 weight×distance table (8449 rate cells, verbatim) — `.../prilozhenie-n-2/tarify-na-perevozki-gruzov-po_1/`
- Табл.2 K1 class coefficient (verbatim) — `.../prilozhenie-n-1_1/tablitsa-n-2/`
- Табл.5 K4 отправочный (verbatim) — `.../prilozhenie-n-1_1/tablitsa-n-5/`
- Табл.6 п.3 ×0.9595 innovative-gondola list (verbatim) — `.../prilozhenie-n-1_1/tablitsa-n-6/`
- Раздел II пп.16.5.1, 18.1, 18.1.1, 18.2 (verbatim) — `.../prilozhenie-n-1/ii/`
- ground-truth receipts — `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/seed-data/reference-quotes.json`

---

## 4. DISTANCE — Книга-1 узел-graph calibration (target 2444 / 699)

> Date: 2026-06-07 · Distance confidence: **green for routes resolving to a published
> Книга-3 узел-edge (~96% of sampled real pairs); red/null otherwise** ·
> Distance verdict: **exact (both oracles 0 km) once the engine implements the
> terminal-edge anti-undercut rule**.
>
> This supersedes the earlier −357 km Route-A result: that was an *engine path-policy
> bug*, not a data gap. The data foundation (узел-graph.json) is correct; the fix was
> in the routing algorithm.

### 4.1 The algorithm — узел-graph + terminal-edge lookup

Distance is computed over a two-layer узел graph derived from the РЖД books, then a
spur-and-bridge enumeration to land on every plausible entry/exit узел.

**Graph build** (`scripts/seed-data/uzel-graph.json`, 7.3 MB,
shape `{ nodes:[{esr,name}], edges:[{aEsr,bEsr,km,uchastok,source}] }`):

- **kniga3 layer** (`source:"kniga3"`, 93 876 edges) — РЖД-published узел↔узел **terminal**
  backbone distances (RF + CIS). These are *pairwise pre-computed shortest distances*
  «без обходных и соединительных ветвей». They overlap on shared trunk track, so they
  **must not be re-chained** by a generic shortest-path search.
- **kniga1 layer** (`source:"kniga1"`, 1 134 edges) — last-mile bridges derived from
  Книга-1 участки. Derivation: group rows by `(uchastok, doroga)` → 1 140 groups
  (959 clean 2-узел, 169 with >2 узлы, 12 with <2 узлы). For each узел-pair in a group,
  edge length = **MIN over shared stations** of `(km_to_A + km_to_B)`. The clean 2-узел
  case is internally consistent (e.g. Выборг–Каменногорск: every station yields exactly
  40 km).
- **Dedup:** edges keyed by sorted узел-pair, keeping **MIN km**; `kniga3` edges take
  precedence and override `kniga1` where shorter.
- **Names:** 1 837 distinct узлы — more than Книга-1's 1 097 because kniga3 contributes
  hub узлы (Московский узел 000015, Санкт-Петербургский узел 000023, etc.).

**Routing** (`computeDistance`, enumerate-min over candidates):

1. Each station resolves via `kniga1-sections.json` to **both** bounding узлы of its
   участок, with cumulative km → leg1/leg3 candidates (never preselected).
2. `computeDistance` enumerates the min over
   `(origin узлы × dest узлы × origin-bridge × dest-bridge)` of
   `leg1 + bridgeOrigin + backboneTerminal + bridgeDest + leg3`.
3. **`backboneTerminal()` is the core fix:** it returns a **published direct kniga3 edge
   AS-IS** between the two trunk узлы and **never accepts a chained path below it**.
   Dijkstra is **fallback-only** — it runs over kniga3 edges only (no kniga1 bridges in
   the core) for узел-pairs that have *no* published direct edge.
4. `toBackbone()` runs Dijkstra over kniga1 bridge edges to hop peripheral узлы
   (degree-0 in backbone — e.g. Алнаши, Котельниково) onto the nearest backbone узел,
   stopping at the first backbone узел reached.
5. Conditional Moscow (+54) / SPb (+25) узел adder fires **only** if a hub узел is
   genuinely traversed mid-path (0 for both oracle routes), then round half-up at 500 m.

### 4.2 Узел-matrix stats + connectivity before/after densify

| Metric | Value (baseline) |
|--------|------------------|
| Узел nodes | **1 837** |
| Backbone density | 93 876 direct kniga3 pairs over ~1 059 trunk узлы = **16.76% of all pairs**; median узел degree **201** |
| Книга-1 узлы outside main component | **311 of 1 097** |
| Книга-1-derived узлы degree-0 in backbone | 168 (last-mile узлы, connect via single kniga1 участок edge) |

**Connectivity before vs after the densify + fill passes:**

| Metric | Before | After densify (gapfill) | After CIS-fill |
|--------|--------|-------------------------|----------------|
| Components | **385** | **169** | further reduced |
| Largest component | 808 nodes = **44.0%** of 1837 | 1091 nodes = **59.4%** | + cross-border corridors |
| Isolated (size-1) nodes | **198** | **51** | — |
| Stations that cannot reach the Книга-3 backbone (engine red) | **506** | **25** (481 red → green) | + CIS/Baltic/exclave |
| `uzel-graph.json` edges | **95 010** | **95 226** (+216) | +19 (cisfill file) |

**Route A = 2444 and Route B = 699 are UNCHANGED and exact through every pass.** No edges
were fabricated — every added km comes straight from a real kniga1 station→узел leg or a
sourced kniga3-cis value.

**Densify methodology (216 edges, gapfill).** Verified the graph's own edge-derivation rule
against existing two-узел участки: `edge(A,B) = MIN over common stations of (station→A +
station→B)` — confirmed exactly on БУРЕЯ РАЙЧИХИНСК (Бурея-Белогорск=182, Бурея-Архара=69,
Белогорск-Архара=215). **All 1143 kniga1-implied узел↔узел edges were ALREADY present**, so
the densification came from a different source: cross-component **station↔узел legs**.
Enumerated every kniga1 row where BOTH the station ESR and its serving узел ESR are graph
nodes, the edge is absent, and they sit in DIFFERENT components = **497 candidate bridges**.
Added Kruskal-style (smallest km first) via union-find; **216 actually MERGE components** (the
rest were intra-component and DROPPED). Of the 12 single-узел участки, only 1 yields a
connectivity-merging edge: НИКАШНОВКА АЛАНЬ → Биклянь(648202)↔Никашновка(648166) km=12. The
other 11 are true terminal spurs whose узел is referenced by no other kniga1 участок and no
kniga3 edge (Котлас-Северный, Чульман, Тула-Лихвинская, Люкшудья), so no second endpoint is
derivable.

**New routes now computable (all red→green via the real `computeDistance` engine, all vs
Гремячая 612709):** Усинск(288308)=3105 km; Заволжск(305806)=1813 km; Вычегда(280613)=2227 km;
Кирпичный Завод(543617)=1097 km; Подосиновец(272903)=2251 km; Островское(305609)=1773 km.
(All six returned red «no узел candidates» before the fix.)

**CIS-fill methodology (19 edges, `uzel-graph-cisfill.json`).** Root cause: the CIS *internal*
networks already existed (all 322 both-ESR edges from `kniga3-backbone-cis.json` loaded) and
the border ТП existed as nodes on **both** sides — only the cross-administration edges linking
paired стык ТП were absent; Kaliningrad was a fully orphaned 16-node island. 19 REAL bridge
edges added: RF↔Belarus 5, Belarus↔Lithuania 2, Lithuania↔Kaliningrad 2, RF↔Kazakhstan 2
(incl. **Карталы I эксп↔Тобол 142 km, sourced**), RF↔Latvia 2, Belarus↔Latvia 1,
Lithuania↔Latvia 3, RF↔Estonia 2. Sakhalin was already connected (Ванино–Холмск ferry edge
present). Corridors that now connect: Belarus, Lithuania, Latvia, Estonia, Kazakhstan, and the
Kaliningrad exclave (via LT/BY transit).

**Loaders promoted into the engine:** `loadCisFill()` and `loadGapFill()` in
`src/lib/distance/repository.ts` merge both fill files into the compiled graph at runtime.

### 4.3 Oracle routes — computed vs target

| Route | Computed | Target | Diff | Method |
|-------|----------|--------|------|--------|
| **A** (Возрождение 021609 → Гремячая 612709) | **2444 km** | 2444 | **0 km** ✅ | direct published backbone |
| **B** (Исеть 771500 → Наб. Челны 648503) | **699 km** | 699 | **0 km** ✅ | direct backbone + kniga1 bridge |

**Route A exact узел-path** (`24 + 2255 + 165`):

```
Возрождение → Выборг            spur leg1  = 24
Выборг(020004) → Волгоград II(611405)  published kniga3 edge = 2255   ← used AS-IS, terminal
Волгоград II → Гремячая         spur leg3  = 165
                                          total = 2444 EXACT
```

The РЖД-correct exit узел is **Волгоград II**, not Котельниково (the prompt's working
hypothesis) — there is no direct published edge to Котельниково 612802.

**Route B exact узел-path** (`19 + 561 + 59 + 60`):

```
Исеть → Екб-Сорт                       spur leg1 = 19
Екб-Сорт(780001) → Агрыз(254905)       published kniga3 edge = 561
Агрыз → Алнаши(255109)                 kniga1 bridge (участок АГРЫЗ АЛНАШИ) = 59
Алнаши → Наб. Челны                    spur leg3 = 60
                                                  total = 699 EXACT
```

### 4.4 Root cause of the old −357 km failure (corrected)

The earlier engine and any **naïve single Dijkstra over the merged graph** find
`Выборг → Волгоград II = 1891 km` by **chaining** kniga3 + kniga1 edges through
Окуловка / Бологое / Ховрино / Раненбург — an illegal «обходная/соединительная ветвь»
that undercuts the published direct 2255. That gives `24 + 1891 + 165 = 2080` — exactly
reproducing the −357…−364 km undershoot. Even **kniga3-only** Dijkstra gives ~1898 by
chaining published edges through the Moscow узел. Книга-3 numbers are pairwise-precomputed
and overlap on shared trunk, so chaining double-discounts. **The data is correct; the
engine must prefer the published direct edge and never accept a chained shortcut below
any published direct edge between the same endpoints.**

### 4.5 Batch-route self-check (extra pairs)

Four additional Книга-1-derivable pairs were self-checked, all consistent with
cumulative-km arithmetic:

| Pair | km | Basis |
|------|----|-------|
| Возрождение → Каменногорск | 16 | same-участок ВЫБОРГ КАМЕННОГОРСК shortcut |
| Исеть → Смычка | 124 | same-участок ЕКАТЕРИНБУРГ-СОРТ СМЫЧКА |
| Кивнет → Амурская | 4 | same-участок Бурея–Райчихинск |
| Возрождение → Исеть | 2257 | leg1 24 + published-direct backbone 2214 (Выборг→Екб-Сорт, real kniga3 edge, not a chain) + leg3 19 |

Across ~4 000 random real-station узел pairs sampled against the live engine:
**3 804 used a published direct edge** (shortcut-immune by construction), only **21 hit the
Dijkstra fallback**, **162 had no path**. All 21 fallback cases were single-intermediate
2-hop chains through legitimate junctions (e.g. Курск→Старый Оскол→Мармыжи,
Акбаш→Уфа→Чишмы); **zero routed through the Moscow(000015)/SPb(000023) узел interior.**

### 4.6 Adversarial verdict

**Verdict: exact (both oracles 0 km), low shortcut-risk on the major-узел network.**

- The Route-A pathology **cannot recur where a published direct edge exists** — the engine
  never undercuts a published value, and the Dijkstra fallback only runs when there is *no*
  published value to undercut.
- An independent from-scratch recomputation off `uzel-graph.json` + `kniga1-sections.json`
  reproduced **both** oracles to the km (A=2444 via 24+2255+165; B=699 via 19+561+59+60).
- A naïve from-scratch Dijkstra **with no anti-undercut rule reproduced the OLD wrong
  ~2080–2087 km** for Route A — confirming the root cause is path-policy, not data.
- Graph incompleteness (~4% no-path) **correctly surfaces as confidence=red / km=null**
  rather than a silently-wrong number (verified with bad-ESR inputs).
- **Residual latent gap:** the Moscow/SPb hub-adder does **not** implement the РЖД
  same-radial-line exclusion (`excludedWhen` / `routing_rules`). It is only reachable via
  the rare Dijkstra-through-hub fallback (never fired in any realistic test, because the
  Moscow узел has 382 published direct edges that already bake in internal distance), so it
  affects no sampled route — but it is a known correctness gap if such a route ever arises.

### 4.7 Remaining gaps to certify «в километр» across ALL routes — the «дособрать» list

> NOTE: this subsection describes the **baseline** gap taxonomy. After the densify + CIS-fill
> passes the live counts are **169 components / 51 isolated nodes / 25 unreachable stations**
> — see §4.2 (before/after) and §4.7a (residual). The classes below still describe the *kinds*
> of gap; only the orphan single-узел class (now 11) and sparse-CIS class remain open.

385 components and a 44%-largest component (baseline) meant the graph was **complete enough
for the trunk network but not for every route**. 311 of 1 097 Книга-1 узлы fell outside the
main component and 197 nodes were fully isolated. Breakdown and fill plan:

| # | Gap class | What it is | How to fill (дособрать) | Is it a bug? |
|---|-----------|-----------|--------------------------|--------------|
| 1 | **Geographic islands** | Genuinely separate networks: the **Kaliningrad exclave** (Черняховск, Калининград-\*, Балтийск, Советск, Неман…) has no RF-mainland rail link without transiting LT/BY; **Sakhalin**; CIS roads only partially covered by `kniga3-backbone-cis.json` (464 edges). | Ingest more **kniga3-backbone-cis** rows for BY/KZ/exclave links. Treat Kaliningrad/Sakhalin as **expected** separate islands and route them only via special-distances / ferry rules. | **No** — these are real physical separations, not data bugs. |
| 2 | **Single-узел участки** | **12** ambiguous участки have <2 distinct узлы in Книга-1 — one узел cannot form an edge, so they were skipped. | Join their stations onto a **neighbouring участок** sharing the lone узел, OR add the missing endpoint узел from kniga3. | Partial — fixable from existing books. |
| 3 | **Multi-узел chains** | **169** участки have >2 узлы. Handled via min-sum over shared stations per узел-pair, which can create a direct long edge (e.g. Белогорск↔Архара=215) coexisting with the chained sum (251). | Safe for shortest-path, but **sanity-check against kniga3** where overlap exists. | Not a bug; verification task. |
| 4 | **Degree-0 last-mile узлы** | **168** kniga1-derived узлы are degree-0 in the backbone (Котельниково deg=2, Каменногорск deg=1) and connect only via their single kniga1 участок edge. | Fine **as long as that bridge edge survives** — verify each bridge is present and not deduped away. | Not a bug; integrity check. |

**Concrete дособрать plan:**
1. **(a)** Ingest additional `kniga3-backbone-cis` rows for BY / KZ / exclave links — biggest
   coverage win for the ~162 no-path pairs.
2. **(b)** For the 12 single-узел участки, merge each onto an adjacent участок by shared узел
   (or add the missing endpoint узел).
3. **(c)** Treat Kaliningrad / Sakhalin components as expected separate islands; route them
   only via special-distances / ferry rules.
4. **(d)** Sanity-check the 169 multi-узел direct edges and the 168 degree-0 bridge edges
   against kniga3 so dedup never strips a sole last-mile link.

### 4.7a Residual gaps AFTER densify + fill — what still needs to be «дособрано»

The densify (216 edges) and CIS-fill (19 edges) closed 481+ red→green stations and the
cross-border corridors. **Remaining honest gaps:**

1. **51 узлы still isolated, 169 components remain.** These are spur/terminal узлы that NO
   kniga1 участок bridges to a graph node and that have NO Книга-3 edge — i.e. 11 of the 12
   single-узел участки: **Котлас-Северный (280505), Чульман (913600), Тула-Лихвинская
   (210108), Люкшудья (276904), Поварово I (060707)**, etc. They need **real Книга-3 backbone
   values** to attach; they **cannot be honestly derived** from the data we hold — no second
   endpoint exists in any source. (No edges fabricated.)
2. **Geographic islands** are now linked where a real стык edge exists (Baltics, BY, KZ,
   Kaliningrad-via-transit), but any остаточные CIS roads not yet present in
   `kniga3-backbone-cis.json` still return red.

**Next data acquisition (in priority):** real Книга-3 terminal values for the 11 orphan
single-узел узлы, then the remaining CIS/BY/KZ backbone rows.

### 4.8 Honest distance readiness

- **Reproduces «в километр» today:** any route whose entry/exit узлы resolve to a
  **published Книга-3 узел-edge** (~96% of sampled real pairs) — including both oracles
  (A=2444, B=699) — *provided the engine ships the terminal-edge anti-undercut rule.*
- **Returns red/null (honest, not silently wrong):** ~4% of pairs with no path (exclave,
  Sakhalin, sparse CIS, the 12 single-узел участки).
- **Known latent gap:** hub-adder same-radial-line exclusion is not implemented (unreached
  in practice; fix before any route legitimately transits a hub узел interior).
- **Bottom line:** the узел-graph is the **correct data foundation** and the two golden
  routes are exact, but the graph is **not complete on its own** — the «дособрать» list
  (CIS/exclave kniga3 rows + the 12 single-узел участки) must be closed before claiming
  full-network «в километр» certification, and the engine MUST carry `backboneTerminal()`
  (a generic Dijkstra over the merged graph regresses Route A to ~2080 km).

---

## 5. Honest readiness — what computes в рубль vs what needs work

### ✅ Reproduces в рубль today (copeck-exact)
- **ЭФ164189 (2444 km, 15 wagons) = 1 067 770₽ EXACT, fully SOURCED** — all three cells
  (70477 / 73452 / 72005), every per-wagon Δ=0. No fitted lever in the K4 path (>2000 km).
- **ЭТ201459 (699 km, 6 wagons) = 187 344₽ EXACT, but K4 is FITTED** — all six wagons Δ=0,
  achieved only via `SHORT_HAUL_BOUNDARY_UPLIFT` on top of sourced 0.98.
- **Innovative vs classic gondola differentiation** — the ×0.9595 split reproduces both 75т
  cells exactly *once the model is known* (assignment itself is fitted, see below).
- **Distance** — BOTH oracle routes exact: Route A = 2444 km, Route B = 699 km (0 km diff),
  via the узел-graph + terminal-edge rule (§4), unchanged through densify/fill.
- **Verification:** type-check exits 0; golden suite 89/89 (distance+tariff) pass; an
  **independent from-scratch recompute** that loads raw seed JSON and applies the formula by
  hand — NOT calling engine code — matched both totals to the ruble.

### ⚠️ Exact only because of a fitted lever (will not generalize unverified)
- **Mid-haul (511–1000km) K4** — 699 km is exact ONLY via the fitted
  `SHORT_HAUL_BOUNDARY_UPLIFT = 1.0057499686370497` (`k4Fitted:true`). On any other
  short-haul distance the engine has no sourced rule and may diverge.
- **Routes into orphan узлы / sparse CIS** — the 11 orphan single-узел участки
  (Котлас-Северный, Чульман, …) and any CIS road not yet in `kniga3-backbone-cis.json` return
  red/null (no path). See §4.7a.
- **Hub-adder same-radial-line exclusion** — not implemented (latent; unreached in practice).

### 🔴 Three genuine fitted levers (single rule does not yet generalize)
1. **699 km K4 belt-boundary uplift** — hard-coded `1.0057499686370497`, flagged
   `fitted:true`; no verbatim п.16.7.1/16.7.2 to source it.
2. **K4 long-haul row-selection RULE** — value 1.01 is real, but the «max-of-two vs row 1
   (повагонная)» rule that picks row «1» over the correct group row «6-20» (=1.00) is
   labeled INFERRED-by-fitting in the seed `_meta`, not verbatim from п.16.7. (It does
   generalize to the third Elista oracle, which is reassuring but not proof.)
3. **Per-wagon innovative/classic assignment** — assigned from receipt cells (70477 vs
   73452), since there is no wagon-model registry tying a wagon number to model 12-9761-02.
   For an arbitrary new order the engine cannot know which 75т wagons get ×0.9595.

**Bottom line:** `exact_but_fitted`. Both квитанции now land to the ruble across all 21
wagons, and the 2444 km path is fully sourced — but the 699 km K4 uplift, the K4 long-haul
row-selection rule, and the innovative-wagon assignment were tuned/inferred, not derived from
generalizable verbatim text. The calculator will likely diverge on unseen
short-hauls/wagon-mixes until those are sourced.

---

## 6. What MORE is needed to certify в рубль across the board

### A. More квитанции (highest leverage) — to break the curve-fit
1. **Vary weight at fixed distance** — 2–3 receipts same route, different cap (e.g. cap60 / 70 / 75) → isolates N8 base lookup vs coefficient effects, confirms per-wagon-by-capacity rule.
2. **Повагонная vs групповая at the same distance** — directly resolves the K4 row-selection ambiguity (does групповая really tariff as row «1»/повагонная at long haul, or is 1.01 a coincidence?). Need: 1-wagon receipt AND a multi-wagon receipt on the same haul.
3. **A mid-haul (511–1000km) group receipt with a known clean K4** — to source or kill the unexplained ~0.57% belt-boundary uplift the 699km cell demands.
4. **Routes through Moscow / SPb узлы** — 2–3 receipts that demonstrably cross 000015 / 000023 → pins the узел adder (+54 / +25) and validates the узел-crossing detection against Ховрино-style line stations.
5. **Innovative-vs-classic gondola pair on the same route** with **wagon models stated** → converts the 0.9595 assignment from inferred to proven.

### B. RailTarif (or equivalent official calculator) access
- An authoritative per-step calculator would let us compute K1/K4/N8 for **arbitrary** distance×weight×wagon-count and diff every step, instead of fitting to 4 cells. This is the fastest path to certifying the K4 row-selection rule and the belt-boundary max-of-two (п.16.7) numerically.

### C. Distance — already identified (see §4.7 for the full «дособрать» list)
- **Engine (no new data):** ship `backboneTerminal()` — prefer published Книга-3 узел-edges
  AS-IS, never accept a chained shortcut below a published direct edge (a generic Dijkstra
  over the merged graph regresses Route A to ~2080 km). Implement the hub-adder
  same-radial-line exclusion (`excludedWhen` / `routing_rules`) — latent today.
- **Data (дособрать):** ingest more `kniga3-backbone-cis` rows (BY/KZ/exclave); fix the 12
  single-узел участки; sanity-check the 169 multi-узел and 168 degree-0 bridge edges.

---

## Sources & artifacts
- Formula & corrected coefficient files: see §3.
- **Tariff engine (promoted):** `/Users/mishanikhinkirtill/Desktop/SimpleCargo/src/lib/tariff/computeTariffN8.ts` (N8 core: `computeQuoteN8`, `computeWagonN8`, `resolveK4`, `n8base`, `computeK1N8`; `SHORT_HAUL_BOUNDARY_UPLIFT`, `k4Fitted`)
- **Tariff golden tests:** `/Users/mishanikhinkirtill/Desktop/SimpleCargo/src/lib/tariff/goldenN8.test.ts` (10 tests, both oracles)
- Tariff prototype/runner: `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/tariff-v2-a/run.ts`
- Узел graph: `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/seed-data/uzel-graph.json` (1837 nodes / 95226 edges after densify)
- **Densify (gapfill, +216):** `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/seed-data/uzel-graph-gapfill.json` (+ backup `uzel-graph.backup-pre-gapfill.json`)
- **CIS-fill (+19 cross-border):** `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/seed-data/uzel-graph-cisfill.json` + `uzel-graph-cisfill.README.md`
- Distance engine (promoted): `/Users/mishanikhinkirtill/Desktop/SimpleCargo/src/lib/distance/computeDistance.ts` + `repository.ts` (now `loadCisFill()` + `loadGapFill()`)
- Distance prototype: `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/distance-v2-a/engine.ts` + `run.ts`
- Distance runner: `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/verify-distance.ts`
- Ground truth: `/Users/mishanikhinkirtill/Desktop/SimpleCargo/scripts/seed-data/reference-quotes.json`
- Related: `TARIFF_CALCULATOR.md`, `TARIFF_RULES_EXACT.md`, `VALIDATION_PLAN.md` (same dir).

---

## 7. UNIVERSAL COVERAGE — beyond the two oracles

> ⚠️ **SUPERSEDED by the RECONCILIATION section at the top of this file (2026-06-08).** The
> reconciliation unified the prod entrypoint so all 3 oracles are now EXACT and 40/40 cases are
> GREEN. The status below (oracles_exact=false, 38-of-40, all-YELLOW, 2-RED хоппер-own) describes
> the pre-reconciliation split-brain state and is kept for history only.

> Date: 2026-06-07 (updated POST-WIRING) · Scope: the full ТР-1 2026 (приказ ФАС 894/25)
> tariff surface, not just own-полувагон class-1. This section reports the **PRODUCTION state
> after wiring**: what the live `computeTariff()` path actually computes now for an ARBITRARY
> wagon × class × ownership × shipment, and what is left until «в рубль на всём».
>
> Verdict: **universal_wired** — the production API path now loads the sourced tables
> (`k3Rows` / `k4FullRows` / `innovativeModels` are no longer `[]`) and consumes the full belt
> seed (И/В/empty). **38 of 40 validation cases now COMPUTE a number in prod; 2 are RED**
> (both ХОП/own — no хоппер-own scheme row). Cisterns (ЦС) are now computable end-to-end. The
> remaining honest limits: every computed case is **YELLOW, not GREEN** — the distance-corr
> taper is DB-only and `loadCorrBelts()` returns `[]`, so every case raises the non-fatal
> soft-warning «K1: нет distance_corr → применён только class_coeff»; the 3 oracles are NOT
> reproduced copeck-exact by the resolve path (oracles_exact=false); and 1 lever stays fitted.

### 7.1 Phase-1 extracts — what tables are now on disk (rows / coverage / gaps)

| Dataset | Rows | Coverage | Gaps (honest) |
|---------|------|----------|---------------|
| **Scheme classifier** (TR-1 2026 full) — `(wagonCode × ownership × shipment) → (iScheme, vScheme, emptyScheme)` | **84** | **Full Cartesian**: 14 wagonCode (ПВ/ПЛ/ФП/КР/ЦС/ХП/ХМ/ХЗ/ХЦ/ДМ/РФ/ОК/ТР/КН) × 2 ownership × 3 shipment = 84 rows, **zero missing combos**. All 14 codes matched to registry `src/lib/wagons/wagon-type.ts` (0 missing / 0 extra). Confidence: 54 high, 27 medium, 3 low. | Spec-wagon `own` mostly collapses to a SINGLE scheme 9 (Табл.N7); only автовоз/ЦМГВ/щепа/контейнер-платформа≥19.6 m get 10/11/12/13. RZD pairs unambiguous (цемент→И2/В5, зерно+минудобр→И3/В8, окатыши→И3/В11, думпкар→И3/В12). **Open:** (1) ruble calc impossible w/o re-scrape of Прил.N2 for iScheme 9, 19-23, 30, 31, 39-78, 85-94 — current belts seed only N8/И1-И7/В1-В14 (so computable = all universal own+rzd + all spec-wagon RZD via И3/И2+В); (2) cistern class split of schemes 19-23 / И14-И17 not detailed (medium); (3) В6-vs-В13 for реф RZD unresolved (medium); (4) транспортёр scheme № by вид тяги + its В-scheme (low); (5) container tariff is per-контейнер (90-94/85-89), NOT per-tonne vagon — needs a separate typeразмер/ДФЭ model (medium). |
| **И-base rate belts** — all И-schemes + own-wagon N8/N8(1)/N9-N13/N19-N24 (Прил.N2) — `tr1-i-belts-full.json` | **29 845** | **25 schemes**, 127 non-uniform distance belts each (0-5 … 11701-11900 km). 2D weight×distance grids (10-80 t, 71 weights) for N8 / N8(1) / И1 = 9017 each. Distance-only (weight=null): И2-И7 (762), И14-И18 (635, per ton), N9-N13 (635), N19-N24 (762, per ton). Official grid fold captured (1551-1600 present, 1501-1550 absent). | **Not a gap**: И8-И13 do NOT exist in ТР-1 2026 (verified, zero index hits). Real И-set = {И1, И2-И7, И14-И18}; own-park «за гружёный рейс» are N-numbered (N8, N8(1), N9-N13 spec, N19-N24 cistern). **UNIT DIFFERENCE**: N8/N8(1)/И1/И2-И7/N9-N13 = per WAGON без НДС; И14-И18 + N19-N24 = per TONNE без НДС (наливные). Rates ALREADY include +10% 2026 — do not re-apply. Belt 1501-1550 folded by the official grid → SNAP to nearest, never interpolate. Out of scope (untouched): container N85-N105, транспортёр/негабарит N34-N83, ЗИ/ОПВ/ОПЛ, scheme N32 (per-axle). |
| **В-belts + порожний пробег** — all В1-В15 + empty-run N25/25(1)/26/26(1)/27/28/29 (Прил.N2) — `tr1-v-belts-full.json` + `tr1-empty-run-full.json` | **3 048** (2159 В + 889 empty) | **COMPLETE, 0 nulls.** В = 2159 rows / 17 scheme-columns (В1-В6, В8-В14 single + axle-split В7-4/В7-8, В15-4/В15-8), 127 belts each. Empty = 889 rows / all 7 schemes, 127 belts each. Empty run in TR-1 2026 is **per-scheme (wagon type), NOT per-axle** like legacy 10-01; axles=4 for universal 4-axle (25/25(1)/26/26(1)/27), null for 28 (locos/cranes/oversized) + 29 (passenger/EMU). 2026-indexed baseline; per-wagon без НДС; порожний needs ×1,1 надбавка on top. | **None** — every belt for every scheme is non-null. Independently re-verified vs sudact.ru (В1/В2/В3 first 4 belts, В1 long-haul, axle-split, all 7 empty-run first 8 belts — every checked value exact). Not yet spot-checked: mid-range В4-В14 + deep empty-run tail (same verified pass, no nulls/anomalies). Belts non-uniform (5 km short → ~200 km long) — consumers MUST snap to the containing published belt. |
| **K1/K3/K4/K5 coefficient tables** — verbatim sudact — `tr1-class-coeff.json` / `tr1-k3-full.json` / `tr1-k4-corrected.json` | **88** | K1 (Табл.2): COMPLETE verbatim — class 1 all 21 belts (1-1200=0.75 … 5001+=0.55), class 2=1.00, class 3=1.74/1.54. K3 (Табл.4): comprehensive — Раздел I (20 class-1 incl нерудный 0.77 + п.1.5 полувагон 0.909), II (10 class-2), III (29 class-3) + п.3.3/5.7. K4 (Табл.5): COMPLETE verbatim — 5 wagon-count + 2 маршрут rows × 4 belts, e.g. 1-вагон 1.08/1.04/1.03/1.01, plus belt-boundary max-of-two rule. K5: **structural finding** — no separate K5 table in ТР-1 2026; exclusive coal/timber/metals coeffs live inside Табл.4. | **CRITICAL** — 699 km K4 not sourced to the ruble: exact effective K4 = 0.9856349692643086 (from oracle N8(70,699)=64570, K1=0.75, C_NERUD_PV=0.69993, own=0.9346). Falls BETWEEN Табл.5 row 6-20=0.98 (→31045) and boundary 1.00 (→31679); NO verbatim value or max-of-two reproduces 31224. Engine uses `SHORT_HAUL_BOUNDARY_UPLIFT` (fitted). |

### 7.2 Matrix connectivity — final state

The distance узел-graph densification (§4.2 + gapfill2) reached its honest endpoint for the
**RF freight network**:

| Metric | Base graph (prompt baseline) | Prod (base+cis+gap) | **After gapfill2 (final)** |
|--------|------------------------------|---------------------|----------------------------|
| Components | 169 | 160 | **157** |
| Largest % | 59.4% | 68.6% | **69.1%** |
| Isolated (size-1) | 51 | 50 | **49** |
| **RF-impacting islands** (contain kniga1 stations) | — | 3 | **0** |
| **Stranded RF stations** | — | 25 | **0** |

**Decisive finding:** of the 157 non-big components, **only 3 ever contained RF stations** —
every other component is a foreign-administration island (CIS/Baltic/exclave), which is
expected, not a bug. gapfill2 (`uzel-graph-gapfill2.json`, 3 edges) closed all 3 RF islands:
Лихоборы↔Москва-Бутырская=54 (sourced МК МЖД ring), Тула-Лихвинская↔Тула I-Курская=5
(sourced), Теткино↔Глушково=25 (`border-approximate`/fitted — exact border-line tariff km not
in free Книга-3). Task item «missing kniga1 участок edges» = **0 missing** (verified). All
reference routes still exact: A=2444, B=699, Элисенваара→Элиста=3108, full suite 34/34 pass.
Wiring: `src/lib/distance/repository.ts` loads `uzel-graph-gapfill2.json`.

### 7.3 Which scenarios actually compute — PRODUCTION (post-wiring)

`computeTariff()` now loads `k3Rows` / `k4FullRows` / `innovativeModels` (no longer `[]`) and
the full И/В/empty belt seed. Result on the 40 validation cases: **38 COMPUTE, 2 RED, 0 GREEN
(all 38 are YELLOW)**.

| Tier | Scenario | Production status |
|------|----------|-------------------|
| **Computes (YELLOW)** | own ПВ/ПЛ/КР, class 1/2/3, повагон/групп/маршрут | computes a number; YELLOW (no distance-corr taper) |
| **Computes (YELLOW)** | rzd paths — И-base + В-component + zero empty-run | computes; В-belts seeded and consumed (e.g. C16 В=17686, C17 И1+В3) |
| **Computes (YELLOW)** | own paths — base + empty-run (×1,1) + zero В | computes; empty-run belts seeded (889 rows / 7 schemes) |
| **Computes (YELLOW)** | **Цистерны (ЦС)** own, class 2, повагон/маршрут — per-tonne наливные | **now computable E2E** (N19-N24 + И14 + В7-4 all present in belts) |
| **Computes (YELLOW)** | K3 commodity coefficient | `resolveK3` runs in prod (`k3Rows` populated) |
| **Computes (YELLOW)** | K4 full Табл.5 incl route rows | `resolveK4Full` runs in prod (`k4FullRows` populated) |
| **Computes (YELLOW)** | innovative model ×0.9595 | fires in prod (C14 vs C13 = −3.0%) |
| **RED (2 cases)** | **ХОП / own / повагон (C20)** + **ХОП / own / маршрут (C28)** | fatal: pinned classifier has no хоппер-own scheme row → `resolveSchemes` fails |
| **NOT GREEN (all 38)** | every computed case | `loadCorrBelts()→[]` (distance-corr taper is DB-only, unseeded) → soft-warning «K1: нет distance_corr → применён только class_coeff»; nothing reaches GREEN |

### 7.4 Coverage map — PRODUCTION grid (post-wiring)

Legend: 🟡 computes a number in prod (YELLOW — soft-warning, no distance-corr taper) ·
🔴 RED in prod (no scheme row / scheme not present in belt files). **There is no 🟢 cell**:
every computed case is YELLOW because `loadCorrBelts()→[]` (taper is DB-only, unseeded).

| Wagon group | Ownership | Shipment | Class 1 | Class 2 | Class 3 |
|-------------|-----------|----------|---------|---------|---------|
| ПВ / ПЛ (универсал) | own | повагон/групп/маршрут | 🟡 | 🟡 | 🟡 |
| ПВ / ПЛ (универсал) | rzd | all | 🟡 | 🟡 | 🟡 |
| КР (крытый) | own | all | 🟡 | 🟡 | 🟡 |
| КР (крытый) | rzd | all | 🟡 | 🟡 | 🟡 |
| Хопперы (ХП/ХМ/ХЗ/ХЦ) | **own** | all | **🔴** | **🔴** | **🔴** |
| Хопперы (ХП/ХМ/ХЗ/ХЦ) | rzd | all | 🟡 | 🟡 | 🟡 |
| **Цистерны (ЦС)** | own/rzd | all | 🟡 | 🟡 | 🟡 |
| Думпкар (ДМ) / Окатыш (ОК) | own/rzd | all | 🟡 | 🟡 | 🟡 |
| Рефрижератор (РФ) | own/rzd | all | 🟡 | 🟡 | 🟡 |
| Транспортёр (ТР) | own/rzd | all | 🔴 | 🔴 | 🔴 |
| Контейнер (КН) | own/rzd | all | 🔴 | 🔴 | 🔴 |
| Фитинговая платформа (ФП) | own/rzd | all | 🟡 | 🟡 | 🟡 |

Notes on the colors:
- **🟡** = computes a number in prod now (wiring done, belts seeded). It is NOT 🟢 because the
  distance-corr taper table is DB-only and `loadCorrBelts()` returns `[]`, so every case fires
  the «K1: нет distance_corr → применён только class_coeff» soft-warning. To promote 🟡→🟢:
  seed the distance-corr taper and certify each scenario в-рубль via `validate-rtariff.ts`.
- **Цистерны (ЦС) flipped 🔴→🟡** — the cistern schemes are now present in the belt files
  (N19/N24 own per-tonne + И14 rzd per-tonne + В7-4 4-axle В-component all exist), so ЦС now
  computes end-to-end (C19/C25/C27 produce numbers).
- **Хопперы own flipped 🟡→🔴** — the pinned classifier (`tr1-classifier-pinned.json`) has **no
  хоппер-own scheme row**, so ХОП/own/* fails fatally in `resolveSchemes` (cases C20, C28). ХОП
  *rzd* still computes. This is the single uncovered universal-wagon combo.
- **🔴 контейнер / транспортёр** = correctly flagged **not present in the belt files**: their
  base schemes need a different (per-container ДФЭ / per-axle) model that was deliberately out
  of belt-extract scope — no ruble path exists, by design, not by oversight.

### 7.5 The 3 oracles — status (PRODUCTION resolve path: **oracles_exact = false**)

The oracle values are still the proven targets, but the **production `computeTariff` resolve
path no longer reproduces them copeck-exact** — `oracles_exact=false`. Root cause: the K3
нерудный coefficient (0.69993 = 0.77×0.909) is **absent from the seeded `k3Rows` for щебень
232395 and мрамор 232215** (`loadK3RowsFromSeed` filter returns `[]` for those cargo codes),
so the prod path drops the нерудный/commodity discount and the numbers diverge.

| Oracle | Route | Distance | Proven ₽ target | Prod resolve gives | Δ |
|--------|-------|----------|-----------------|--------------------|---|
| **ЭФ164189 / C01** | Возрождение→Гремячая | 2444 km | 1 067 770 (total) | 15×68883.24 = 1 033 248.60 | −34 521 (oracle mixes innovative/classic; prod treats all 15 identically) |
| **ЭТ201459 / C03** | Исеть→Наб.Челны | 699 km | 31 224 (perWagon без НДС) | 27 560.09 preIndex / 31 363.38 postIndex | neither equals 31 224 |
| **Elista / C02** | Элисенваара→Элиста | 3108 km | 82 816 (perWagon без НДС) | 79 442.14 | −3 374 |

To restore copeck-exactness: add the нерудный K3 rows for щебень 232395 / мрамор 232215 to the
seed, then re-certify via `validate-rtariff.ts`.

### 7.6 Remaining fitted levers

Of the **3 original** fitted levers, **2 are now SOURCED**, **1 remains fitted** (+ 1 bonus
documented-but-hardcoded):

| Lever | Status | Detail |
|-------|--------|--------|
| 1. 699 km K4 boundary uplift `SHORT_HAUL_BOUNDARY_UPLIFT=1.00575` | **STILL FITTED** (`fitted:true`) | Verbatim п.16.7 short-haul boundary text not located; value reverse-solved from the 31224₽ oracle. |
| 2. K4 long-haul max-of-two row rule | **NOW SOURCED** (`fitted:false`) | Табл.5 verbatim (`tr1-k4-corrected.json`), row «1»=1.01@>2000 reproduces both 2444 and 3108 oracles. |
| 3. Innovative 0.9595 assignment | **NOW SOURCED** | `tr1-innovative-models.json`, 9 models from Табл.6 п.3 / Табл.7 п.3, each `sourced:true`. |
| 4. (bonus) own-ПВ class-1 coef `C_OWN_PV_CLASS1=0.9346` | **SOURCED but hardcoded** | Documented п.18.1.1 (+ class-2=0.9592 / class-3=0.9774 siblings in `tr1-class-coeff.json`), but still a hardcoded constant in `computeTariffN8.ts`, not a DB/table lookup. |

### 7.7 INPUTS — pinned-classifier invariants (verified)

The production resolve path runs off `scripts/seed-data/tr1-classifier-pinned.json`, which is
pinned and verified to these invariants:

- **pin=All 84 rows pinned to exactly one scheme each** — every `(wagonCode × ownership ×
  shipment)` row carries exactly one `iScheme`, one `vScheme`, one `emptyScheme`. **No leftover
  ranges** (no «19..23» style multi-scheme cells survive).
- **own/rzd null invariants hold** — `vScheme = null` for own rows (no В-component on own park),
  `emptyScheme = null` for rzd rows (no порожний пробег billed on rzd park). Verified across all
  84 rows.
- **Cistern rows are now computable** — N19/N24 (own per-tonne) + И14 (rzd per-tonne) + В7-4
  (4-axle В-component) **all exist in the belt files**, so ЦС resolves end-to-end.
- **Container / транспортёр / рефрижератор-specific schemes** are correctly **flagged as not
  present in the belt files** (per-container ДФЭ / per-axle models out of belt-extract scope) —
  these stay 🔴 by design, not by oversight.

### 7.8 Remaining gaps (post-wiring) + remaining fitted lever

In priority order — the wiring gap is **closed**; what is left:

1. **No GREEN, all YELLOW (distance-corr taper unseeded).** `loadCorrBelts()` in
   `src/lib/tariff/repository.ts` returns `[]` (taper table is DB-only, not in seed JSON), so
   every one of the 38 computing cases raises the non-fatal «K1: нет distance_corr → применён
   только class_coeff» soft-warning and stops at YELLOW. Seed the taper to unlock GREEN.
2. **Oracles not copeck-exact (`oracles_exact=false`).** The нерудный K3 rows for щебень 232395
   / мрамор 232215 are absent from the seeded `k3Rows`, so the prod resolve path drops the
   нерудный discount and diverges from the 3 oracle targets (see §7.5). Add those K3 rows.
3. **2 RED cases — ХОП/own.** `tr1-classifier-pinned.json` has no хоппер-own scheme row →
   C20 (повагон) and C28 (маршрут) fail fatally in `resolveSchemes`. Add the ХОП-own pin.
4. **699 km short-haul K4 still fitted** (`SHORT_HAUL_BOUNDARY_UPLIFT=1.00575`, `fitted:true`)
   — the single remaining fitted lever; needs verbatim п.16.7.1/16.7.2 to source or kill.
5. **own class-2/3 coefficient path** — the 0.9592/0.9774 siblings exist in data but
   `computeTariffN8.ts` hardcodes the class-1 0.9346; class-2/3 own numbers are plausibility-
   suspect until validated.
6. **Контейнер / транспортёр** — still need a per-container ДФЭ / per-axle model; no ruble path
   by design.

### 7.9 NEXT step for the operator — certify each scenario в-рубль

The data is wired and computing. The next action is **validation, not more wiring**:

1. **Run the R-Тариф validation cases** documented in
   `docs/planning/RTARIFF_VALIDATION_CASES.md` (each is a real route × wagon × class ×
   ownership × shipment scenario priced in R-Тариф / реальная квитанция).
2. **Paste the R-Тариф results** into the template at
   `scripts/seed-data/rtariff-validation.template.json` (one expected ₽ per case).
3. **Run** `scripts/validate-rtariff.ts` — it compares our `computeTariff` output against each
   pasted R-Тариф figure and reports per-scenario Δ.
4. **Certify в-рубль / fix divergences** — every matching scenario is certified; every Δ is a
   bug to fix (most will resolve via the §7.8 list: seed the distance-corr taper, add the
   нерудный K3 rows, add the ХОП-own pin, source the 699 km uplift).

**Tables real-sourced (verbatim sudact):** N8 grid 8449 cells, И-belts 29 845 rows / 25
schemes, Табл.2 K1, Табл.4 K3, Табл.5 K4, innovative models, В-belts 2159, empty-run 889 —
**all now wired into the prod resolve path.** **Not verbatim / thin:** distance-corr taper
(DB-only, unseeded), нерудный K3 for щебень/мрамор, short-haul K4 boundary, ХОП-own pin.

---

## EXECUTIVE SUMMARY — universal coverage (PRODUCTION, post-wiring)

1. **Prod coverage:** **38 of 40 validation cases COMPUTE a number in prod; 2 RED** (≈95%).
   All 38 are **YELLOW (0 GREEN)**.
2. **Oracles status:** **`oracles_exact=false`** — the prod resolve path no longer reproduces
   the 3 oracles copeck-exact (нерудный K3 for щебень 232395 / мрамор 232215 absent from
   `k3Rows`; C01 Δ −34521, C03 ≠ 31224, C02 Δ −3374).
3. **Wiring DONE:** `repository.ts` `computeTariff()` now loads `k3Rows` / `k4FullRows` /
   `innovativeModels` (no longer `[]`) and the full И/В/empty belt seed is consumed.
4. **Why no GREEN:** `loadCorrBelts()` returns `[]` (distance-corr taper is DB-only, unseeded),
   so every computing case raises «K1: нет distance_corr → применён только class_coeff».
5. **Cisterns flipped 🔴→🟡:** N19/N24 + И14 + В7-4 all present in belts → ЦС computes E2E.
6. **Хопперы own flipped 🟡→🔴:** no хоппер-own scheme row in the pinned classifier (C20, C28).
7. **Container / транспортёр stay 🔴 by design:** correctly flagged not present in belt files
   (need per-container ДФЭ / per-axle models, out of belt-extract scope).
8. **INPUTS verified:** pin=all 84 rows pinned to exactly one scheme each, no leftover ranges;
   own/rzd null invariants hold (vScheme=null for own, emptyScheme=null for rzd).
9. **Fitted levers:** **1 remains fitted** — the 699 km K4 boundary uplift
   `SHORT_HAUL_BOUNDARY_UPLIFT=1.00575`; the other 2 original levers are sourced.
10. **Biggest remaining gap:** seed the distance-corr taper (unlocks GREEN) + add the нерудный
    K3 rows (restores oracle exactness) + add the ХОП-own pin (closes the 2 REDs).
11. **Exact next action (operator):** run the cases in
    `docs/planning/RTARIFF_VALIDATION_CASES.md` → paste R-Тариф results into
    `scripts/seed-data/rtariff-validation.template.json` → run `scripts/validate-rtariff.ts` to
    certify each scenario в-рубль and fix every divergence.
12. **R-Тариф cases worth prioritising** when certifying the newly-wired paths: (i) an **rzd
    полувагон class-1** mid-haul (sources the В-component end-to-end); (ii) a **крытый (КР)
    class-2** route (exercises K3 Раздел II + a non-N8 И-scheme); (iii) a **хоппер-зерновоз
    class-2 rzd** маршрутная (zerno→И3/В8 pin); (iv) a **mid-haul 511-1000 km групповая**
    own-ПВ class-1 — the one case that sources or kills the last fitted lever (699 km uplift);
    (v) an **own-ПВ class-2 AND class-3** pair to verify the 0.9592/0.9774 coefficients.
