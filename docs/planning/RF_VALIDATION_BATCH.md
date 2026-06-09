# RF Mass R-Тариф Validation Batch

How the operator certifies the engine "до конца РФ" (to-the-kopeck) at scale.

## What this is

`scripts/rf-validation-matrix.mjs` generates a broad RF matrix and writes
`scripts/seed-data/rf-validation-matrix.json`. Each row is one
**{route × cargo × wagon}** combination, carrying what OUR engine produced:

| field | meaning |
|-------|---------|
| `route` | origin/dest ESR + name + дорога + distance `band` |
| `cargo` | ЕТСНГ code, name, `freightClass` (1/2/3) |
| `wagon` | `ПВ` полувагон / `ПЛ` платформа / `ЦС` цистерна, + `capacityT` |
| `ourKm` | ТР-4 graph tariff distance (the engine's own answer) |
| `ourProvNoVat` | our ставка предоставления, ₽/вагон, без НДС |
| `ourProvWithVat` | same with НДС 22% |
| `confidence` | `green` / `yellow` / `red` (see below) |
| `pricePath` | which engine path produced the number |
| `redReason` | why no number (RED rows only) |
| `ref_provoznayaNoVat`, `ref_distanceKm`, `ref_notes` | **operator fills these from R-Тариф** |

The point: turn a vague "the whole of Russia works" into a finite, checkable list.
RED rows the engine cannot self-certify are the ones you batch-verify by hand in R-Тариф.

## SCOPE: RUSSIA only

CIS / Baltic / foreign traffic is **out of scope** for this batch. The generator
refuses (skips) any route touching a foreign ESR via `isForeignEsr` and reports the
count in `_meta.coverage.skippedForeignRoutes`. Do not paste cross-border R-Тариф
references here — those use a different (per-administration) tariff regime.

## NO FABRICATION

- Every `ourKm` comes from the ТР-4 graph engine (`resolveDistance`).
- Every `ourProvNoVat` comes from a verbatim ТР-1 table via the certified engine
  functions (`computeWagonN8` for the green path, `computeInventory` for the yellow path).
- RED rows carry **no number** (`ourProvNoVat = null`) plus an explicit `redReason`.
  We never substitute a plausible value.

## Confidence model

| confidence | engine path | what `ourProvNoVat` is | operator action |
|------------|-------------|------------------------|-----------------|
| **green** | own-ПВ class-1 N8 path (oracle-certified до копейки) | own tariff (собственный парк IS the price) | spot-check a few; these re-derive the known oracles |
| **yellow** | inventory (общий парк) ПВ/ПЛ via `computeInventory`, class-correct K1 | `inventory(И+В) × ownerCoeff` | **VERIFY EACH** — computed per official table but not yet R-Тариф-certified at that route/cargo |
| **red** | engine refuses (цистерна ЦС 1D-схема / коэффициент рода не закреплён) | `null` | collect the R-Тариф reference so the scheme can be built next |

`ownerCoeff` defaults to **1.15** and `wagonCount` to **6** (групповая → K4 group `6-20`).
If your check uses a different owner coefficient, divide `ourProvNoVat` back to the
inventory И+В (`ourProvNoVat / 1.15`) before comparing, or note your coef in `ref_notes`.

## How to run each row in R-Тариф

For every row (focus on `confidence: "yellow"` first — those are the certifiable gap):

1. Open R-Тариф Онлайн. Set calc date = **2026** (ТР-1 2026, НДС 22%).
2. Enter origin + dest **by ESR** (`route.originEsr` / `route.destEsr`); names are a hint.
3. Set **груз = `cargo.etsng`** (ЕТСНГ), **вагон = `wagon.code`**
   (ПВ → полувагон, ПЛ → платформа, ЦС → цистерна), **г/п = `wagon.capacityT`**.
4. Set **отправка = групповая, число вагонов = 6** (matches the matrix `shipment`).
5. Set **принадлежность**:
   - green rows → **собственный** (own park).
   - yellow/red rows → **общий парк РЖД** (inventory). The matrix `ourProvNoVat`
     for yellow = inventory × 1.15, so to compare against R-Тариф's bare общий-парк
     plata, compute `ourProvNoVat / 1.15` (= the И+В the engine computed).
6. Read R-Тариф and paste into the row:
   - `ref_distanceKm` ← R-Тариф's расстояние,
   - `ref_provoznayaNoVat` ← провозная плата без НДС (per wagon),
   - `ref_notes` ← anything notable (e.g. a different owner coef, a scheme surprise).

## Flagging диффы

- **км diff:** `ref_distanceKm` ≠ `ourKm` → the ТР-4 graph is missing/мis-routing a leg
  on that corridor. This is the binding RF-accuracy axis (обходной/малодеятельный legs).
- **₽ diff (yellow):** `ref_provoznayaNoVat` ≠ `ourProvNoVat / ownerCoeff` → the inventory
  scheme/coefficient is off for that class/wagon. A row that matches to the ruble
  promotes that {class × wagon × band} cell from yellow → green.
- **RED rows:** there is nothing to diff yet — paste R-Тариф's number into
  `ref_provoznayaNoVat` so the цистерна / unsupported scheme can be built next.

## Regenerating / widening

```bash
# curated spread (default): 11 routes × 3 cargoes × 3 wagons = 99 rows, all 5 bands, 6 дорог
npx tsx scripts/rf-validation-matrix.mjs

# full pairwise sweep: 56 directed RF pairs × 9 = 504 rows
npx tsx scripts/rf-validation-matrix.mjs --all-routes
```

`_meta.coverage` in the JSON reports `routesResolved`, `distanceBands`, `roads`, and the
green/yellow/red `verdictTally` so you can see batch size and how much is left to certify
at a glance.

## Relationship to the other harness

`rtariff-validation.template.json` + `scripts/validate-rtariff.ts` is the **deep,
hand-curated** lever-isolation harness (48 cases that pin specific coefficients). This
batch is the **broad, machine-generated** breadth harness: many routes/cargoes/wagons to
catch coverage holes the deep set never touches. Use both — depth pins the levers, breadth
proves they hold across РФ.
