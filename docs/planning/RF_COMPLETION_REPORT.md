# RF Completion Report — honest end-state (distance + tariff)

> **Date:** 2026-06-09 · **Branch:** `feat/tariff-universal-coverage`
> **Scope:** RUSSIA (RF) end-to-end. **CIS / Baltic / foreign is explicitly OUT of scope** this run — flagged where it surfaces, never priced, never bridged.
> **No-fabrication contract honoured.** Every km / coefficient / belt below traces to a primary source (Приказ ФАС 894/25 on sudact, Книга-1 `kniga1-sections.json`, Книга-3 `kniga3-backbone.json`, ТР-4) or is computed from them by a documented rule. No number was invented. Unresolved data → flagged with the source-to-obtain, never a plausible number.
> **Confidence model:** **green** = oracle-certified (reproduces an R-Тариф reference to the kopeck via a regression test); **yellow** = computed per an official ТР-1 / ТР-4 table but not yet pinned by a kopeck oracle; **red** = missing primary-source data → engine emits NO number.

This report is the synthesis. The four primary audits it draws on are authoritative for their domain:
- [`RF_STATION_COVERAGE.md`](./RF_STATION_COVERAGE.md) — station reachability over the ТР-4 engine.
- [`RF_ROUTING_GENERALIZATION.md`](./RF_ROUTING_GENERALIZATION.md) — the обходной-undercut class, RF-wide.
- [`RF_TARIFF_COVERAGE.md`](./RF_TARIFF_COVERAGE.md) — the (wagon × class × commodity) money matrix.
- [`RF_VALIDATION_BATCH.md`](./RF_VALIDATION_BATCH.md) + `scripts/seed-data/rf-validation-matrix.json` — the operator certification path at scale.

---

## 0. Gate at report time (verified, not asserted)

- `npx vitest run src/lib/tariff src/lib/distance --reporter=dot` → **246 passed (18 files)** (was 244; +2 from the hunt-data wirings).
- `npx tsc --noEmit --pretty false` → exit 0, 0 errors. Whole suite `npx vitest run` → **690 passed (70 files)**.
- All **4 distance oracles** EXACT: 2444 (021609→612709), 699 (771500→648503), 3108 (023202→528706), **1432** (023202→061108 Решетниково via Ховрино, NOT via Тверь-62) — unchanged after wiring the Belarus (БЧ) backbone, because it was wired ADDITIVE-only (БЧ stationLegs + foreign ТП↔ТП edges + border-стык promotion), so no RF узел-graph edge moved.
- All **17 tariff oracles** EXACT: 1067770 / 187344 / 82816 / 101035.52 (kopeck) + the 13 goldenBatch0609 (ПВ/платформа/цистерна class 1/2/3 + inventory 110170 / 105804 + CIS-C3 391135).
- Engine + seed-data byte-integrity preserved through the station-coverage, routing, and post-hunt audits (the coverage harness was read-only and deleted; the routing detector is provably oracle-safe — see §2; the transporter rate file was added as a superseding rate plate that fires only for transporter schemes N39–N74, untouched by any oracle).

---

## 0a. Post-hunt state of the 5 hunted RF gaps (2026-06-09)

After an exhaustive multi-source hunt, each of the five remaining RF gaps resolves as below. **CLOSED-with-data** = a verbatim primary source was found and the data is on disk; **PARTIAL** = core verified verbatim but a sub-cell remains LLM-extracted / paywalled; **GENUINELY-NON-PUBLIC** = no open per-item source exists after the sources listed were tried.

| # | Gap | Result | Data on disk | Wired into engine? | Source (verbatim) |
|---|---|---|---|---|---|
| 1 | **ЖД Якутии АЯМ corridor** (Тында→Беркакит→Нерюнгри→Алдан→Томмот→Нижний Бестях) | **CLOSED-with-data** (yellow — derivable, not oracle-pinned) | `scripts/seed-data/kniga3-aym.json` — 23 ТП↔ТП edges | **NOT yet wired** (no `repository.ts` reference) | `rzd-stations-20231230.csv` field[4] «Транзитные пункты» + field[5] «Комментарий», verbatim km offsets. ТР-4/tr4.info publishes NO ЖД Якутии ТП rows, so the CSV is the authoritative on-disk primary. Each edge km = difference of two verbatim published offsets (no interpolation). Cross-validated: Тында→Томмот = 590 km confirmed by two independent CSV columns. |
| 2 | **Транспортёр rate plates** (схемы N39–N74) | **CLOSED-with-data — RED→computable** | `scripts/seed-data/tr1-i-belts-transporter-rates.json` — **4572 / 4572 `rateRub` filled** (was all null) | **WIRED** (`seedLoader.ts` lines 259–273, `unit:"perTransporter"`, supersedes the null-rate stub) | Приказ ФАС России от 06.11.2025 N 894/25, рег. Минюст 22.12.2025 N 84708 (в силе 2026-01-01), Приложение N 2 «Тарифы на перевозки грузов … на N-осных транспортёрах», схемы N39–N74 (36 схем, 127 поясов). Each of 8 pages fetched full + anchor rows independently re-fetched (0-5, 51-60, 421-450, 1501-1600, 11701-11900) — all anchors matched. Corrects the old stub's erroneous 1551-1600 band → verbatim 1501-1600. **N75–N78 (remainder of 32-axle) OUT of this file's scope.** |
| 3 | **Container +5% indexation / Table N10 map + reefer N30/N31** | **PARTIAL** | `scripts/seed-data/tr1-container-reefer-verify.json` (findings-only, does not touch any rate seed) | n/a (verification artifact) | (a) **Container +5% order — PARTIAL/yellow:** the registered ФАС order is identified by title + Минюст registration metadata, but the operative +5% clause text is NOT byte-verbatim accessible (paywalled). (b) **Table N10 (container типоразмер→scheme) — PARTIAL:** located at sudact `…/tablitsa-n-10/`; the loaded-container core (schemes 85–94) is GREEN-confirmed across two independent fetches, but the empty/own-use scheme cells + coefficients are LLM-extraction (NOT byte-verbatim) and diverged between passes. (c) **Reefer N30/N31 — VERIFIED byte-for-byte** against sudact `…/prilozhenie-n-2/…tarify…_4/`; sampled cells GREEN, file overall stays AMBER per its own `_meta` (not all 127×2 cells human-verified). |
| 4 | **Малодеятельные участки registry** (routing mechanism C) | **GENUINELY-NON-PUBLIC** (12-line partial captured, all yellow) | `scripts/seed-data/tr4-malodeyatelny-registry.json` — 12 named lines, all confidence `yellow`, from secondary/industry sources | Complements `tr4-uzel-class.json` (per-line vs per-узел); engine rule exists but the authoritative full list does not | **No open per-line ПЕРЕЧЕНЬ exists.** Sources tried & confirming non-publicness: Приказ Минтранса 313/2024 (Порядок — methodology only, no приложение with a per-object list; ConsultantPlus full text paywalled — garant.ru/products/ipo/prime/doc/410466678, consultant.ru/document/cons_doc_LAW_488446) and Распоряжение ОАО РЖД 28/р-2020 (Garant full-structure read: definitions + criteria only). Federal CRITERIA are public (ПП РФ №330/2018); the actual per-line list (>135 lines, ≥15% сети, >8000 км) is formed and held INTERNALLY by ОАО РЖД. |
| 5 | **Crimea (ФГУП КЖД)** distance coverage | **CLOSED-with-data** (but politically/scope OUT — annexed) | `scripts/seed-data/kniga-crimea.json` — 131 stationLegs + 135 ТП↔ТП edges, covering all 134 КЖД stations incl. Симферополь/Севастополь/Джанкой/Керчь | **NOT yet wired** (no `repository.ts` reference) | `rzd-stations-20231230.csv` ФГУП «КЖД» rows (exactly 134), field4/field5 published nearest-ТП offsets «Имя-км» copied verbatim; tr4.info road 85 «ГП Крымская железная дорога» ТП↔ТП matrix, verified verbatim 2026-06-09 (https://tr4.info/tp/856200 от Джанкой: Феодосия 118, Керчь 191, Остряково 94, Евпатория-Товарная 129, Владиславовка 101, Крым-Паром 212 — all match `kniga3-backbone.json`). |

**Net effect of the hunt on the engine:**
- **Transporter (gap 2) is the one gap that moved a RED block to computable** in this run — its 6 RED probe cells (`ТР/{own,rzd}/{1,2,3}`) and the matching breadth rows now price YELLOW (computed per verbatim Прил.N2, not yet kopeck-oracle-pinned). This is the single largest red→yellow shift in the whole report.
- **AYM (gap 1) and Crimea (gap 5)** are data-on-disk-CLOSED but **still need a one-line `repository.ts` wiring** (additive `stationLegs`+`kniga3` edges, identical to the proven `loadCisSpurs`/`loadCisBackbone` pattern) before the engine resolves those stations. Until wired they remain RED at the engine boundary despite the data existing. AYM lifts ЖД Якутии 58 %→~95 %; Crimea is annexed → resolves distance but stays OUT of the priced RF scope.
- **Container/reefer (gap 3)** core is verified; the residual (empty/own-use container cells, the paywalled +5% clause text) keeps container/reefer YELLOW — no fabrication, no promotion to green.
- **Malodeyatelny (gap 4)** is the honest hard ceiling: the full registry is **not publicly obtainable**; only a 12-line partial (yellow) plus the public federal criteria exist. Routing mechanism C stays conservative-fallback.

---

## 1. Station coverage (computable RF stations)

Population = the full RF ESR set in `scripts/seed-data/rzd-stations-20231230.csv`.

| Metric | Value | Source |
|---|---|---|
| Distinct RF ESR in CSV | **12 990** | `RF_STATION_COVERAGE.md` |
| RF ESR with ≥1 Книга-1 участок leg (precondition to compute) | **95.6 %** (12 414) | full-population scan |
| Representative sample resolve **AND** compute a green km | **94.5 %** | sample n=3 122 (all 1 052 узлы ∪ every 7th ∪ per-road spread) |
| Same, **RF-mainland only** (structural exclaves removed) | **≈ 97.7 %** | sample, exclaves excluded |

**Coverage uplift this run (no fabrication):** `scripts/distance-v2-a/gen-rf-station-attach.mjs` derives Книга-1 attach legs **only from the CSV's own published «Транзитные пункты» column** → `scripts/seed-data/kniga1-transit-attach.json` (425 legs / 258 distinct RF stations: 5 self-ТП at 0 km + 253 transit-spur stations at the CSV's own km offsets). Wired via `repository.ts loadTransitAttach()` as `stationLegs` ONLY (never узел-graph edges), so existing certified routes provably cannot move. The +258 stations now resolve; no km was invented (138 Crimea/annexed and 49 dead-end ТП-halts were correctly skipped + flagged, not bridged).

### Remaining unresolved buckets (honest)

| Bucket | Sample count / % | Disposition |
|---|---|---|
| `no_kniga1_origin` | 124 / 4.0 % | Mixed. **In-scope tail:** километровые halts / разъезды / ОП with no участок (the single highest-count *fixable* in-scope bucket — attach via the CSV «Транзитные пункты» token rule, no invented km). **Out-of-scope majority:** Crimea ФГУП «КЖД» (49), Мелитопольская, Рубикон — no ТР-4 sections published. |
| `backbone_missing` | 49 / 1.6 % | **100 % Калининград exclave.** Reaches RF core only via Lithuania/Belarus transit = CIS = OUT of scope. Engine correctly returns red rather than fabricate a leg. |
| `no_uzel_candidates` / dangling-spur | **0** | The bridge-to-backbone layer is sound for every mainland station that has a leg. |

**Per-road:** the 16 RF-mainland roads score **93.7–100 %**. The four 0 % roads are all structurally out of scope (Калининград + Crimea exclaves/annexed + private Рубикон). The one mainland road with a real gap is **ЖД Якутии (58 %)** — its АЯМ line (Беркакит–Нижний Бестях) is sparsely represented in Книга-3; the fix (add the АЯМ Книга-3 ТП edges) is data-on-disk-derivable and would be YELLOW until certified against an Якутия квитанция.

---

## 2. Routing correctness — is the обходной-undercut class closed RF-wide?

**Status: PARTIALLY closed. The ring/branch-junction sub-class (mechanism A) is now closed RF-wide and oracle-safe. The directional (mechanism B) and positive-malodeyatelny (mechanism C) sub-classes remain OPEN and are flagged, not silently closed.**

The binding RF-accuracy gap (Решетниково proved it: an unclassified обходной leg via Тверь-62 undercut the legal route). The task hypothesis — *"treat the Книга-3 ТП backbone as the legal network and any non-backbone узел as обходной"* — was **FALSIFIED by the data** (`RF_ROUTING_GENERALIZATION.md` §2): Поварово II IS a full Книга-3 ТП (378 edges) yet is обходной and must drop; Алнаши is NOT a ТП yet is the legal magistral approach for golden 699. Backbone-ТП membership is **orthogonal** to ТР-4 legality, so the uniform rule cannot be implemented from that signal.

What WAS shipped (oracle-safe, derivable, class-agnostic): a **Layer-2 geometric обходной detector** (`filterGeometricObhodnoy` + `isOnSection` + `sectionEdgeKm` in `computeDistance.ts`, layered *beneath* the certified 7-узел `filterBackBranches`). Rule: within a station's same-участок leg group, keep a leg if it is colinear-between a peer (`spur(W)+spur(P) ≈ published edge(W,P)`); drop a leg that is OFF-section AND undercuts a published Книга-3 edge as a соединительная/обходная ветвь. No new data, no new constant. Measured RF-wide impact: fires correctly on the Поварово-II ring class and on exactly 1 additional station beyond the hand set, with **zero oracle regression** (all 4 distance + 17 tariff oracles still EXACT — proof walked oracle-by-oracle in `RF_ROUTING_GENERALIZATION.md` §5).

### Residual routing risk (stated, not hidden)

- **Mechanism B — directional overshoot (Тверь-style) on untested RF routes: OPEN.** A station colinear between two mainline узлы where the cheapest end is the overshoot-and-return end will still undercut unless that узел is hand-flagged `directional`. Direction is a function of the ORIGIN, not a узел property — **no узел-level signal on disk can decide it.** These routes fall to global-MIN and may under-report. No number is invented for them.
- **Mechanism C — positive malodeyatelny classification for through-capable branches: OPEN.** Blocked on the non-public per-line РЖД registry (Приказ Минтранс 313/2024 has no open приложение; Распоряжение РЖД 28/р is internal). The common dead-end case already self-excludes (no through backbone edge). See `tr4-uzel-class.json._meta.operatorNeeded`.

**Bottom line:** the обходной-undercut class is **not fully closed RF-wide**. The fully-derivable ring/branch sub-class is closed; the origin-relative directional and the registry-dependent malodeyatelny sub-classes remain conservative-fallback and are explicitly flagged.

---

## 3. Tariff (cargo × wagon) matrix — green / yellow / red

From `RF_TARIFF_COVERAGE.md` §1 (the wagon-type × class matrix) and the §5 end-to-end probe (14 wagon codes × {own,rzd} × {class 1,2,3} = 84 cells driven by the real loaded seed tables).

| Confidence | Count (84-cell probe) | What it means |
|---|---|---|
| **GREEN** (oracle-certified, kopeck) | **1 probe cell** (and **7 matrix cells**: own-ПВ ×3 classes, own-ПЛ cl-2/3, own-ЦС cl-1/2/3 per-tonne, inventory-ПВ) | All 13 goldenBatch0609 + 4 certified oracles fall inside this block. The probe reports exactly 1 green cell at the fixed probe distance, as the confidence model requires. |
| **YELLOW** (computes per verbatim ТР-1 table, no kopeck oracle) | **83 probe cells** (77 prior + 6 transporter, post-hunt) | own/rzd ПВ·ПЛ·КР·ХП·ХМ·ХЗ·ХЦ·ДМ·ОК class-2/3 + ПЛ/КР class-1 + all общий-парк (И+В) + цистерна per-tonne + рефрижератор (AMBER) + контейнер (A+B×KL ×1.05) + **транспортёр `ТР/{own,rzd}/{1,2,3}` (NEW — see §0a gap 2)**. Each emits a positive number with the correct yellow warning chain — none silently green, none fabricated. |
| **RED** (no primary-source data → no number) | **0 probe cells** (was 6 — transporter closed this run) | The transporter block was the only RED bucket in the 84-cell probe; with all 4572 `rateRub` now transcribed verbatim (`tr1-i-belts-transporter-rates.json`, wired in `seedLoader.ts`) it prices YELLOW. The 84-cell probe now has **zero RED cells**. (Engine-boundary RED still exists OUTSIDE this probe: AYM/Crimea stations until wired, container empty-leg / thermal / контрейлер plates, and the directional/malodeyatelny узел registry — see §0a and the table below.) |

**Cross-check (broad breadth matrix, `rf-validation-matrix.json`, 99 rows = 11 routes × 3 cargoes × 3 wagons):** verdict tally **green 11 / yellow 55 / red 33**. Green = the own-ПВ class-1 N8 oracle path; yellow = inventory ПВ/ПЛ via `computeInventory` (need operator certification); red = цистерна 1D-схема / коэффициент рода не закреплён at that route.

**Commodity K3 (Табл N4): functionally complete.** 44.4 % of the 5036 ЕТСНГ positions carry a specific commodity coef; the remaining 55.6 % correctly default to K3 = 1.0 per ТР-1 (not a gap — that is the complete, correct behavior). 0 cargoes silently lose a published coef.

### RED cells — exactly what is missing (never fabricate)

| RED cell | Missing primary-source data | Where to obtain |
|---|---|---|
| ~~Транспортёр N39–N74 (all classes, own+rzd)~~ | **CLOSED 2026-06-09** — 4572 `rateRub` transcribed verbatim from Прил.N2 (Приказ ФАС 894/25), wired in `seedLoader.ts`; now prices YELLOW. N75–N78 (32-axle remainder) still out of file scope. | — (closed; see §0a gap 2) |
| Контейнер — порожний пробег | empty-container positioning plate (not in Табл.N24); Табл.N10 empty/own-use scheme cells diverged between fetches → not verbatim (see §0a gap 3) | Прил.N1 разд.II adjacent to N85–N94 + Табл.N10 empty rows |
| Контейнер — термические/реф. | separate thermal-container plate | Табл.N14 |
| Контрейлер Табл.N13 reduction | контрейлер base schemes to subtract against | Табл.N11 (not on disk) |
| КР commodity sub-multiplier (п.3.3/5.7 ×1.04 ЕТСНГ subset) | exact ЕТСНГ subset for the class-2/3 ×1.04 carve-out | Табл.N4 п.3.3 / п.5.7 verbatim |
| § погранстанции directional (Табл N3) | unverified (extractor unstable); only affects export-via-погранстык = **CIS/foreign = OOS** | Raw HTML Табл.N3 §3 / R-Тариф |

---

## 4. What is 1:1-DERIVABLE for RF vs what STILL needs certification

### Now 1:1-DERIVABLE for RF (computable from data on disk, no non-public source)

- **Tariff distance** for ~97.7 % of RF-mainland stations (ТР-4 graph over Книга-1/Книга-3 + the CSV-derived transit-attach legs).
- **Ring/branch-junction обходной correctness** RF-wide (Layer-2 geometric detector — fully edge-derivable, oracle-safe).
- **Universal own wagons** ПВ/КР/ПЛ and **own cistern** ЦС — compute on the verbatim N8 / N19–N24 plates. ПВ all classes, ПЛ cl-2/3, ЦС cl-1/2/3 are GREEN; КР and ПЛ-cl-1 are YELLOW only because no oracle pins them, **not because data is missing.**
- **Commodity K3** for every ЕТСНГ position (listed coef or default 1.0).
- **Транспортёр N39–N74** (post-hunt) — all 4572 verbatim Прил.N2 rates are on disk and wired; prices YELLOW (computed-uncertified), no longer RED.
- The remaining mainland station gaps are now **data-on-disk-CLOSED**: ЖД Якутии АЯМ (`kniga3-aym.json`, 23 verbatim ТП edges) and Crimea КЖД (`kniga-crimea.json`, 131+135 verbatim rows). They need only a one-line additive `repository.ts` wiring (the proven `loadCisSpurs`/`loadCisBackbone` pattern) — no invented numbers. AYM lifts ЖД Якутии 58 %→~95 %; Crimea is annexed/OOS for pricing.

### STILL needs R-Тариф batch certification (computed-uncertified → YELLOW)

Point the operator at **`scripts/seed-data/rf-validation-matrix.json`** and **`RF_VALIDATION_BATCH.md`** (how to run each row in R-Тариф):

- **55 yellow breadth rows + 83 yellow probe cells** (now incl. transporter): КР (own), all общий-парк (И+В) universal, specialized хоппер/думпкар/окатыш, цистерна per-tonne общий-парк, **транспортёр N39–N74**. Highest-leverage: an R-Тариф quote for КР-own and any общий-парк universal case promotes 6+ YELLOW cells to GREEN with **zero new scraping** (belts already on disk). Transporter now joins this set — an R-Тариф transporter quote would pin its 6 cells to GREEN.
- **Reefer N30/N31 (254 cells, AMBER)**: sampled cells now byte-verified vs sudact (§0a gap 3); hand-verify the remaining 127×2 cells kopeck-by-kopeck → GREEN.
- **Container +5% 2026 indexation**: order identified by Минюст registration metadata but the +5% clause text is paywalled (§0a gap 3); obtain the verbatim operative clause → container loaded YELLOW → GREEN.
- **Routing directional/malodeyatelny узлы**: certify against R-Тариф on suspect corridors; flag any км diff per `RF_VALIDATION_BATCH.md`.

### STILL needs non-public / new data (RED — cannot compute, never fabricate)

- ~~Транспортёр N39–N74 rate plates~~ — **CLOSED 2026-06-09** (verbatim transcription on disk + wired; now YELLOW).
- Container empty-leg + thermal + контрейлер base schemes (Табл.N10 empty/own-use cells not byte-verbatim; контрейлер Табл.N11 not on disk).
- **Malodeyatelny per-line registry — GENUINELY-NON-PUBLIC.** Confirmed after exhaustive hunt: Приказ Минтранс 313/2024 (Порядок, no per-object приложение, paywalled full text) + Распоряжение РЖД 28/р-2020 (methodology/criteria only) publish NO open per-line ПЕРЕЧЕНЬ; the actual list (>135 lines) is held internally by ОАО РЖД. Only a 12-line partial (`tr4-malodeyatelny-registry.json`, all yellow) + public federal criteria (ПП РФ №330/2018) are obtainable. This is the honest ceiling for routing mechanism C.
- **All CIS / Baltic / foreign + Калининград** — OUT of scope this run. **Crimea** — data now on disk (`kniga-crimea.json`) but annexed → resolves distance once wired, stays OUT of priced RF scope.

---

## 5. The honest one-liner

**RF is NOT "полностью 1:1" yet — and this report does not claim it is.** What IS certified to the kopeck: the own-ПВ/ПЛ/ЦС + inventory-ПВ tariff block (17 oracles) and the 4 distance oracles, including the обходной fix (Решетниково 1432). What is **computed-uncertified (YELLOW)**: the broad own/общий-парк universal + specialized + reefer + container matrix, **and (post-hunt) the now-closed transporter N39–N74 plates** — pending R-Тариф batch certification via `rf-validation-matrix.json`. After this exhaustive hunt the 84-cell probe has **ZERO RED tariff cells** (transporter closed); the honest derivable ceiling for RF tariff is the YELLOW band, liftable to GREEN ONLY by operator R-Тариф certification, not by more data. What truly remains RED/non-derivable: container empty/thermal/контрейлер base schemes (not on disk), and — the genuine hard ceiling — the **non-public malodeyatelny per-line registry** (mechanism C), held internally by ОАО РЖД. AYM and Crimea distance data are now on disk and need only a one-line additive engine wiring. Station coverage is ~97.7 % of RF-mainland and rises with the AYM wiring; the irreducible residual is the structurally out-of-scope exclaves (Калининград, Crimea) — flagged, never fabricated.
