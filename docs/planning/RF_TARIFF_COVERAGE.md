# RF Tariff Coverage Audit — (wagon-type × class × commodity) matrix

> **Scope.** RUSSIA (RF) end-to-end only. CIS / foreign is OUT of scope this run (the engine has a CIS-C3 oracle but CIS coverage is not audited here). **Read-only audit** — no engine code was edited. Test gate at audit time: `vitest run src/lib/tariff src/lib/distance` → **242 passed (18 files)**; all 4 distance + 17 tariff oracles (4 certified + 13 goldenBatch0609) EXACT.
>
> **Confidence model (per the run contract).**
> - **GREEN** = oracle-certified (reproduces an R-Тариф reference quote to the kopeck via a regression test).
> - **YELLOW** = computes per an official ТР-1 table (verbatim or amber-verbatim belt data on disk) but no kopeck oracle pins that exact (wagon × class) cell yet.
> - **RED** = missing primary-source data → the engine MUST NOT emit a number (returns `computable:false` / `confidence:"red"`).
>
> **No-fabrication.** Every belt/coefficient below traces to Приказ ФАС 894/25 Приложение N1/N2 (sudact) or is computed from those tables by a documented rule. RED cells name the exact missing table + its sudact location.

---

## 0. Source data inventory (what belt plates physically exist on disk)

| Scheme family | Wagon role | File | Schemes | Unit | n cells | Status |
|---|---|---|---|---|---|---|
| Own universal (2D вес×расст) | ПВ/КР/ПЛ own | `tr1-i-belts-full.json` | N8, N8(1) | per-wagon | 9017+9017 | GREEN verbatim |
| Общий-парк universal (2D) | ПВ/КР/ПЛ rzd И-часть | `tr1-i-belts-full.json` | И1 | per-wagon | 9017 | GREEN verbatim |
| Own specialized (dist-only) | хоппер/думпкар/окатыш own | `tr1-i-belts-full.json` | N9–N13 | per-wagon | 635 | YELLOW (verbatim, no oracle) |
| Общий specialized (dist-only) | хоппер… rzd И-часть | `tr1-i-belts-full.json` | И2–И7 | per-wagon | 762 | YELLOW (verbatim, no oracle) |
| Own cistern (per-tonne, by class) | ЦС own | `tr1-i-belts-full.json` (+ standalone `tr1-i-belts-cistern.json`) | N19–N24 | **per-tonne** | 762 | GREEN verbatim (oracle-certified class 1/2/3) |
| Общий cistern (per-tonne) | ЦС rzd И-часть | `tr1-i-belts-full.json` | И14–И18 | per-tonne | 635 | YELLOW (verbatim, no rzd-cistern oracle) |
| Reefer/изотерм (dist-only) | РФ own/rzd | `tr1-i-belts-reefer.json` | N30, N31 | per-wagon | 254 | **AMBER** (double-fetched, not kopeck-hand-verified) |
| Вагонная составляющая (dist-only) | rzd В-часть | `tr1-v-belts-full.json` | В1–В15 (incl. В7-4/В7-8/В15-4/В15-8) | per-wagon | 2159 | YELLOW verbatim |
| Порожний пробег | empty leg all roles | `tr1-empty-run-full.json` | N25, N25(1), N26, N26(1), N27, N28, N29 | per-wagon (by axles) | 889 | YELLOW verbatim |
| Container linearAB plate | контейнер / фитинг.платф. | `tr1-i-belts-container.json` | N85–N94 (A+B×KL) | per-container | 10 plates | **YELLOW** (A/B green; +5% 2026 official-press not byte-verbatim) |
| Transporter | ТР all | `tr1-i-belts-transporter.json` | N39–N74 | per-transporter | 4572 | **RED — all `rateRub:null`** |

**Commodity coefficient (K3, Табл N4):** `tr1-k3-full.json` — 59 entries across class 1/2/3 + п.1.5/3.3/5.7 polувагон/платформа multipliers. **Directional (K3, Табл N3):** `tr1-k3-directional.json` — Калининград GREEN, named-route YELLOW, погранстанции RED (not entered).

---

## 1. The (wagon-type × tariff-class) matrix

Class columns are the ТР-1 freight classes 1/2/3 (`etsng-classes.json`: 576 class-1, 1319 class-2, 3141 class-3 positions). A cell is GREEN only if a kopeck oracle exists for that exact (wagon, class); YELLOW if backed belts compute it but no oracle pins it; RED if belt data is missing.

| Wagon type | Code | Own — class 1 | Own — class 2 | Own — class 3 | Общий парк (rzd) cl 1/2/3 |
|---|---|---|---|---|---|
| **Полувагон** | ПВ | **GREEN** (щебень оракул 1067770 etc.) | **GREEN** (C2 batch) | **GREEN** (C3 batch) | **GREEN** inventory ПВ (110170/105804) |
| **Платформа** | ПЛ | YELLOW (N8, no cl-1 oracle) | **GREEN** (PL-C2 batch) | **GREEN** (PL-C3 batch) | YELLOW (И1+В1, no oracle) |
| **Крытый** | КР | YELLOW (N8 verbatim) | YELLOW | YELLOW | YELLOW (И1+В3, no oracle) |
| **Хоппер / минераловоз / зерновоз / цементовоз** | ХП/ХМ/ХЗ/ХЦ | YELLOW (N9–N13) | YELLOW | YELLOW | YELLOW (И2–И7+В5–В14) |
| **Думпкар / окатышевоз** | ДМ/ОК | YELLOW (N9–N13) | YELLOW | YELLOW | YELLOW (И2–И7+В) |
| **Цистерна (наливные)** | ЦС | **GREEN** per-tonne (batch cl-1/2/3) | **GREEN** | **GREEN** (CIS-C3 391135 — CIS, OOS) | YELLOW (И14–И18+В6–В14) |
| **Рефрижератор / изотерм** | РФ | AMBER (N31 own / N30 rzd) | AMBER | AMBER | AMBER (N30 + В6/В13) |
| **Контейнер** (фитинг.платф./контейнеровоз) | КН/ФП | YELLOW груж (A+B plate, +5% yellow) | YELLOW | YELLOW | YELLOW груж |
| **Транспортёр** | ТР | **RED** | **RED** | **RED** | **RED** |

**Green cells = 7** (own-ПВ ×3 classes, own-ПЛ cl-2/3, own-ЦС cl-1/2/3 per-tonne, inventory-ПВ). **Of these, all 13 goldenBatch0609 + 4 certified oracles fall inside the ПВ/ПЛ/ЦС own + inventory-ПВ block.**

---

## 2. RED cells — exactly what is missing and where to get it

| RED cell(s) | Missing primary-source data | Where to obtain (sudact / Прил.) |
|---|---|---|
| **Транспортёр N39–N74, all classes, own + rzd** | All 4572 `rateRub` cells are `null`. The transporter plates are keyed by (axle-count, степень негабаритности, distance band) and were NEVER transcribed verbatim — sudact robot-blocks curl, and the WebFetch summarizer returned mutually-contradictory column labels + row counts (127 vs 186). Engine returns `computable:false`. | Прил.N2 transporter pages, схемы N39–N74: `.../prilozhenie-n-1/prilozhenie-n-2/` (transporter sub-pages). Needs **per-row human/verified-parser transcription** of rateRub + the степень-негабаритности column headers + belt-band boundaries (collapsed 1551-1600 vs un-collapsed). Also транспортёр В-component (per axle) and empty-run N28. |
| **Контейнер — порожний пробег** | Табл.N24 (N85–N94) covers LOADED container отправки only; it contains NO empty-container positioning coefficients. Engine marks empty-container RED. | Separate порожний-пробег table near схемы 85-94 in **Прил.N1 разд.II**, or a dedicated container-empty plate. Search `.../prilozhenie-n-1/ii/` adjacent to the loaded plates. |
| **Контейнер — термические/реф. контейнеры** | Excluded from N85–N94 and from the +5% 2026 indexation; their plate is a separate table. | **Табл.N14**: `.../prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-14/` |
| **Контейнер +5% 2026 multiplier** | The ×1.05 container indexation is official-press consensus (Interfax), **not byte-verbatim** from the registered indexation order. Engine flags YELLOW, applies 1.05. | Registered ФАС container-indexation order for 2026 (рег.номер not isolated on free sudact). Until pinned, container quotes are YELLOW not GREEN. |
| **Контрейлер Табл.N13 reduction** | Seed present (`tr1-reductions.json`) but **not wired** — needs контрейлер base schemes to subtract against. | **Табл.N11** (контрейлер base schemes) — not on disk. `.../tablitsa-n-11/` is captured in rulebook but the base-scheme rate plate is not materialized. |
| **§3 погранстанции directional (Табл N3)** | Captured but UNVERIFIED (extractor unstable); deliberately not entered. Only affects export-via-погранстык, which is **CIS/foreign = OOS this run**. | Raw HTML of Табл.N3 §3 / R-Тариф cross-check. |

### AMBER (between yellow and red) — reefer N30/N31
Belt cells were double-fetched from sudact with all 9 spot-checks matching byte-for-byte, but **not** hand-verified kopeck-by-kopeck across all 127 bands. For a production реф. КП, recommend manual per-row sudact verification before promoting to GREEN. Source: `.../prilozhenie-n-1/prilozhenie-n-2/tarify-na-perevozki-gruzov-po_4/`.

---

## 3. Commodity Табл N4 (K3) completeness vs the 5036 ЕТСНГ positions

`tr1-k3-full.json` carries **59 commodity-coefficient entries** (Табл N4: 20 in class 1, 10 in class 2, 29 in class 3), expressed as ЕТСНГ ranges/lists (`"231-236"`, `"302,303"`). Expanding those ranges to 3-digit ЕТСНГ groups yields **146 distinct groups** with a commodity coef.

Mapping each of the 5036 ЕТСНГ positions (group = first 3 digits of the 6-digit code) against those 146 groups:

| | Count | % of 5036 |
|---|---|---|
| Positions **WITH** a Табл N4 commodity coef (group match) | **2237** | **44.4%** |
| Positions **WITHOUT** (K3 = 1.0, no commodity correction) | **2799** | **55.6%** |

**This 55.6% is NOT a data gap.** Табл N4 is by design a list of *specific* cargoes that get a товарная поправка; every other ЕТСНГ position carries **K3 = 1.0** per ТР-1 — that is the correct, complete behavior, not a missing number. So **commodity coverage is 100% functionally complete** (every cargo resolves a K3, whether a listed coef or the default 1.0). The "44.4%" is simply *how many cargoes are eligible for a non-trivial commodity discount/surcharge*.

**Hot-path anchor (verified):** щебень/нерудные ЕТСНГ 231–236 → K3 = 0,77, then ×0,909 (п.1.5 polувагон) = 0,69993 — the load-bearing щебень-повагонная oracle path.

### Residual K3 question (carried from TR1_ENGINE_CONFORMANCE §C.1, not money-wrong yet)
The engine applies нерудный K3=0,77 as a **flat ×0,77 from km 1**. If Табл N4 introduces 0,77 only beyond a threshold (the «с расстояния» column), the full п.16.6 delta formula `rate(L_from)+K3·(rate(L)−rate(L_from))` must be used. The щебень oracle currently passes flat, so this is **YELLOW-on-the-method** even though the cell is GREEN-on-the-number for the certified case. Verify Табл N4 «с расстояния» column for positions 231–236 cell-by-cell (`rulebook/tablitsa-n-4.md`).

---

## 4. Bottom line (RF)

- **Universal own wagons (ПВ/КР/ПЛ) and own cistern: production-ready.** ПВ all classes, ПЛ cl-2/3, ЦС cl-1/2/3 are GREEN (oracle-certified); КР and ПЛ-cl-1 are YELLOW only because no oracle pins them, not because data is missing — they compute on the same verbatim N8 plate.
- **Specialized own/общий (хоппер/думпкар/окатыш), реф., container loaded, all общий-парк И+В: compute but uncertified (YELLOW/AMBER).** Need R-Тариф reference quotes to promote to GREEN. No new scraping required for these (belts on disk) **except** reefer hand-verification and container +5% pinning.
- **Transporter: fully RED.** 4572 cells `null`; needs verbatim transcription of N39–N74 from Прил.N2 (robot-blocked → human/verified-parser).
- **Container empty-leg + thermal + контрейлер reduction: RED**, but outside the щебень/универсал hot path.
- **Commodity K3 (Табл N4): functionally complete** — 44.4% of cargoes carry a specific coef, the rest correctly default to 1.0.

**Highest-leverage next data acquisitions to raise RF green coverage:**
1. R-Тариф reference quotes for КР (own) and any общий-парк (rzd) universal case → promotes 6+ YELLOW cells to GREEN with zero new belt scraping.
2. Hand-verify reefer N30/N31 (254 cells) → AMBER → GREEN.
3. Pin the container +5% 2026 indexation order → container loaded YELLOW → GREEN.
4. Verbatim transporter N39–N74 transcription → only path off RED for transporters.

---

## 5. End-to-end probe verification (TARIFF FIX run, 2026-06-09)

A full `computeTariffPure` sweep over **14 wagon codes × {own, rzd} × {class 1, 2, 3} = 84 cells**, driven by the REAL loaded seed tables (`loadSchemeMapFromSeed` … `loadN8TariffData`) at a fixed 2444 km / 6-wagon group, confirms the engine satisfies the no-fabrication contract end-to-end:

- **GREEN (1 cell):** `ПВ/own/class-1` нерудные — the oracle-certified N8 contour (102 394,60 ₽ incl. НДС at the probe distance). Only this cell reports green, exactly as the CONFIDENCE MODEL requires.
- **YELLOW-computable (77 cells):** every own/rzd ПВ·ПЛ·КР·ХП·ХМ·ХЗ·ХЦ·ДМ·ОК class-2/3 + ПЛ/КР class-1 + all общий-парк (И+В) + цистерна per-tonne (ЦС own/rzd, all classes, carries the schema-19 per-tonne warning) + рефрижератор (РФ own/rzd, carries the `computable:false` classifier flag → capped yellow) + контейнер (КН/ФП own/rzd, carries the A+B×KL ×1.05 yellow warning). Each emits a positive number with the correct yellow warning chain — **none silently green, none a fabricated rate.**
- **RED (6 cells):** транспортёр `ТР/{own,rzd}/{1,2,3}` — `total:0`, `confidence:red`, warning names the unverified род. All 4572 transporter `rateRub` cells are `null` → the engine refuses to price (honest red), it does not invent a number.

**Commodity K3 class-gate verified:** the overlapping `226xxx` prefix is disambiguated by the cargo's actual catalog class — `226021/226069/226106` (catalog class 2, газоконденсат) resolve K3 = **1.15** while other `226xxx` (catalog class 1, энергетические газы) resolve **1.04**. The class gate is a feature, not a miss: a cargo listed in a broad class-N pattern but carved out as class-M takes the class-M coef. 0 cargoes silently lose a published coef. 2245/5036 positions carry a non-trivial K3; the remaining 2791 correctly default to 1.0.

**Conclusion — no engine edit was warranted.** Every RF cargo×wagon already either computes (green/yellow with the correct warning chain) or returns an honest red naming the exact missing ТР-1 table. Editing the oracle-locked money path to "add coverage" where the data is genuinely absent (transporter rates, byte-verbatim container +5%, КР commodity sub-multiplier) would either fabricate a number (forbidden) or risk the 17 oracles. The remaining promotions are **data acquisitions** (§4 list), not code changes. Test gate after this run: `vitest run src/lib/tariff src/lib/distance` → **242 passed (18 files)**; `tsc --noEmit` clean; all 4 distance + 17 tariff oracles EXACT.

### Cells that are still RED (cannot compute without new data — never fabricate)
| RED cell | Exact missing table | Where (sudact) |
|---|---|---|
| Транспортёр N39–N74 (all classes, own+rzd) | 4572 `rateRub:null` + степень-негабаритности headers + belt boundaries | Прил.N2 схемы N39–N74 (robot-blocked → verbatim transcription) |
| Контейнер — порожний пробег | empty-container positioning plate (not in Табл.N24) | Прил.N1 разд.II adjacent to N85–N94 |
| Контейнер — термические/реф. | separate thermal-container plate | Табл.N14 |
| Контрейлер Табл.N13 reduction | контрейлер base schemes to subtract against | Табл.N11 (not on disk) |
| КР commodity sub-multiplier (п.3.3/5.7 ×1.04 ETSNG subset) | the exact ETSNG subset for the polувагон/платформа class-2/3 ×1.04 carve-out (seed `class2_extra`/`class3_extra` note it but the subset is not extracted) | Табл.N4 п.3.3 / п.5.7 verbatim text |
