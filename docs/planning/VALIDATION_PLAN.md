# SimpleCargo Tariff Calculator — Validation Plan (Convergence-to-Zero Harness)

> Status: design. Date: 2026-06-07.
> Companion to [TARIFF_CALCULATOR.md](./TARIFF_CALCULATOR.md) (engine design) and [DATA_ACQUISITION_REPORT.md](./DATA_ACQUISITION_REPORT.md) (data readiness).
> Goal: a harness that drives the in-ruble diff between our engine and an official РЖД reference to **exactly 0₽**, and that localizes the cause whenever the diff is non-zero so the fix is a targeted data/rule edit, not a guess.

Operator standard (non-negotiable): **zero ruble error vs official РЖД**. This is real money paid to РЖД. The harness therefore treats *any* non-zero diff as a defect to localize and fix — never a tolerance to absorb. The legacy ±5%/±10% GREEN/YELLOW bands from TARIFF_CALCULATOR.md §7 are **superseded by this document for certification**; they survive only as an informational warning label, not an acceptance gate.

---

## 1. Golden-route fixture format

Two fixtures feed the harness:

- **`scripts/seed-data/reference-quotes.json`** — REAL, already populated: 2 fully-verified РЖД квитанции (ЭФ164189 Возрождение→Гремячая 2444 km; ЭТ201459 Исеть→Набережные Челны 699 km), per-wagon tariffs verified to sum exactly to квитанция «Взыскано». This is the working golden set.
- **`scripts/seed-data/reference-quotes.template.json`** — the operator-fill template (field contract + examples) for adding more квитанции / RailTarif runs.

### 1.1 Record shape (canonical, per template `fieldContract`)

```jsonc
{
  "origin": { "name": "Исеть", "esr": "771500", "road": "Сверд" },
  "dest":   { "name": "Набережные Челны", "esr": "648503", "road": "Кбш" },
  "etsngCode": "232431",          // → class + МВН (etsng-classes.json)
  "freightClass": 1,
  "wagonType": "ПВ",
  "ownership": "own",             // own → N8 + N25, no В
  "shipmentType": "group",        // → отправочный coef
  "weightTons": 410.4,            // total; per-wagon net in ref.perWagon
  "asOfDate": "2026-04-27",       // drives indexation chronology
  "traffic": "domestic",          // НДС 22% vs 0%
  "refDistanceKm": 699,           // distance engine must hit EXACTLY
  "refTariffRub_noVat": 187344,   // THE 0₽ target
  "vatStatus": "unknown",         // noVat | withVat | unknown
  "source": "квитанция",
  "ref": { "scheme": "8", "tariffCoeff": 0.6999, "perWagon": [ /* {wagonNo,capacityT,netT,tariffRub} */ ] }
}
```

### 1.2 How each route is computed by our engine

For every golden record the harness calls the engine in two stages and records each sub-result so a diff can be attributed to a layer, not just a final number:

1. **Distance stage** — `computeDistance(originEsr, destEsr, { wagonType, asOfDate })` returns:
   - `distanceKm` and a **breakdown**: `l1` (origin→ТП spur), `L_K` (ТП↔ТП backbone, per-administration-segmented at the border), `l3` (ТП→dest spur), `hubAdder` (Moscow 54 / SPb 25, conditional), `specialOverride` (special-distances.json hit, if any), `routeTP` (which origin-ТП × dest-ТП pair was selected as the minimum), `sameSectionSubtraction` (Книга-1 l2−l1 path used, if any).
   - Data sources: `kniga3-backbone.json` (RF), `kniga3-backbone-cis.json` (foreign legs, segmented), `kniga1-sections.json` (same/adjacent-section), `hub-distances.json`, `special-distances.json`, spur edges from CSV `field[4]`.

2. **Tariff stage** — `computeTariff(input)` returns the `TariffBreakdown` (TARIFF_CALCULATOR.md §5) plus an **ordered coefficient trace**: `{ baseRateBeltCell, weightTier, scheme, k3, k4, classFactor, emptyRunFactor, roundStepValues[], preIndex, indexFactor, postIndex, perWagon[] }`. Every intermediate is captured at the precision ТР-1 rounds at (до целых копеек at пп.16.6/16.7/16.8/16.9; до целого рубля at the итог) so a kopeck-vs-ruble drift is visible step-by-step.
   - Data sources: `tr1-rate-belts.json` (N8 weight×distance grid), `tr1-empty-run.json` (N25), `tr1-class-coeff.json`, `tr1-coefficients.json`, `tr1-rounding-rules.json` (order + precision + snap + half-up + МВН floor), `tr1-scheme-classifier-extended.json` (wagon→scheme), `etsng-classes.json` (class + МВН).

> **Per-wagon contract (групповая/маршрутная):** the engine prices each wagon by its weight tier and the harness diffs **every wagon's `tariffRub`** against `ref.perWagon[]`, *then* checks `Σ engine == refTariffRub_noVat`. A right sum from wrong per-wagon tiers is still a FAIL (the квитанции prove tiers exist: 75т→70477 but 62478854@75т→73452; weight-tier boundaries must be pinned). This catches a tier-boundary error that a sum-only check would hide.

---

## 2. Convergence procedure (per reference route)

```
for each golden record R:
    D_our  = computeDistance(R.origin, R.dest)         # with full breakdown
    if D_our.km != R.refDistanceKm:                     # DISTANCE diff first — it cascades
        localize_distance(R, D_our)   →  fix  →  re-run
        continue                                        # never price on a wrong km
    T_our  = computeTariff(R)                           # with coefficient trace + perWagon
    if T_our.total != R.refTariffRub_noVat
       or any( w_our.tariffRub != w_ref.tariffRub ):
        localize_tariff(R, T_our)     →  fix  →  re-run
    if D diff == 0 and tariff diff == 0 and every perWagon diff == 0:
        verdict = GREEN
    else:
        verdict = YELLOW  with the localized cause
iterate until every record is GREEN at 0₽.
```

**Order matters:** always resolve the distance diff to 0 km *before* looking at the ruble diff. A wrong km shifts the distance-belt snap and the N8 grid cell, so it manifests as a (misleading) tariff diff. Fixing tariff tables against a wrong km bakes in a compensating error.

### 2.1 DISTANCE divergence decision tree (`localize_distance`)

| Symptom (diff in km) | Probable cause | Localized check | Fix action |
|---|---|---|---|
| Off by exactly **54** (Moscow) or **25** (SPb) | узел adder mis-fired or skipped | Did route enter/exit узел on different lines? Is `hubAdder` set? | Correct same-line exclusion logic / wire узел node; data in `hub-distances.json` is verified exact |
| Off by **tens–hundreds km**, route crosses a known corridor (Far East, Журавка-Миллерово, БМК ring, Crimea) | special-distance routing rule not applied | Is route in `special-distances.json` routing_rules? Did engine re-run the ТР-4 sum along the mandated path? | Implement the routing constraint; for БМК/intra-section cases use `kniga1-sections.json` |
| Off by **a few km (~1–5)** on a same/adjacent-section pair | section-sum vs published «кратчайшее» override, OR spur+ТП fallback used instead of Книга-1 subtraction | Are both stations in `kniga1-sections.json`? Did engine use l2−l1 (same section) / l1+l2 (adjacent shared узел)? | Use Книга-1 subtraction; if a published special «кратчайшее» differs, add to `special-distances.json` |
| Off on a **cross-border (CIS/Baltic/CA/Caucasus)** route | foreign leg routed as one graph instead of segmented at border ТП; or sparse CIS coverage | Was L_K segmented per-administration and summed? Is the border ТП (`border:true`) present? Is the road's coverage adequate (БЧ/КЗХ ok; КРГ/ТДЖ/ЯЖД/РУБК sparse)? | Segment at border ТП; for sparse roads top-up `kniga3-backbone-cis.json` from official ТР-4 before trusting |
| Off where a station **does not resolve** (name/ESR) | ESR resolution miss (CIS 2020-vintage names; ~6% Книга-1 stations) | Did both ESRs resolve? Homonym tie-break correct? | Add alias / curate ESR; quarantine until resolved (`stations.isQuarantined`) |
| Engine returns **null / cannot route** | missing backbone edge or disconnected ТП | Which leg is null — spur, backbone, or border? | Source the missing edge verbatim (do NOT Dijkstra-derive — finds tariff-illegal paths) |

### 2.2 TARIFF divergence decision tree (`localize_tariff`)

Walk the coefficient trace **outermost-last**, comparing each captured intermediate; the first intermediate that diverges is the cause.

| Symptom (diff in ₽) | Probable cause | Localized check | Fix action |
|---|---|---|---|
| **Few ₽ / kopecks** off, all coefficients correct | rounding step or mode | Rounded at the right step (до коп. at 16.6/16.7/16.8/16.9; до руб. at итог)? half-up at 0.5? Carried float and rounded once? | Apply `tr1-rounding-rules.json` order+precision; round at EACH step, half-up |
| Off proportional to a **single coefficient** | wrong coef value or wrong coef ORDER | Compare `k3`,`k4`,`classFactor`,`emptyRunFactor` to trace; is order K3@16.6 → K4 max-of-two@16.7 → class@16.9? | Fix coef value (`tr1-coefficients.json`) or re-order per ТР-1 пп.16.x |
| `ref.tariffCoeff` ≠ engine scenario coef (e.g. ≠ 0.6999) | scenario coef modeled as distance-dependent | квитанции show 0.6999 is FIXED across 699 & 2444 km | Pin scenario coef per (ownership, class, shipmentType); do NOT make it a (class,distance) K1 table for own wagons |
| **One weight tier wrong** (sum off by the per-wagon delta) | N8 weight-tier boundary mis-snapped | Which wagon's `tariffRub` differs? Its `weightTier` vs `netT`/`capacityT`? | Pin N8 weight-tier boundaries from квитанция per-wagon evidence; snap, don't interpolate |
| Off by a **belt step** at a round distance | belt interpolated instead of snapped, or max-of-two boundary floor missing | `baseRateBeltCell` vs snapped belt; п.17.2 floor applied? | Snap to belt row; apply max-of-two boundary floor (`tr1-rounding-rules.json`) |
| Off ≈ **МВН** on a light load | МВН floor not applied | `chargeableTons == max(netT, МВН)`? | Apply МВН floor from `etsng-classes.json` (per-wagon-type triplet) |
| Off by **indexation factor** | indexation double-applied or wrong as-of | Is +10% 2026 already baked in the ТР-1 base? Re-applied? Right chronology for `asOfDate`? | Do not re-apply baked-in indexation; select chronology by date (`tr1-coefficients.json`) |
| Off by **НДС %** | НДС applied to wrong basis / wrong rate / wrong traffic | Is `refTariffRub_noVat` truly без НДС (`vatStatus`)? domestic=22%, export/import often 0% | Compare на одной basis; if `vatStatus:unknown` keep YELLOW until disambiguated |
| **Wrong scheme** selected (large diff) | wagon→scheme classifier miss | `scheme` in trace vs `ref.scheme`; ПВ/own must be N8 | Fix `tr1-scheme-classifier-extended.json` mapping (verified for ПВ/ПЛ/КР; цистерна N24/transporter N34 bounds are known-wrong — do not price those yet) |

---

## 3. Acceptance criteria

A route is **GREEN** only when, on the same basis (per-wagon, без-НДС, same as-of date, same ownership, same class):

- `our.distanceKm − ref.refDistanceKm == 0`, **and**
- `our.total − ref.refTariffRub_noVat == 0₽`, **and**
- for per-wagon records, `our.perWagon[i].tariffRub − ref.perWagon[i].tariffRub == 0₽` for every wagon.

Anything else is **YELLOW**, carrying the localized cause from §2's decision tree (e.g. `YELLOW: distance +54 (узел adder skipped)` or `YELLOW: -1528₽ (one 69.5т tier mis-snapped)`). **RED** = engine returns null / cannot route / cannot select a scheme.

A wagon/cargo **class is certified** only when **every** golden route for that class is GREEN at 0. Certification is per-class-per-wagon-per-ownership (the ПВ/own/class-1/нерудные path is the first and only target until its goldens are all 0).

---

## 4. Two harness layers

### Layer A — offline golden vs operator квитанции (deterministic, every commit)

- **Input:** `reference-quotes.json` (real квитанции; per-wagon sums already verified exact).
- **Runner:** Vitest, co-located `src/lib/tariff/computeTariff.test.ts` + `src/lib/distance/computeDistance.test.ts`. No network. Runs on every commit/CI.
- **Assertion:** hard-assert `distanceKm`, `total`, and every `perWagon[i].tariffRub` to exact equality. On fail, print the captured breakdown + coefficient trace and the §2 decision-tree branch hit, so the failure message itself localizes the cause.
- **Distance-only goldens** (74 km Серпухов→Ревякино; 1850 km Москва-Южный Порт→Печора) assert km even before their ₽ are filled — distance can certify ahead of tariff.
- **Why this is the certification layer:** квитанции are the official source of truth (the actual money paid). 0₽ here = certified.

### Layer B — live cross-check vs РейлТариф / РЖД calc (when access is provided)

- **Input:** `reference-quotes.json` records with `source:'railtariff'`, OR ad-hoc routes driven live.
- **Runner:** off-CI script (`scripts/validate/tariffCrossCheck.ts`), weekly/manual. Drives RailTarif or the РЖД calculator for the same route/wagon/class/date and diffs against the engine.
- **Purpose:** catch drift and cover routes the operator has no квитанция for (new corridors, CIS legs). Not the certification gate (a third-party calc may itself lag ТР-1 or differ on basis) — a Layer-B diff opens an investigation, a Layer-A diff blocks the commit.
- **Precondition (operator):** RailTarif access (login or API). The reverse-engineered gruzivagon AJAX contract in TARIFF_CALCULATOR.md §7 is UNVERIFIED — re-capture the network contract before building, and confirm the tool uses ТР-1 2026 (not legacy 10-01) or a systematic offset will masquerade as a defect.

### Layer C — drift watch (monthly)

Re-pull `rlw.gov.ru` open data and tr4.info captures; diff distances; open a task on any change. The Книга-1 dataset is already expired (valid-through 2025-07-29) and tr4.info is unofficial/undated — a single drifted section leg silently poisons every route through it.

---

## 5. What the operator must provide to reach certified 0₽

1. **More real квитанции** (highest leverage), each with these fields filled verbatim into `reference-quotes.template.json`:
   - `refDistanceKm` (тарифное расстояние), `refTariffRub_noVat`, and `vatStatus` (confirm whether «Взыскано» is без/с НДС — currently `unknown` on the 2 real records, which blocks the НДС-basis certification).
   - `ref.perWagon[]` (wagonNo, capacityT, netT, tariffRub) for групповая/маршрутная — needed to pin the N8 weight-tier boundaries (the 75т→70477 vs 73452 anomaly is unresolved).
   - `asOfDate`, `etsngCode`, `ownership`, `shipmentType`, `traffic`.
   - **Coverage to request:** ≥1 повагонная (single-wagon) квитанция to isolate the per-wagon base from group effects; ≥1 short-haul (<300 km) and ≥1 long-haul (>2000 km) to pin belt/weight-tier boundaries across the grid; ≥1 export/0%-НДС to certify the traffic branch; the 74 km and 1850 km distance anchors' ₽.
2. **Resolve the НДС status** of the existing 2 квитанции (без-НДС vs с-НДС on «Взыскано»). Until then those routes stay YELLOW on the НДС basis even if rubles match.
3. **RailTarif access** (login/API) to stand up Layer B and to generate references for routes lacking квитанции (especially CIS legs).
4. **For non-ПВ wagons / cross-border:** квитанции or RailTarif runs for those classes before they can be certified — their rate belts (цистерна/хоппер/контейнер/транспортёр) and CIS sparse-road backbones are not yet exact.

---

## 6. Certification ladder (order of attack)

1. **Distance, RF same/adjacent-section** — assert 74 km golden to 0 (Книга-1 path). ✅ data ready.
2. **Distance, RF multi-section** — assert 1850 km + квитанция distances (2444, 699) to 0.
3. **Tariff, ПВ/own/class-1/нерудные** — converge `refTariffRub_noVat` + per-wagon to 0₽ on ЭФ164189 & ЭТ201459, then on the filled anchors.
4. **НДС branch** — once `vatStatus` known, certify domestic 22% and export 0%.
5. **Cross-border (БЧ/КЗХ)** — distance segmentation to 0, then tariff (needs квитанции/RailTarif for foreign legs).
6. **Non-ПВ wagons** — blocked on rate-belt acquisition; out of scope until belts seeded.
