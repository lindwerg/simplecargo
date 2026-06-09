# Таблица N 17 — Тарифные схемы пробега порожних вагонов

> **Slug:** `tablitsa-n-17`
> **Document:** Приказ ФАС России от 06.11.2025 № 894/25 («Тарифное руководство № 1»), Приложение N 1, раздел «Таблицы», Таблица N 17.
> **Primary source (verbatim, no paywall):** https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-17/
> **Fetched:** 2026-06-09 (via WebFetch against sudact.ru).
> **In force:** with 2026-01-01 (superseded Прейскурант 10-01).

---

## 1. What this table actually IS (read this first — naming trap)

There are TWO distinct artefacts the engine needs for the порожний (empty-run) leg, and they live on different pages:

1. **Таблица N 17 (THIS page)** = a **classifier / lookup**: it maps a *type of own (собственного/арендованного) wagon* to the **number of the tariff scheme** (`N25`, `N26`, `N27`, `N28`, `N29`, `N25(1)`, `N26(1)`) that applies to its empty run. **It contains NO rubles.** It is the routing key.
2. **The numeric belt rates** for those scheme numbers live in **Приложение N 2** (`.../prilozhenie-n-1/prilozhenie-n-2/tarify-na-perevozki-po-infrastrukture/`), already captured on disk as `scripts/seed-data/tr1-empty-run-full.json` (889 rows, 127 distance belts × 7 schemes, per-wagon ₽).

So Таблица N 17 answers *"which scheme number?"*; Приложение N 2 answers *"how many rubles for that scheme at this distance?"*.

---

## 2. Verbatim table text (quoted)

**Заголовок (verbatim):**

> «Тарифные схемы, применяемые при расчете тарифа на пробег по инфраструктуре РЖД с локомотивом РЖД собственных (арендованных) порожних вагонов и другого подвижного состава на своих осях»

**Столбцы (verbatim):**

> | № | Тип собственного (арендованного) вагона и другого подвижного состава на своих осях | Номера тарифных схем |

**Строки (verbatim, all rows as fetched):**

| № | Тип собственного (арендованного) вагона и другого подвижного состава на своих осях | Номера тарифных схем |
|---|---|---|
| 1 | Универсальные крытые, крытый вагон для цемента, зерна (типа хоппер), вагон-самосвал (думпкар), крытый вагон для скота, минеральных удобрений и сырья для минеральных удобрений, полувагон для агломерата и окатышей, вагон бункерного типа для муки (муковоз), хоппер-дозаторы и другие типы специализированных вагонов и цистерн | 25 |
| 2 | Цистерны для сжиженных газов и других грузов с массой тары более 7,5 т/ось, вагоны бункерного типа для нефтебитума (битумовоз), платформы с длиной 19,6 м и более для крупнотоннажных контейнеров, колесной техники | 26 |
| — | Вагоны ГРПС, АРВ, АРВ-Э и ИВ-термоса, переоборудованные из рефрижераторных вагонов, вагоны-термоса и иные типы специализированных изотермических вагонов | — |
| 3 | Полувагон для технологической щепы, 2-ярусная платформа для автомобилей, 1-ярусный крытый вагон для микроавтобусов, платформы 19,6 м и более для лесоматериалов, крытый вагон для автомобилей | 27 |
| 4 | Локомотивы, тендеры локомотивов, краны и путевые машины, другое передвижное оборудование, вагоны длиной более 25 метров | 28 |
| 5 | Вагоны пассажирские, вагоны электро- и дизель-поездов | 29 |
| 6 | Универсальные платформы, полувагоны, специализированные платформы менее 19,6 м, любые специализированные вагоны менее 19,6 м после контейнерных перевозок | 25(1) |
| 7 | Платформы 19,6 м и более для крупнотоннажных контейнеров и иные платформы после контейнерных перевозок | 26(1) |

> ⚠️ **Row marked `—` (изотермические/ГРПС/АРВ/термос):** WebFetch returned this row with an empty `№` and an empty scheme cell. Both readings are plausible: (a) the scheme number genuinely renders elsewhere / in a footnote on the source page (изотермические empty run is normally folded into row 2 → scheme 26 per the existing seed `tr1-empty-run.json` schemeMeta «...изотермические» under N26), or (b) the markdown→table conversion dropped a merged/spanned cell. **FLAGGED UNFETCHABLE — do NOT assume the dash means "no scheme".** Source location to resolve manually: the same sudact page, the изотермические row; cross-check against Раздел II п.22 (изотермические вагоны) and `tr1-empty-run.json` schemeMeta `"26"` which lists изотермические under scheme 26.

---

## 3. How it enters the tariff calculation (plain Russian)

The порожний-пробег component exists **only for собственные/арендованные вагоны** (own/leased), per п.16.5.1 Раздела II. For вагоны общего парка (RZD) the empty return is already folded into the loaded tariff and this table is NOT used.

Place in the formula (п.16.5.1, "груж.рейс + порож.пробег + использование вагонов"):

1. **Loaded leg** — compute the infrastructure+traction tariff for the laden haul over the real distance (scheme `N8` / `И*` etc., separate tables).
2. **Empty leg (THIS table feeds step 2):**
   - **Step 2a — classify (Таблица N 17):** take the wagon type → read its **scheme number** from this table. Standard universal полувагон/крытый → **scheme 25**. Container-service platforms after offload → `25(1)` / `26(1)`. Cisterns/heavy-tare/long platforms → `26`. Chip/auto/timber/long → `27`. Locos/cranes/oversized → `28`. Passenger/EMU/DMU → `29`.
   - **Step 2b — look up rubles (Приложение N 2):** with that scheme number + the empty-run distance, read the **per-wagon ₽ belt value** from the scheme's distance-belt table (on disk: `tr1-empty-run-full.json`).
   - **Step 2c — empty distance basis:** the empty run is charged over the distance per п.16.5.1 (index note records **60% расст.** rule for собственные вагоны — that 60% factor is a п.16.5.1 rule, NOT part of Таблица N 17; verify the exact phrasing against `prilozhenie-n-1/ii/` capture in `TARIFF_RULES_EXACT.md`).
   - **Step 2d — порожний надбавка ×1,1:** apply the empty-run surcharge (Приказ ФАС 999/24, в `tr1-coefficients.json`) on top of the belt value.
   - **Unit:** the belt value is **за один вагон (per wagon), без НДС, already 2026-indexed** — NOT per axle. See §4.

3. **Wagon-use component (группа В)** — only for общий парк; null for own wagons.

**Multiplier/role summary:** Таблица N 17 itself contributes **no multiplier and no ruble** — it is purely the *scheme selector* (a categorical lookup). The ruble comes from the Приложение N 2 belt; the multipliers stacked on the empty leg are the ×1,1 порожний надбавка and (for own полувагон) the per-class owner coefficient (×0,9346 / ×0,9592 / ×0,9774 per п.18.1.1, recorded in `tr1-scheme-classifier.json`).

---

## 4. Cross-reference vs current engine / seed — EXTENDS / CONFIRMS / CONTRADICTS

**CONFIRMS (this page matches on-disk material exactly):**
- `scripts/seed-data/tr1-empty-run.json` and its `.meta.json` already cite THIS URL as the source of the type→scheme mapping, and `schemeMeta` reproduces all 7 schemes with matching descriptions (25 = универсальные крытые/полувагоны/спец.; 26 = цистерны сжиж.газов >7,5 т/ось, битумовозы, платформы ≥19.6м; 27 = щепа/2-ярус.авто/лесоматериалы ≥19.6м/автомобилевоз; 28 = локомотивы/краны/>25м; 29 = пассажирские/ЭП/ДП; 25(1)/26(1) = после контейнерных).
- The seed's `schemeMeta` "26" description includes изотермические — consistent with the hypothesis that the dashed изотермические row in §2 maps to scheme 26.
- `scripts/seed-data/tr1-scheme-classifier.json` routes own полувагон/крытый → `emptyScheme: N25`, платформа <19.6m → `N25(1)`, ≥19.6m контейнеры → `N26` — all consistent with rows 1, 6, 2 of this table.
- The numeric belt rates for these scheme numbers are NOT on this page; they are in Приложение N 2, fully captured in `tr1-empty-run-full.json` (889 rows; first-8-belt values cross-checked byte-for-byte per its `verifyNote`).

**EXTENDS (this page adds detail the classifier seed should encode):**
- Row 3 (scheme 27) explicitly names **«1-ярусный крытый вагон для микроавтобусов»** and **«крытый вагон для автомобилей»** — confirm these wagon-type codes route to `emptyScheme: N27` in `tr1-scheme-classifier-extended.json` (registry codes ОК/автомобилевоз). Verify coverage.
- Row 2 explicitly conditions scheme 26 on **«массой тары более 7,5 т/ось»** for сжиженные-газ cisterns — a tare-mass threshold the classifier seed should branch on (heavy-tare cistern → 26, otherwise → 25). Confirm the seed encodes the 7,5 т/ось split.
- Rows 6 & 7 (`25(1)` / `26(1)`) are conditioned on **«после контейнерных перевозок»** — a *post-container-haul state*, not a static wagon attribute. The engine must select `25(1)`/`26(1)` only when the immediately preceding loaded leg was a container haul; otherwise the same platform uses 25/26. Flag: confirm `schemeResolve.ts` carries this prior-haul context, otherwise it will mis-route container-platform empties.

**CONTRADICTS / OPEN:**
- **No contradiction with the per-wagon vs per-axle question.** This page (Таблица N 17) carries no rubles, so it neither confirms nor refutes the unit. The unit question is settled on the Приложение N 2 side and documented in `tr1-empty-run-full.meta.json[unitContradictionNote]`: engine (`src/lib/tariff/computeTariff.ts:252 emptyRun = er.rateRub`), seed, and source transcription are mutually consistent at **per-wagon**; flipping to per-axle would 4× every own-wagon empty leg with no oracle backing — KEPT per-wagon. NEEDS-DATA: one real own-ПВ порожний-return квитанция to anchor the empty leg in rubles (currently goldenUniversal Scenario 4 only asserts `emptyRun > 0`).
- **Изотермические row (dashed):** see §2 ⚠ — the scheme cell did not render. Treated as UNFETCHABLE on this fetch; do NOT fabricate a scheme number. Resolve from the source page footnote and п.22 cross-ref before encoding.

---

## 5. Where the full machine table already lives on disk

| Artefact | File | Note |
|---|---|---|
| Type → scheme mapping (THIS table) | `scripts/seed-data/tr1-empty-run.json` → `schemeMeta`, and `tr1-scheme-classifier.json` / `tr1-scheme-classifier-extended.json` | classifier rows |
| Numeric belt rates (Приложение N 2) | `scripts/seed-data/tr1-empty-run-full.json` (889 rows) + `tr1-empty-run-full.meta.json` | per-wagon ₽, 2026-indexed, verified first-8-belt |
| Empty-run surcharge ×1,1 | `scripts/seed-data/tr1-coefficients.json` | порожний надбавка, Приказ ФАС 999/24 |
| Engine consumption | `src/lib/tariff/computeTariff.ts` (`emptyRun = er.rateRub`), `src/lib/tariff/schemeResolve.ts` (`snapEmptyRun`) | per-wagon, no axle multiply |

---

## 6. Fabrication attestation

Every wagon-type string and scheme number in §2 is quoted verbatim from the WebFetch of the sudact.ru URL above. No ruble value appears on this page and none was invented here. The single non-rendering cell (изотермические row) is explicitly flagged UNFETCHABLE rather than filled. All cross-references in §4–§5 point at existing on-disk files and are comparisons, not re-derivations.
