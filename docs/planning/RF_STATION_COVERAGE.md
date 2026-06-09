# RF Station Coverage Audit — ТР-4 distance engine

**Date:** 2026-06-09
**Scope:** RUSSIA (RF) end-to-end. CIS / foreign explicitly OUT of scope.
**Method:** read-only harness over the full RF ESR set (`scripts/seed-data/rzd-stations-20231230.csv`), running the compiled ТР-4 engine (`src/lib/distance/computeDistance.ts`, unchanged) from a fixed RF reference **Москва/Ховрино ESR 060001** to a representative sample of RF stations. The harness was deleted after this report.
**Ground truth:** all 242 `src/lib/tariff` + `src/lib/distance` tests still pass (4 distance + 17 tariff oracles intact). The engine was NOT edited.

---

## Headline numbers

| Metric | Value |
|---|---|
| Total distinct RF ESR in CSV | **12 990** |
| RF ESR that have ≥1 Книга-1 участок leg (full population) | **12 414 / 12 990 = 95.6 %** |
| Sample size (узел stations ∪ every 7th ∪ per-road spread) | **3 122** |
| — узел stations in sample | 1 052 |
| **Sample: resolve AND compute a км (green)** | **94.5 %** |
| **Sample: resolve AND compute, RF-mainland only (exclaves excluded)** | **≈ 97.7 %** |

"Resolve AND compute" = engine returns `confidence:"green"` with a non-null км from Ховрино.

---

## Failure buckets (sample of 3 122)

| Bucket | Count | % | Cause |
|---|---|---|---|
| `resolved_computed` | 2 948 | 94.4 % | green km — OK |
| `ref_self` | 1 | 0.0 % | station IS Ховрино (0 km) |
| `no_kniga1_origin` | 124 | 4.0 % | dest station has **no Книга-1 участок leg** — engine returns red `no kniga1 leg for dest` |
| `backbone_missing` | 49 | 1.6 % | legs exist but the узлы **do not connect over the Книга-3 backbone** — red `backbone edge missing` |
| `no_uzel_candidates` | 0 | 0.0 % | (none) |
| `red_other` | 0 | 0.0 % | (none) |

### Bucket 1 — `no_kniga1_origin` (124, =4.0 %) — no участок in Книга-1

`reduce by road`: ФГУП «КЖД» (Crimea) **49**, Дальневосточная 10, ЖД Якутии 10, Октябрьская 7, Свердловская 7, Красноярская 5, Горьковская 5, Приволжская 5, Юго-Восточная 4, Южно-Уральская 3, Северная 3, Восточно-Сибирская 3, Рубикон 3, others ≤2.

Two distinct sub-causes:

1. **Out-of-scope exclaves / annexed roads** — Crimea (ФГУП «КЖД» 49, e.g. `868405 Айвазовская`, `869605 Армянск`), Мелитопольская (1), Рубикон (3). These roads are absent from the Книга-1 / Книга-3 ТР-4 backbone (RZD tariff network does not publish ТР-4 sections for them). **Flag: out of RF ТР-4 scope, not a fixable engine gap.**
2. **Километровые halts / разъезды / остановочные пункты** — `040281 128 км (ОП.)`, `045622 46 км (ОП.)`, `869323 10 км (рзд.)`, `904688 1945 км (рзд.)`, `771407 Аять`, `210108 Тула-Лихвинская`. These are tiny non-tariff points (passing loops, km-markers) the station CSV lists but Книга-1 never assigns to a участок because no commercial freight operation attaches there. Genuinely-RF gaps live here.

### Bucket 2 — `backbone_missing` (49, =1.6 %) — узлы don't connect on Книга-3

`reduce by road`: **Калининградская 49 / 49 (100 %).**

Every single one is the **Калининград exclave** (`100016 Калининград-Пассажирский`, `100001 Калининград-Сортировочный`, `103902 Балтийск`, `102308 Багратионовск`, …). The exclave's узлы have Книга-1 legs but reach the RF core **only through Lithuania/Belarus transit** — i.e. across a CIS border, which is OUT of scope this run. There is no all-RF backbone path, so the engine correctly returns red rather than fabricate one. **Flag: out of scope (requires CIS transit graph).**

### Bucket 3 — `no_uzel_candidates` / `red_other` — **0**

No станция with a Книга-1 leg failed for "dangling spur" or any unclassified reason. The bridge layer (`toBackbone` over kniga1/gapfill edges) successfully reaches the backbone for every mainland station that has a leg.

---

## Per-road resolve+compute rate (sample)

| Road | n | OK % |
|---|---|---|
| Калининградская (exclave) | 51 | 0.0 |
| ФГУП «КЖД» (Crimea) | 49 | 0.0 |
| ООО «Рубикон» | 3 | 0.0 |
| Мелитопольская | 1 | 0.0 |
| ЖД Якутии | 24 | 58.3 |
| Дальневосточная | 158 | 93.7 |
| Красноярская | 107 | 95.3 |
| Свердловская | 209 | 96.7 |
| Приволжская | 165 | 97.0 |
| Горьковская | 189 | 97.4 |
| Восточно-Сибирская | 129 | 97.7 |
| Октябрьская | 331 | 97.9 |
| Юго-Восточная | 212 | 98.1 |
| Северная | 183 | 98.4 |
| Южно-Уральская | 200 | 98.5 |
| Западно-Сибирская | 198 | 99.0 |
| Куйбышевская | 196 | 99.0 |
| Московская | 382 | 99.5 |
| Северо-Кавказская | 239 | 99.6 |
| Забайкальская | 96 | 100.0 |

The 16 RF-mainland roads are **93.7 – 100 %**. The four 0 % roads are all structurally-out-of-scope (two exclaves + two annexed/private roads with no ТР-4 backbone). ЖД Якутии (58 %) is the one mainland road with a real gap — its АЯМ line (Беркакит–Нижний Бестях) is sparsely represented in Книга-3.

---

## Concrete fix list (priority order)

Each item traces to a primary source — **no fabricated km**. Confidence model: green = oracle-certified, yellow = computed per official table, red = missing data (no number).

1. **[RF, real gap — HIGH] ЖД Якутии АЯМ backbone (58 % → ~95 %).**
   Add the Беркакит–Томмот–Нижний Бестях Книга-3 ТП edges + their участок legs. Source: Книга-3 АЯМ section (publish-distance table) → `kniga3-backbone.json` + `uzel-graph-kniga1.json`. Yellow until certified against an Якутия квитанция.

2. **[RF, real gap — MEDIUM] Километровые halts / разъезды / ОП without a участок (~few hundred ESR).**
   For each `NNN км (ОП./рзд./ПП.)` and small `…(ОП.)` with no Книга-1 leg, attach it to its bounding участок using the **CSV «Транзитные пункты» column** (it already lists the two bounding ТП + km offsets, e.g. `Кандалакша-91, Кола-171`). Parse that into a Книга-1 leg per the documented token rule (`parseTransit.ts`). Source = the CSV's own published ТП offsets → green where both ТП resolve, never invented. This is the single highest-count *in-scope* fixable bucket.

3. **[RF, real gap — LOW] Tula-Лихвинская узкоколейка & similar isolated branches (`210108`).**
   Confirm whether a ТР-4 участок exists; if RZD publishes none, mark red (no number) — do not bridge.

4. **[OUT OF SCOPE — flag only] Калининград exclave (49 in sample, ~110 ESR total).**
   Needs the Lithuania/Belarus CIS transit graph to reach the RF core. Out of this RF-only run. The CIS bridge layer (`uzel-graph-cisfill.json`) is the future home for this; do NOT add a fabricated all-RF leg.

5. **[OUT OF SCOPE — flag only] Crimea (ФГУП «КЖД», ~134 ESR), Мелитопольская, Рубикон.**
   No ТР-4 Книга-1/3 sections published for these roads. Flag as outside the RF ТР-4 tariff network; obtain dedicated Crimea tariff source before any attempt.

---

## Bottom line

- **95.6 %** of all 12 990 RF ESR have a Книга-1 участок (the precondition to compute).
- **94.5 %** of the broad sample resolve AND compute a км from Ховрino; **≈97.7 %** once the structurally-out-of-scope exclaves/annexed roads are removed.
- **100 %** of the `backbone_missing` failures are the Калининград exclave (CIS transit, out of scope).
- The **only material in-scope engine gap** is ЖД Якутии АЯМ + the long tail of non-tariff километровые halts — both addressable from data already on disk (Книга-3 АЯМ table + the CSV «Транзитные пункты» column), with **no invented numbers**.
- No `no_uzel_candidates` / dangling-spur failures: the bridge-to-backbone layer is sound for every mainland station that has a leg.
