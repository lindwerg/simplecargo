# ТР-1 2026 — Engine Conformance (rule → IMPLEMENTED / DIVERGES / MISSING)

> **What this is.** A per-rule audit of the SimpleCargo tariff engine against the verbatim ТР-1 2026 calc order (rulebook chunk [`rulebook/prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) + verbatim quotes in [`TARIFF_RULES_EXACT.md`](./TARIFF_RULES_EXACT.md) §2–§5 + machine seed [`scripts/seed-data/tr1-rounding-rules.json`](../../scripts/seed-data/tr1-rounding-rules.json)). Index of all rules: [`TR1_RULEBOOK.md`](./TR1_RULEBOOK.md).
>
> **Engines audited (all under `src/lib/tariff/`):**
> - `computeTariffN8.ts` — the **certified** own-полувагон N8 contour (the golden-oracle path).
> - `computeTariff.ts` — the **orchestrator** (routes certified contour; has a universal/container/cistern fallback).
> - `computeInventory.ts` — the **общий-парк (inventory)** path (N8 груж + N25(1)@60% + В), self-flagged «НЕ ВЫВЕРЕНО».
>
> **Top-line verdict.** The certified N8 chain is a faithful, kopeck-exact transcription of пп.16.5→16.9 + the 16.7.3 max-of-two + 15.4/15.5 rounding + 18.1.1/18.2 — **IMPLEMENTED**. The orchestrator honors scheme/coefficient order and routes the certified contour correctly, but on its **universal fallback** and on **computeInventory** it **DIVERGES from п.15.4** (no per-step kopeck rounding — one float chain rounded once). Across **all three** engines, **п.16.10** (subtracting Табл.N12/N13 + п.28.2 reductions before the п.15.5 round) is **MISSING** for the cargo path; the inventory engine instead hardcodes a **−754 ₽** discount with only a vague «п.16.x» reference. **No fabricated numbers found** — every coefficient traces to a sourced rule constant.

---

## A. DIVERGES / MISSING first — real money risks (fix these)

| Sev | Rule | Verdict | Engine ref | Money risk + concrete fix |
|---|---|---|---|---|
| **HIGH** | **п.16.10 / 15.5** — subtract Табл.N12/N13 + п.28.2 reductions **before** the whole-ruble round | **MISSING (cargo path)** | `computeTariffN8.ts` has no reduction subtraction; `computeTariff.ts` has none on universal/cistern paths | Inert for щебень (no reductions apply), but **mandatory** before any FCL container or контрейлер КП — otherwise such КП over-charge by the Табл.N12 amount. Fix: fetch Табл.N12 (still `TO FETCH`), wire a `reductions` term applied at 16.10 and subtracted before `round1()`. Until then, guard: refuse/flag FCL КП rather than silently omitting the reduction. |
| **HIGH** | **−754 ₽ inventory discount** — engine does what the docs do NOT justify (a **fitted lever**) | **DIVERGES** | `computeInventory.ts:38` `const INVENTORY_DISCOUNT = 754;` applied at `:229` `Math.round(loaded + emptyLeg + vLeg - INVENTORY_DISCOUNT)`; comment `:16` cites only «скидка 754 (п.16.x)» | A flat −754 ₽/вагон with no clause is a reverse-engineered fit, not a derivable ТР-1 reduction. Real risk: every общий-парк quote is off by a constant that has no primary-source anchor. Fix: identify the actual Табл.N12/N13 or п.28.2 reduction it stands in for (or prove it is none) and replace the magic 754 with the sourced rule — or remove it. The file is self-flagged «НЕ ВЫВЕРЕНО»; treat its output as provisional. |
| **MED** | **п.15.4** — promezhutochnoe округление до целых копеек **after each** ×coefficient | **DIVERGES (universal fallback)** | `computeTariff.ts:735` `iComponent = iBaseRate*k1*k3*k4*innov*surcharge*dopIndex` is ONE float product; only `round2`/`Math.round` at the end (`:816`, `:824`). No per-step `round01`. | Float-chain-then-round-once drifts by a kopeck or two vs the official engine on the universal branch (the certified N8 path is exempt — it routes through `computeTariffN8`). Fix: on the universal fallback, apply `round01()` after each coefficient multiply exactly as `computeTariffN8.ts:460–462` does. Low magnitude per quote but it is the literal "в рубль" gap. |
| **MED** | **п.15.4** — same, on the inventory path | **DIVERGES** | `computeInventory.ts:204` `loaded = loadedBase*k1*C_K3_NERUD*C_NERUD_PV_GONDOLA*C_DOP_INDEX` single float; round only at `:229` | Same kopeck-drift class as above, compounded by the −754 lever. Fix: insert `round01()` after each multiply (the file already imports `round01` at `:30` but does not use it on the loaded leg). |
| **MED** | **порожний 60% vs actual** — 16.5.1 «60% от груженого рейса по N25(1)» is **общий-парк only** | **CORRECT but fragile** | `computeInventory.ts:44` `POROZH_DISTANCE_FRACTION = 0.6`, `:212` `emptyDistKm = round(distKm*0.6)`, scheme `25(1)`. `computeTariff.ts` own path uses **full-distance N25**, no 60% | This is **right today** (60% only on the inventory/общий-парк engine; собственный uses actual N25 full haul). Risk is regression: if anyone copies the 0.6 into the own-wagon path it over/under-charges собственный vagons. Fix: keep a guard/test asserting own path never applies `POROZH_DISTANCE_FRACTION` and never adds a В-component. |
| **LOW** | **Табл. N3 directional** vs **Табл. N4 commodity** are distinct (§I п.10) | **MISSING (directional)** | No directional seed; `00-index` maps both N3 and N4 onto `tr1-k3-full.json` | No directional surcharge/discount is applied. Inert unless a priced direction has a Табл.N3 coefficient. Fix: split a dedicated `tr1-k3-directional.json` from Табл.N3 once fetched; wire it as an additional 16.9 multiplier. |

---

## B. IMPLEMENTED — faithful transcriptions (no action)

| Rule | Verdict | Engine ref | Note |
|---|---|---|---|
| **п.15.4** per-step round to 0,01 ₽ (certified contour) | **IMPLEMENTED** | `computeTariffN8.ts:40` `round01()`, applied at `:444` (16.6), `:307/:315/:316` (16.7.1/.2), `:457` (16.8), `:460–462` (16.9), `:472` (innov) | Matches `tr1-rounding-rules.json.roundingSteps` clause-for-clause. |
| **п.15.5** final ruble round, half-up, повагонная | **IMPLEMENTED** | `computeTariffN8.ts:45` `round1()` half-away-from-zero, used `:484`; orchestrator `computeTariff.ts:824` `Math.round`, cistern `:656` `round1` | `round1`/`Math.round` are half-up for positive tariffs = `roundMode.mode=half_up`. |
| **пп.16.1→16.4** order: расстояние → вид/тип/принадлежность → класс/ЕТСНГ → схема + коэффициенты | **IMPLEMENTED** | `computeTariff.ts` class/ЕТСНГ → distance → `resolveSchemes` (own/rzd → И/В/empty) precede rate lookup | Order matches the §II step map. |
| **п.16.5 / 16.5.1** общий-парк three-component sum (N8 груж + N25(1)@60% + В) | **IMPLEMENTED** | `computeInventory.ts:203` loaded(N8) + `:212–219` emptyLeg(25(1)@60%) + `:226` vLeg(В4/В1) | Three components present for общий парк. |
| **п.16.5.1** собственный/арендованный = NO В + full-distance N25 | **IMPLEMENTED** | `computeTariff.ts:8–9` header contract («В only if ownership='rzd'», «порожний only if own»); own path omits В, full-distance N25 | Exactly as rulebook §6 item 1 demands. Load-bearing — do not regress. |
| **п.16.6** K3 commodity as с-расстояния correction → round 0,01 | **IMPLEMENTED** | `computeTariffN8.ts:444` `baseK3 = round01(baseRate * C_K3_NERUD)` | Degenerate-from-km-1 case for нерудный 0,77 (see §C residual). |
| **пп.16.7.1/.2/.3 + 17.2** K4 max-of-two абс. величина + пояс floor | **IMPLEMENTED** | `computeTariffN8.ts:307` candCur, `:315–316` candPrev, signed max-of-two; mirrored in `computeTariff.ts:253–260`, `computeInventory.ts:151–157` | candPrev = 0 in first belt, matches п.16.7.2. |
| **п.16.8** add 16.7 correction onto 16.6 base → round 0,01 | **IMPLEMENTED** | `computeTariffN8.ts:457` `v = round01(baseK3 + k4r.correction)` | — |
| **п.16.9** sequential × K1 (Табл.2), нерудный ×0,909, own-полувагон class, innov ×0,9595 | **IMPLEMENTED** | `computeTariffN8.ts:460` ×k1, `:461` ×0,909, `:462` ×0,9346, `:472` ×0,9595 — `round01` each | Class factors verbatim from п.18.1.1. |
| **§I п.12** K1 ∉ группа В | **IMPLEMENTED** | inventory applies k1 only to the loaded(N8) leg `:204`; vLeg `:226` carries no k1 | Confirms architecture. |
| **§I п.13** НКО included in scheme rate (no separate НКО line) | **IMPLEMENTED** | No engine adds a separate НКО charge; `tr1-i-belts-*.json` rates are full scheme rates | Adding НКО separately would double-charge. |
| **п.18.2** МВН weight floor `max(actual, МВН)` + over-max per-ton | **IMPLEMENTED** | `tr1-min-weight-norms.json`; over-max per-ton handled in N8 base lookup | The only floor (no general ruble minimum exists in §II). |
| **Индексация / НДС** outside §II, applied last | **IMPLEMENTED** | +10% baked into Прил.N2 base (not re-applied); НДС 22% domestic / 0% export at `computeTariff.ts` VAT | Matches `TARIFF_RULES_EXACT.md` §7. |
| **Приказ п.3** effective-date gate 2026-01-01 | **IMPLEMENTED** | `tr1-rounding-rules.json._meta.regulation` | Primary-source proof now pinned in `prikaz.md`. |

---

## C. Residual NEEDS-VERIFICATION (not money-wrong yet, but unproven)

1. **K3 «с-расстояния» degeneracy.** Engine models нерудный K3=0,77 as flat `× 0,77` from km 1 (`computeTariffN8.ts:444`). If Табл.N4 introduces 0,77 only beyond a threshold km, the full п.16.6 delta formula `rate(L_from) + K3·(rate(L)−rate(L_from))` must be used instead. **Verify the Табл.N4 «с расстояния» column for positions 231–236 cell-by-cell** (chunk [`rulebook/tablitsa-n-4.md`](./rulebook/tablitsa-n-4.md)).
2. **K4 on the порожний leg.** Whether Табл.N5 max-of-two applies to the N25 порожний for own wagons — п.17.1 lists schemes 8/8(1) but порожний schemes N25–29 are addressed separately. `computeInventory.ts:214` applies K4 to the empty leg; confirm against the Табл.N5 applicability list ([`rulebook/tablitsa-n-5.md`](./rulebook/tablitsa-n-5.md)).
3. **пп.22–25 scheme numbering** unresolved between the WebFetch summarizer and `00-index` (рефрижераторные / изотермические / контейнеры / контрейлерные / транспортёры). Only пп.18 and 21 are cross-checked against captured bodies. Affects non-полувагон branches only — read the rendered §II body directly before trusting those branches.

---

## D. Fitted levers the docs do NOT justify (highlight)

| Lever | Where | Status | Verdict |
|---|---|---|---|
| **−754 ₽** flat inventory discount | `computeInventory.ts:38,229` | cited only as «п.16.x» | **Unjustified by primary source.** Must map to a real Табл.N12/N13/п.28.2 reduction or be removed. (Also tracked in `TARIFF_LEVER_KILL.md`.) |
| **порожний надбавка ×1,1 / ×1,06** | empty-leg multiplier | sourced to Приказ ФАС 999/24 in `TARIFF_RULES_EXACT.md` §6 / `computeInventory.ts:13` (×1,06) | Has a citation, but the **999/24 надбавка is outside ТР-1** — keep its source pinned and re-verify on each indexation cycle. Not a ТР-1 §II rule. |

**Conversely, rules the docs require that the engine MISSES:** only **п.16.10 reductions (Табл.N12/N13 + п.28.2)** for the cargo path — see row 1 of §A. Everything else the docs mandate is implemented on at least the certified contour.
