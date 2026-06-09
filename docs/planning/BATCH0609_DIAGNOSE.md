# BATCH0609 DIAGNOSE — current engine vs R-Тариф v19.59 oracles (2026-06-09)

Read-only diagnostic. Every case in `scripts/seed-data/reference-quotes-batch-0609.json`
was run through the CURRENT engine via a temp harness (now deleted). Diffs are
**provNoVat (без НДС)**: engine `postIndex` vs documented `result.provNoVat`.

Data assembly mirrors `goldenUniversal.test.ts` / `computeTariffUniversal.test.ts`
(`makeSeedData` with all `loadXFromSeed()` tables, empty `coefficients`/`indexations`,
injected distance) and `inventoryData.loadInventoryTariffData()` for the inventory path.
Routing: own_pv/platform → `computeTariffPure`; inventory → `computeInventory`/`computeInventoryPV`.
No fix applied.

## Per-case table

| caseId            | ours (без НДС) | target  | diff ₽    | diverging factor |
|-------------------|---------------:|--------:|----------:|------------------|
| inventory/INV-1   |        100326  | 110170  |  -9844    | wrong base scheme (И1 not N8) + missing порожний leg + missing ×1.01 + missing −754 |
| inventory/INV-6_20|         97046  | 105804  |  -8758    | same as INV-1 |
| own_pv/C3-a       |     266573.52  | 265327  |  +1246.52 | adds порожний (+11827) oracle has none; i-comp missing ownPv 0.9774 + class×1.04 + ×1.01 |
| own_pv/C3-b       |     209854.31  | 206291  |  +3563.31 | same structure (billable 14т) |
| own_pv/C3-c       |     202886.89  | 198995  |  +3891.89 | same; engine also omits commodity 0.75 in i-comp but adds порожний |
| own_pv/C3-d       |     168855.13  | 163573  |  +5282.13 | same (billable 25т) |
| own_pv/C2-a       |     155656.04  | 147018  |  +8638.04 | same structure, class2 (billable 58т) |
| own_pv/C2-b       |     162359.04  | 153865  |  +8494.04 | same structure, class2 (billable 69т) |
| platform/PL-C2-a  |     155656.04  | 153271  |  +2385.04 | adds порожний; i-comp missing class×1.04 + ×1.01 (platform correctly has NO род coef) |
| platform/PL-C2-b  |     162359.04  | 160409  |  +1950.04 | same |
| platform/PL-C3-a  |     217072.92  | 218748  |  -1675.08 | adds порожний BUT i-comp under (missing class×1.04 + ×1.01) → net under |
| platform/PL-C3-b  |     266573.52  | 271462  |  -4888.48 | same → net under |
| cistern/CIS-C3    |      406748.9  | 391135  | +15613.90 | adds порожний (+24995) oracle has none; per-tonne i-comp missing K4(+98.36) |

(Engine notes: all own_pv/platform/cistern report `confidence=yellow`, correct class,
correct billable mass = `chargeableTons`. Inventory reports `yellow`.)

## Factor-level attribution (reverse-engineered from the engine outputs)

### own_pv (собственный полувагон) — `computeTariffPure`, class 2/3

The documented oracle chain (verbatim) is **schema8-only, NO separate порожний leg**:

```
base(N8, billableMass, L) → +K4 (п.16.7) → ×ownPvClassCoef → ×K1 → [×commodity] → ×classSurcharge(1.04) → ×dopIndex(1.01) = provNoVat
```

The engine computes `iComponent = baseRate × K1 × K3 × K4 × innov` and then **adds an
empty-run leg** (`emptyRun = 11827` from `snapEmptyRun`, scheme 25 @ 2543 km × 4 axles)
because `input.ownership === "own"` (computeTariff.ts L505-518). The oracle's `provNoVat`
contains **no порожний** — for собственный PV/platform the screenshot's провозная плата is
the loaded chain alone. So the engine over-adds ~11.8k.

Simultaneously the engine's **i-component is itself UNDER the documented chain** because,
with the fixture `coefficients: []` and `indexations: []`, the engine applies neither:
- the **own-полувагон род coefficient** (0.9592 class2 / 0.9774 class3, п.18.1.1) — it
  would come from the `coefficients` table, absent here;
- the **class surcharge ×1.04** ("Коэффициент на перевозку грузов N класса") — not present
  as a separate engine multiplier on the universal path;
- the **×1.01 доп.индексация** — would come from `indexations`, absent here.

Verified exactly:
- **C2-b** engine i = 163782 × 0.91 (K3 jb/стеновые) × 1.01 (K4 1-ваг) = **150532.04**.
  Documented chain = 163782 →167816.07 (K4) →×0.9592 →153806... →×0.91 →146481.95
  →×1.04 →152341.23 →×1.01 = **153864.64**. Missing engine multipliers: 0.9592×1.04×1.01.
- **C3-b** engine i = 127316 × 1.54 (K1 class3) × 1.01 (K4) = **198027.31**.
  Documented = 127316 →130476.32 →×0.9774 →127527.56 →×1.54 →196392.43 →×1.04
  →204248.13 →×1.01 = **206290.61**. Missing: 0.9774×1.04×1.01.
- **C3-a** (маты 685127) engine i = 163782 × 1.54 × 1.01 = **254746.52**. Note: oracle
  chain for C3-a applies NO commodity line (despite `_meta` listing маты 1.04) — engine
  also applies no commodity, so commodity is NOT a divergence here; the gap is still the
  род coef + class×1.04 + ×1.01.

Net effect own_pv: (missing 0.9592/0.9774 × 1.04 × 1.01 ≈ +0.8…2.6% on i) is OUTWEIGHED
by the spurious +11827 порожний → engine **over-reports** for всех own_pv.

### platform (собственная платформа) — `computeTariffPure`, class 2/3

Same engine code path as own_pv. Oracle chain confirms **NO род coefficient for platform**
(`NO_gondola_coef: true`), which the engine respects (it applies the род coef only via the
`coefficients` table, which is empty here anyway). The remaining divergences:
- engine adds the spurious порожний +11827 (oracle provNoVat has none);
- engine i-comp misses **class surcharge ×1.04** and **×1.01 dopIndex**.

For class2 platforms the spurious порожний dominates → net **over** (+1950…+2385).
For class3 platforms the larger missing multipliers (1.54 K1 amplifies the missing
1.04×1.01) outweigh the +11827 → net **under** (-1675…-4888). PL-C3-a 371070 свая has
**no commodity coef** (`NO_commodity_coef: true`), which the engine also matches.

### cistern (приватная цистерна для кислот) — `computeTariffPure`, class 3, per-tonne

Cistern path EXISTS (resolves a per-tonne И-scheme, `iBelt.perTonne` → `rate × chargeable`).
Engine per-tonne i = 4002.7 × 1.74 (K1 class3 NAMED — correct for 481 acids) × 0.81 (K3
кислоты) × 1.01 = **5697.82/т → ×67т = 381753.9**.
Documented = 4002.7 →+K4(+98.36)→4101.06 →×1.74 →7135.84 →×0.81 →5780.03 →×1.01
→ **5837.83/т ×67 = 391134.61 ≈ 391135**.
Divergences:
1. engine i-comp **misses the per-tonne K4 (+98.36, п.16.7 base-delta)** → ~-9.4k;
2. engine **adds порожний +24995** (scheme 25 own-wagon), but a per-tonne cistern oracle
   has **no separate порожний leg** in provNoVat → +25k.
Net: +15613.90 over.

### inventory (инвентарный / общий парк) — `computeInventory`

WRONG STRUCTURE on two axes:
1. **Base scheme**: documented schema8_loaded uses scheme **N8** (base 107178 @ 70т/1409),
   but `computeInventory` reads the **И1** grid (`data.i1Grid`, base 142911 @ 70т/1409) via
   `n8base(data.i1Grid,…)`. Engine i = round(142911 × 0.69993 × 0.73 × 1.03) = **75211**,
   whereas documented schema8 final (N8 × K4 × 0.73 × 0.77 × 0.909 × 1.01) = **56987.42**.
2. **Missing legs**: documented inventory = schema8_loaded(56987.42) + schema25_empty
   (28570.29, порожний per-axle ×4 @ 60% dist) + schemaV4(25366.15, ×1.01) − 754 discount
   = 110170. The engine returns only `И(75211) + В(25115)` = **100326**: it omits the
   **порожний schema25 leg entirely**, omits the **×1.01 on В** (25115 vs 25366.15), and
   omits the **−754 п.16.x discount**.

Net for INV-1: engine i too high (+18k from wrong И1 grid) but missing порожний leg
(-28.5k) → undershoots by **-9844**. INV-6_20 same pattern (-8758).

## Root causes (ranked)

1. **Spurious порожний leg on own/собственный non-inventory cases.** `computeTariffPure`
   adds an empty-run charge whenever `ownership==="own"`. For these own_pv/platform/cistern
   oracles the документированный `provNoVat` is the loaded chain ONLY — порожний is not in
   it. This is the single biggest contributor (+11827 PV/platform, +24995 cistern).
2. **Universal path never applies the own-полувагон род coefficient (0.9592/0.9774),
   the class surcharge ×1.04, nor the ×1.01 доп.индексация.** In the test fixture these
   live in `coefficients`/`indexations` which are empty; на универсальном пути они также
   не закодированы как явные множители (unlike the certified N8 chain, which is class-1
   only). Every class-2/3 own_pv and platform i-component is therefore short by
   `[род]×1.04×1.01`.
3. **Cistern per-tonne i-component omits the K4 (п.16.7) base-delta** (+98.36/т here).
4. **Inventory path uses the wrong loaded scheme (И1 instead of N8)** and **omits the
   порожний schema25 leg, the ×1.01 on В4, and the −754 discount** — structurally it is
   `И1+В4` while the oracle is `N8-chain + schema25 + В4×1.01 − 754`.

## Does NOT regress existing green oracles

The certified N8 path (own-ПВ class-1 нерудные: goldenN8 1067770/187344, goldenProdPath,
goldenRtariff 82816/101035.52) is untouched by this read-only run; none of the batch cases
are class-1 нерудные, so they route through the universal/inventory paths, not the
certified chain. No code was changed.
