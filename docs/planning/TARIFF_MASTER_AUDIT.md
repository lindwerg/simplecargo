# TARIFF MASTER AUDIT — SimpleCargo FREE RZD Tariff Calculator

> Consolidated, fact-checked DONE / NOT-DONE map of the whole РЖД ТР-1 2026 tariff + distance engine.
> Built from 12 subsystem audit reports. Every number here traces to an on-disk file, a primary source
> (sudact.ru ТР-1 894/25), or a live test run. Nothing in this file is invented; where a fact is not in a
> primary source it is marked **fitted** / **inferred** / **sourced-unofficial** explicitly.
>
> Regulatory baseline: Прейскурант 10-01 superseded 2026-01-01 by «Тарифное руководство №1»
> (Приказ ФАС 06.11.2025 № 894/25, Минюст 22.12.2025 № 84708).

---

## 0. Executive Verdict

**The class-1 нерудные own-полувагон path is production-accurate to the ruble. Almost nothing else is.**

- The ONE happy path — own gondola (полувагон), tariff class 1, нерудные/минерально-строительные
  freight — reproduces BOTH real квитанции to the ruble and both oracle distances to the kilometer.
  This is a genuine, test-locked achievement.
- That accuracy rests on **3 fitted/inferred levers** (699 km short-haul K4 uplift; 2444 km K4 row-pick;
  innovative-gondola ×0.9595 per-wagon assignment) that are calibrated to the receipts, not derived from
  regulation text — even though the verbatim ТР-1 п.16.7 text needed to derive them is now on disk.
- The **production-wired universal engine is NOT the calibrated engine.** `computeTariffN8.ts` (the
  ruble-accurate core) has **zero production callers** — it is test-only. The wired `computeTariff.ts`
  carries an uncalibrated chain and a **~25% indexation double-count** (1.138 × 1.10) baked into its own test.
- The **tariff DB layer is undeployable**: migration `0020_far_adam_destine.sql` is an orphan — absent from
  the Drizzle journal and every snapshot — so the tariff tables are never created by `db:migrate`, and the
  orphan SQL has already drifted from the schema (`weight_t`, `etsng_group`, `ck_special_distance_order`).
- Distance, K-coefficients, ЕТСНГ registry, base rate belts and the kniga3 backbone are **strong and
  verified**; the open distance gaps are cross-border CIS connectivity, Moscow/SPb hub same-line exclusion,
  and a small N8 grid hole at 1501–1550 km.

**Bottom line:** trustworthy for class-1 нерудные own-gondola quotes via the N8 core; NOT yet safe for any
other commodity/class/wagon-type, and NOT safe through the DB-wired universal path (indexation double-count
+ undeployable migration).

---

## 1. What Reproduces to the Ruble Today (with test evidence)

| Oracle | Input | Expected | Result | Evidence |
|---|---|---|---|---|
| Квитанция ЭФ164189 | own ПВ, class-1 нерудные, 2444 km | **1 067 770 ₽** | EXACT | `goldenN8.test.ts` "ЭФ164189: TOTAL = 1 067 770 ₽" |
| Квитанция ЭТ201459 | own ПВ, class-1 нерудные, 699 km | **187 344 ₽** | EXACT | `goldenN8.test.ts` "ЭТ201459: TOTAL = 187 344 ₽" |
| Distance Route A | Возрождение (021609) → Гремячая (612709) | **2444 km** | EXACT | `computeDistance.test.ts:77` |
| Distance Route B | Исеть (771500) → Наб. Челны (648503) | **699 km** | EXACT | `computeDistance.test.ts:83` |
| R-Тариф classic | Elisenvaara → Elista, 3108 km | **82 816 ₽** | EXACT (K4=1.01) | independent node reproduction |

**Per-wagon arithmetic (independently reproduced by hand over raw seed JSON, single final round):**
- 2444 km: w70 base=160271, K1=0.68, K4=max(0.98,1.01)=1.01 → 72005 ₽; w75 base=163491 → classic 73452 ₽,
  innovative (×0.9595) → 70477 ₽. Total 1 067 770 ₽ matches only with 9 of 10 w75 wagons tagged innovative.
- 699 km: w70 base=64570, K1=0.75, K4 row(6-20)=0.98 → 31045 ₽ WITHOUT uplift; ×1.0057499686370497 → **31224 ₽** EXACT.

**Formula chain (per wagon, single round half-up at the end), `computeTariffN8.ts:236`:**
```
raw = N8base(round(capacityT), distKm)
      × 0.69993   [C_NERUD_PV = 0.77 (K3 нерудный, Табл.4) × 0.909 (полувагон, п.1.5)]
      × 0.9346    [C_OWN_PV_CLASS1, own-ПВ class-1, п.18.1.1]
      × K1(class1, dist)
      × K4(group, dist)
if innovative: raw ×= 0.9595   [Табл.6 п.3]
tariffRub = Math.round(raw)     [JS round = half-up for positives]
```

**Live test evidence (run this audit, `vitest v4.1.8`):**
```
npx vitest run src/lib/tariff src/lib/distance --reporter=dot
→ Test Files 10 passed (10) / Tests 134 passed (134) / Duration 325ms
```
- The "89/89" figure in prior notes is **stale** — the suite has grown to **134/134**.
- `npx tsc --noEmit` → exit 0 (whole-repo, 0 errors).
- Tests are hermetic: 0 ms setup; grep for `DATABASE_URL|drizzle|postgres|process.env` across `*.test.ts` in
  tariff/distance → no matches. They run from seed JSON on disk; the DB layer is NOT exercised.

---

## 2. Per-Subsystem State Table

| # | Component | Claim | Actual | Verdict |
|---|---|---|---|---|
| 1 | `src/lib/distance/` (computeDistance + dijkstra + graph + parseTransit + repository) | ТР-4 distance engine governs production | LIVE engine is `computeDistance.ts` with its OWN inline Dijkstra. `dijkstra.ts`/`graph.ts` are a parallel, never-called implementation (dead code). L_T = l1+L_K+l3, same-station→0, same-участок subtraction, take-min over ТП pairs, half-up @500m — all VERIFIED. 34/34 tests pass. | **PARTIAL** |
| 2 | `computeTariffN8.ts` (own-ПВ class-1 N8 core) | Formula order, rounding, constants, oracles all correct | Formula order & rounding VERIFIED; all 4 constants cross-checked to seed + primary source; both oracles reproduced. BUT core is **test-only (0 production callers)**; hardcodes class-1/нерудный with no class/commodity guard; single final round skips the documented per-step kopeck rounding. | **PARTIAL** |
| 3 | `schemeResolve.ts` + `seedLoader.ts` + `repository.ts` + `computeTariff.ts` (scheme resolution) | Wagon+ownership+shipment→scheme, belt-snap never interpolates, per-tonne vs per-wagon correct | All VERIFIED for polувагon path (84 classifier rows, pure range containment, correct unit split). 88/88 tests pass. BUT non-полувагон (РФ/ФП/КН/ТР, 12 rows) degrade to red — pinned i-schemes N30/N31/N39/N85/N92 have zero belts; loader drops `computable:false`/`beltFlags`. | **PARTIAL** |
| 4 | 3 fitted levers (N8 core + tr1-k4-corrected + innovative-models + reference-quotes) | All 3 reproduce to the ruble | All 3 reproduce EXACTLY, but Lever 1 (699 km uplift) is TRULY FITTED; Lever 3 (innovative per-wagon) is FITTED (no model registry; receipts have wagon NUMBERS, not models); Lever 2 (2444 K4 row-pick) is INFERRED. Verbatim п.16.7 IS now on disk (`TARIFF_RULES_EXACT.md:67-96`) but the engine cannot replay it. | **PARTIAL** |
| 5 | `kniga3-backbone.json` + `kniga3-backbone-cis.json` (Книга-3 ТП↔ТП) | 93,953 edges / 652 nodes / 61 unresolved / 15 admins | ALL four headline numbers reproduced EXACTLY. RF file production-grade (aEsr<bEsr 100%, 0 dups, 0 km≤0). CIS file weak & honestly flagged (99 reversed-ESR, 6 self-equal, 2 km=0 suspect, 64.9 KB / 464 section edges). | **CONFIRMED** |
| 6 | `uzel-graph*.json` + repository merge layer | узел-graph + overlays densify узел layer | Counts machine-verified (main 1837 nodes / 95226 edges). Runtime merge order confirmed. **gapfill 216 edges double-added** (on-disk + re-merged). Oracles derive through merged graph (71/71 green). 6 self-loops, 3 km=1 export stubs, 202-node Ukraine island disconnected. | **CONFIRMED** |
| 7 | `tr1-i-belts-full.json` + `tr1-rate-belts.json` (base rate belts) | 29,845 cells / 25 schemes / 127 belts / +10% baked in | Counts & completeness EXACT; N8 grid matches rate-belts row-for-row (0 mismatches). BUT **1501–1550 km grid HOLE** on N8/N8(1)/И1 (belts jump 1451-1500 → 1551-1600); `n8base()` throws "нет ячейки" with no snap-fallback. Folded-belt structure is NOT uniform across schemes (meta overstates). | **PARTIAL** |
| 8 | K-coefficients (K1 Табл.2, K3 Табл.4, K4 Табл.5, K5) | All values match primary source | EVERY audited K1/K3/K4 value matches sudact.ru ТР-1 894/25 Tables N 2/4/5 **verbatim**. K5 correctly absent (folded into Табл.4). Two K1 files byte-identical. 0 value discrepancies. | **CONFIRMED** |
| 9 | `etsng-classes.json` (ЕТСНГ class + МВН, 5,036) | 5,036 rows / 576-1319-3141 / 0 dups / 42 null-МВН / 6 core нерудные | ALL headline numbers EXACT. Core 6 нерудные class+МВН correct. BUT МВН is structurally collapsed to `default`+optional `пл` — no цистерна/контейнер/transporter wagon-род МВН differentiation. | **CONFIRMED** (with structural gap) |
| 10 | `tr1-coefficients.json` + `tr1-rounding-rules.json` (indexation/coeff stack) | Indexation values & dates correct; double-count guarded | Values/dates individually correct & sourced. BUT **CRITICAL double-application**: +13.8% row lacks `skipSeed`, `indexFactor()` has no `effectiveTo` check → compounds onto already-indexed base; `computeTariff.test.ts:104-106` ENCODES 1.138×1.10=1.2518 as expected. Container +5% note overstates certainty. | **PARTIAL** |
| 11 | Test suite + `tsc --noEmit` | 89/89 golden tests pass, tsc=0 | Actual **134/134** across 10 files (claim understates by 45); tsc exit 0. Hermetic (DB-free). Only a handful are golden-oracle ruble/km asserts; rest are unit tests. DB/integration paths uncovered. | **PARTIAL** (claim stale) |
| 12 | DB layer (etsng/tariffGraph/tariffSchemes schema, migration 0020, seed loaders) | §4 tariff tables deployable | **CONTRADICTED**: `0020_far_adam_destine.sql` is an ORPHAN — not in `_journal.json` (grep = 0), not in any snapshot, duplicate 0020 prefix. `db:migrate` never applies it. Orphan SQL has drifted from schema (missing weight_t / etsng_group / ck check). Schema + seed files git-untracked. Seed loaders themselves are defensive (no silent mutation). | **CONTRADICTED** |

**Verdict legend:** CONFIRMED = claim holds and is verified · PARTIAL = core verified but material gaps · CONTRADICTED = claim is false as stated.

---

## 3. Discrepancies Between Docs/Claims and Reality

### Critical correctness contradictions
1. **Indexation double-count (the load-bearing pricing bug).** `tr1-coefficients.json` `_meta` says +13.8% and
   +10% are ALREADY in the ТР-1 2026 base and must NOT be re-applied. Reality: only the +10% row carries
   `skipSeed:true`. The +13.8% row is seeded as `kind='index'`; `repository.ts:147-153` drops `effectiveTo`;
   `coefficients.ts:111-135` `isIndexApplicable` checks only `effectiveFrom`. So +13.8% compounds on the
   already-indexed base for any as-of-2026 calc. `computeTariff.test.ts:104-106` asserts
   `indexFactor=1.138×1.10=1.2518` as correct → the test LOCKS IN a ~25% overcharge on the universal path.
   N8 golden path is unaffected (fed with empty indexations), which is exactly why the bug is masked.
2. **Orphan tariff migration.** `0020_far_adam_destine.sql` is absent from `drizzle/migrations/meta/_journal.json`
   (grep = 0, confirmed this audit) and from every `*_snapshot.json`. Journaled idx 20 is `0020_violet_iron_man`
   (email migration). The tariff tables are NEVER created by the standard `db:migrate` runner, yet
   `db:seed:graph/etsng/tariff` target them. Duplicate 0020 prefix on disk.
3. **Schema ↔ migration field drift** (even if the orphan were registered): orphan SQL is missing
   `tariff_rate_belt.weight_t` (+ 3-col PK + check), `class_coeff.etsng_group` (+ 3-col PK), and
   `special_distance` check `ck_special_distance_order (a_esr<b_esr)`. The `class_coeff` drop would collapse the
   class-3 1.74-vs-1.54 split — a real price regression if that stale table were ever used.

### Stale / misleading documentation
4. **"п.16.7 verbatim text not available at build time"** — `computeTariffN8.ts:44-50` and `:127` claim this.
   FALSE: verbatim п.16.7.1/16.7.2/16.7.3 + п.17.2 are on disk at `TARIFF_RULES_EXACT.md:67-96`.
5. **"89/89 golden tests"** — actual is 134/134; and most are unit tests, not golden oracles.
6. **`special-distances.json` is dead code** — engine matches `s.a===originEsr` (6-digit ESR) but the single
   override stores station-name strings (`"Московский узел (Малое кольцо…)"`), so the §2 особые-расстояния
   branch (`computeDistance.ts:307-319`) is permanently unreachable. JSDoc and matcher disagree.
7. **cisfill README connectivity figures are stale** (385 components / 808 largest / 44%) — describe a
   pre-gapfill snapshot; current on-disk graph is 169 comps / 1091 largest / 59%.
8. **`tr1-i-belts-full.json` `_meta.beltStructureNote`** presents the 1551-1600 fold as universal; it applies
   only to the 3 2D schemes — the 22 distance-only schemes use an unfolded 1501-1600 belt.
9. **`goldenN8.test.ts:138`** comment claims JS `Math.round` is round-to-even; it is round-half-up (result
   correct, reasoning wrong).
10. **seedLoader comment** claims non-computable rows degrade "gracefully (scheme found → yellow/red)" — but it
    drops `computable`/`beltFlags`, so the failure surfaces as a generic belt-miss, never the real root cause.
11. **Container +5% note** says "ВРЕМЕННО ОТМЕНЕНА" (sourced-unofficial); real Dec-2025 status is "proposed in
    draft приказ ФАС, 2026 approval pending". No calc impact (`skipSeed=true`).
12. **VAT 22%** hardcoded (`computeTariff.ts:52`); seed files agree, but 2026 domestic НДС needs primary-source
    confirmation — if 20% this is a +2pp systematic overcharge on the universal path (N8 path is VAT-free).

---

## 4. Master Gap Register (sorted by severity)

`MD` = machineDerivable (closable from data/code without new external facts).
`Source` = file(s)/owner responsible for the fix.

### CRITICAL
| # | Gap | MD | Source |
|---|---|---|---|
| C1 | Indexation double-count: add `skipSeed:true` to the +13.8% row (or honor `effectiveTo` in `indexFactor`/`IndexationLike`) so the historical index is not compounded onto the already-indexed 2026 base. | ✅ | `tr1-coefficients.json`, `coefficients.ts`, `repository.ts:147` |
| C2 | `computeTariff.test.ts:104-106` ENCODES the 1.138×1.10 double-application as expected — must be rewritten to the "base already indexed, indexFactor=1.0 for 2026" contract, else the fix is blocked. | ✅ | `computeTariff.test.ts` |
| C3 | Regenerate the tariff migration via `db:generate` (journaled, snapshotted, field-accurate: weight_t, etsng_group, ck_special_distance_order); delete orphan `0020_far_adam_destine.sql`; resolve duplicate-0020 (next idx 0022). | ✅ | `drizzle/migrations/`, schema `*.ts` |
| C4 | LEVER 1 — `SHORT_HAUL_BOUNDARY_UPLIFT=1.0057499686370497` is hard-fitted to ET201459. Close it by implementing verbatim п.16.7.2/16.7.3 + п.17.2 (absolute-delta max-of-two on previous-belt max-distance K3-corrected rate, round-to-kopeck each step) — text already on disk at `TARIFF_RULES_EXACT.md:67-96`. Requires rebuilding the flat-multiply chain into the staged 16.5-16.10 calc. | ✅ | `computeTariffN8.ts:50` |
| C5 | LEVER 3 — innovative ×0.9595 per-wagon assignment has NO wagon-model registry. Receipts (`reference-quotes.json` EF164189) carry wagon NUMBERS, not models; the 9-vs-1 split is reverse-engineered from the total. Needs operator-supplied per-wagon model (from вагонный лист / ГУ-27у) → number→model→`tr1-innovative-models.json`. | ❌ | `reference-quotes.json`, operator input |

### HIGH
| # | Gap | MD | Source |
|---|---|---|---|
| H1 | Two divergent tariff engines: calibrated `computeTariffN8.ts` has 0 production callers; the wired `computeTariff.ts` does NOT reuse the calibrated own-ПВ chain (0.9346 / 0.69993 / 699 uplift). Production path is the un-validated one. | ❌ | `computeTariffN8.ts`, `computeTariff.ts` |
| H2 | N8 core hardcodes class-1/нерудный with no class/commodity argument and no red-confidence guard — any non-class-1/non-нерудный input returns a silently wrong confident ruble. Parameterize via `OWN_GONDOLA_CLASS_FACTOR` + K3 commodity, or gate to class-1 нерудные only. | ✅ | `computeTariffN8.ts:236` |
| H3 | Moscow/SPb hub same-line EXCLUSION not implemented — engine adds +54/+25 unconditionally (`computeDistance.ts:351-359`), over-adding km (and money) on same-line узел moves. Line→station membership already in `hub-distances.json`. | ✅ | `computeDistance.ts`, `hub-distances.json` |
| H4 | `special-distances.json` matcher mismatch (ESR vs station-name strings) → §2 особые-расстояния branch permanently dead. Re-key overrides to 6-digit ESR or resolve names→ESR. | ✅ | `computeDistance.ts:307`, `special-distances.json` |
| H5 | N8/N8(1)/И1 **1501–1550 km grid hole** — `n8base()` throws with no snap-to-nearest; ~1.4% of the 0–3500 km domain on the primary scheme is uncomputable. Add snap rule or re-check ТР-1 Прил.N2 for a dropped 1501-1550 row. | ✅ | `tr1-i-belts-full.json`, `computeTariffN8.ts` |
| H6 | Non-полувагон scheme resolution (РФ/ФП/КН/ТР, 12 rows): pinned i-schemes N30/N31/N39/N85/N92 have zero belts → all refrigerator/fitting-platform/container/transporter quotes degrade to red. Need belt tables (container per-size 85-94, transporter per-axle 39-74, refrigerator 30/31). | ✅ | `tr1-i-belts-full.json`, classifier |
| H7 | LEVER 2 — gruppovaya → Табл.5 row '1' vs '6-20' at >2000 km is INFERRED from the 2444 oracle. п.16.7/17.2 verbatim on disk does not explicitly tie own-wagon gruppovaya to the row-1 (повагонная) coefficient. Needs п.17.2 worked example / FAS clarification. | ✅ | `tr1-k4-corrected.json`, `TARIFF_RULES_EXACT.md` |
| H8 | 75т→70477 @2444 km reachable ONLY via the innovative tag — if that assignment is wrong, the 2444 per-wagon figure is not independently sourced. Same operator wagon-model input as C5. | ❌ | `reference-quotes.json`, operator input |
| H9 | 61 RF backbone ESR (2 synthetic узел 000015/000023 anchoring 382 edges each + 14 Crimea 47xxxx + 45 Donbass/Lugansk 20/8x/9x) resolve to no seed CSV. Need name-based ESR resolution or explicit узел/contested rows. | ✅ | `kniga3-backbone.json`, station CSVs |
| H10 | CIS file `aEsr<bEsr` invariant NOT enforced (99 reversed, 6 self-equal) — consumers assuming the RF sorted-ESR guarantee will miss CIS edges. Normalize + repair self-loops. | ✅ | `kniga3-backbone-cis.json` |
| H11 | CIS ESR coverage weak on high-value foreign legs (КЗХ 64%, УТИ 56%, КРГ/ЯЖД/РУБК 0–25%) due to 2020-CSV name vintage. Needs alias map / station rows to price RF→KZ etc. by ESR. | ✅ | `kniga3-backbone-cis.json` |
| H12 | Cross-border distance must be Σ(section legs) per-administration, segmented at the border ТП — a different code path from the RF verbatim-edge Dijkstra. Confirm the engine does per-admin segmentation, not one merged graph (one graph finds illegal border-skipping paths). | ✅ | `src/lib/distance/`, CIS README |
| H13 | 202-node Ukraine (УЗ) island + Caucasus + Central-Asia clusters disconnected from RF core — no border bridges (matches gap #4: 15 admins, cross-border distance unavailable). 49 singleton leaf nodes unreachable. | ❌ | `uzel-graph*.json`, border data |
| H14 | 3 km=1 export-stub edges (Климов(эксп.)→Орск/Карталы/Зауралье) span hundreds of real km at 1 km — will badly underprice any route through Климов. Need real Книга-3 styk distances or removal. | ❌ | `uzel-graph.json` |
| H15 | Verify `tr1-k4-full.json` (the file the production engine loads at `seedLoader.ts:266`) carries the same verbatim Табл.5 values confirmed in the test-only `tr1-k4-corrected.json`. | ✅ | `tr1-k4-full.json` |
| H16 | ЕТСНГ МВН triplet precision: registry collapses all wagon-родs to `default`+optional `пл` — цистерна/контейнер/transporter/рефрижератор МВН not differentiated; any non-нерудный path using another род uses the wrong МВН. | ✅ | `etsng-classes.json` |
| H17 | Per-container (N85-94) and per-axle transporter (N39+) DIMENSION not modeled — `snapToBelt` has only distance + single weight tier. Stubbed. | ❌ | `schemeResolve.ts`, belt data |
| H18 | Commit untracked tariff schema files + `scripts/seed/*` alongside the regenerated migration (whole DB layer is uncommitted working-tree state). | ✅ | git working tree |
| H19 | Add `effectiveTo` handling to `IndexationLike`/`isIndexApplicable` and stop dropping it in `repository.ts` index-row mapping — general guard so any expired indexation self-deactivates. | ✅ | `coefficients.ts`, `repository.ts` |
| H20 | Verify (line-by-line, against ТР-1 894/25 Прил.N2) that +10% is literally embedded in the base rate tables — the entire double-count guard rests on this currently-unofficial `_meta` assertion. | ❌ | ТР-1 Прил.N2 primary source |
| H21 | Verify end-to-end on a fresh DB that `db:migrate` then `db:seed:graph/etsng/tariff` succeed (no DB reachable this audit). | ❌ | live DB |

### MEDIUM
| # | Gap | MD | Source |
|---|---|---|---|
| M1 | N8 core does no intermediate per-step kopeck rounding (16.6/16.7.1/16.8/16.9) — defers to one final ruble round. Unverified whether faithful rounding changes any ruble result. | ✅ | `computeTariffN8.ts`, `tr1-rounding-rules.json` |
| M2 | VAT hardcoded 22% (`computeTariff.ts:52`) — confirm 2026 domestic НДС against primary source; if 20%, universal engine overcharges 2pp. | ✅ | `computeTariff.ts`, primary source |
| M3 | Adjacent-section subtraction (L=l1+l2 across two участки sharing a узел) not implemented; `sameUchastokDistance` only does same-uchastok |cum diff|; adjacent pairs fall back to backbone enumeration (may overestimate). | ✅ | `computeDistance.ts:256` |
| M4 | `sameUchastokDistance` returns FIRST matching anchor, not MIN over shared (uchastok,uzel) anchors — order-dependent on loop/multi-anchor участки. | ✅ | `computeDistance.ts:256` |
| M5 | seedLoader drops classifier `computable:false`/`beltFlags`/`confidence` — propagate into `SchemeResolution` so the engine emits the real root-cause warning + gates confidence. | ✅ | `seedLoader.ts:111-126` |
| M6 | `snapToBelt` latent bug: weight-dim scheme + null weight silently returns wrong-tier (first) belt — add guard `found:false+warning`. | ✅ | `schemeResolve.ts:125` |
| M7 | ЦС own-cistern empty leg pins scheme '25' (gondola) while cistern empty scheme '29' exists and is unused — verify against Табл.N8 порожний rules. | ❌ | classifier, `tr1-empty-run-full.json` |
| M8 | Add explicit `perWagon|perTonne` unit field per belt cell — `weightT=null` is shared by both за-вагон (И2-И7, N9-N13) and за-тонну (И14-И18, N19-N24) schemes; "null⇒per-tonne" mis-bills. | ✅ | `tr1-i-belts-full.json` |
| M9 | Reconcile `_meta.beltStructureNote` to state the 1501-1600 grid is scheme-dependent (2D folded vs distance-only unfolded). | ✅ | `tr1-i-belts-full.json` |
| M10 | Verify ТР-1 Прил.N2 source HTML confirms the 1501-1550 fold is official (not a scrape artifact). | ✅ | `tr1-i-belts-full.json`, sudact.ru |
| M11 | Update stale `computeTariffN8.ts:44-50/127` comments claiming п.16.7 verbatim is unavailable — it is on disk. | ✅ | `computeTariffN8.ts` |
| M12 | K3 coal directional split (export подкоды 161016/161132→1.05 vs domestic 161024/161039→0.895) incomplete; ЕТСНГ-151 duplicate подкод (глинозём/никель/цв.металлы) mapping incomplete. | ✅ | `tr1-k3-full.json` |
| M13 | Correct container +5% note from "ВРЕМЕННО ОТМЕНЕНА" to "draft приказ ФАС Oct-2025, 2026 unconfirmed"; obtain final Dec-2025 ФАС приказ. | ❌ | `tr1-coefficients.json`, ФАС gazette |
| M14 | 6 ЕТСНГ rows with genuinely absent source МВН (421231/421246/422060/694041/694056/694060) — ТКО/RDF 694xxx blocks tariff calc on those codes. | ✅ | `etsng-classes.json` |
| M15 | 6 self-loop edges in uzel-graph (Джурджулешть/Унгень/Алят/Карадаг/Баку-Товарная/Сангачалы, nonzero km) — Сангачалы becomes an effective singleton. Strip them. | ✅ | `uzel-graph.json` |
| M16 | Теткино↔Глушково km=25 (gapfill2) self-admitted border-approximate / fitted-not-sourced — needs primary tariff km. | ❌ | `uzel-graph-gapfill2.json` |
| M17 | Карталы I↔Тобол km=142 (cisfill) sourced-unofficial (flagma.kz+tr4) — the only non-zero CIS bridge; unverified vs official КЗХ/Книга-3. | ❌ | `uzel-graph-cisfill.json` |
| M18 | 2 CIS edges km=0 (Туркменбаши–Бюзмейин; ЛЕНИНСК(стык)–МИХАЙЛО-СЕМЕНОВСКАЯ) flagged suspect — exclude or distance-verify before any traversal. | ❌ | `kniga3-backbone-cis.json` |
| M19 | CIS section distances sourced from undated tr4.info Книга-1 (unofficial) — only 3 spot-checks validated; flag for Layer-C drift watch + official spot-verify before production КП. | ❌ | `kniga3-backbone-cis.json` |
| M20 | Add CI/check (drizzle-kit check or journal-vs-disk assert) to catch orphan migrations / schema drift before deploy. | ✅ | CI config |
| M21 | No DB/integration test for `repository.ts` layers (distance + tariff) — DB queries unverified. | ✅ | test suite |

### LOW
| # | Gap | MD | Source |
|---|---|---|---|
| L1 | Remove or wire up dead `dijkstra.ts`/`graph.ts` (+ tests) — unused parallel implementation; maintenance hazard. | ✅ | `src/lib/distance/` |
| L2 | Memoize `toBackbone()`/`backboneTerminal()` across the oLegs×dLegs loop (currently un-memoized Dijkstra w/ pq.sort per pop). | ✅ | `computeDistance.ts` |
| L3 | `parseTransit` bare `-0` token returns null vs JSDoc claiming km 0 — trivial doc/guard fix. | ✅ | `parseTransit.ts` |
| L4 | gapfill 216 edges DOUBLE-ADDED at runtime (on-disk source=kniga1 + re-merged) — harmless to shortest-path, indicates un-reconciled build step. | ✅ | `repository.ts:124`, `uzel-graph.json` |
| L5 | 69 duplicate node NAMES (Нестеров/Джанкой/Советск/Керчь-Порт…) create name-resolution ambiguity for any name-based UI lookup. | ✅ | `uzel-graph.json` |
| L6 | cisfill README connectivity figures stale (385/808/44% pre-gapfill) — refresh to 169/1091/59%. | ✅ | cisfill README |
| L7 | `resolveK4Full` route path only looks up 'маршрут прямой', never 'маршрут с распылением' (no input field distinguishes them). | ❌ | `schemeResolve.ts` |
| L8 | K1 class-3 1.74 ЕТСНГ position list not exhaustively cross-checked position-by-position (engine only exercises class-1). | ✅ | `tr1-class-coeff.json` |
| L9 | Two source-of-truth K1 files (`tr1-class-coeff.json` vs `-corrected.json`, currently byte-identical) — drift hazard. | ✅ | K1 seed files |
| L10 | Gate `appliesTo='minstroy'` on actual minstroy cargo class, not just the date window (latent "applies to all cargo if window extended"). | ✅ | `coefficients.ts:169` |
| L11 | ПЛ-0 anomaly on ЕТСНГ 694018 ('40,ПЛ-0' → пл:0); casing 'г/п' vs 'Г/П' on 151183 — verify vs consultant.ru LAW_522347. | ✅ | `etsng-classes.json` |
| L12 | Add per-row source-provenance tag (sourced-official vs scraped) to ЕТСНГ registry so calc can surface confidence. | ❌ | `etsng-classes.json` |
| L13 | tsc covers whole repo (passed) but uncommitted schema/migration not type-checked against a live DB. | ✅ | schema, migration |

---

### Severity tally
- **CRITICAL: 5** (C1–C2 indexation double-count + locked-in test; C3 orphan migration; C4 fitted 699 uplift; C5 innovative registry)
- **HIGH: 21**
- **MEDIUM: 21**
- **LOW: 13**
- **machineDerivable: 47 of 60** gaps are closable from data/code alone; **13** need external facts or operator/DB input.
