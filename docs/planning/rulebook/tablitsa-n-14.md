# Таблица N 14 — Тарифные схемы для термических контейнеров

> **Primary source (no paywall, verbatim):**
> `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-14/`
> **Law:** Приказ ФАС России от 06.11.2025 № 894/25 (с изм. от 13.02.2026) «Об утверждении Порядка расчёта тарифов … (Тарифное руководство № 1)», зарегистрировано в Минюсте России 22.12.2025 № 84708, в силе с 2026-01-01 (заменил Прейскурант 10-01).
> **Page metadata (from page JSON-LD):** `datePublished: 2026-01-01`, `dateModified: 2025-11-06`, author «Федеральная антимонопольная служба».
> **Fetched verbatim this pass:** 2026-06-09. Three independent passes, all agree on the data cells: (1) WebFetch markdown summary, (2) WebFetch strict-verbatim Russian, (3) raw-HTML `<table>` extraction (`curl` 76 280 bytes → row-by-row tag-strip). **The raw-HTML pass is authoritative** — it recovered the true two-level header banner («Коэффициенты к ставкам тарифных схем» → «для гружёных … в том числе в зависимости от массы погруженного груза» → «масса груза, т | коэффициент»), which the WebFetch summaries had flattened/relabelled. No number differs between passes.
> **On-disk machine table (canonical store):** NONE. Schemes 102–105 and these coefficients are **not seeded anywhere** (see §4). Closest related stores: `scripts/seed-data/tr1-i-belts-container.json` (container schemes 85–94, explicitly excludes thermal — Табл.N14 marked RED/out-of-scope), `tr1-i-belts-reefer.json` (изотермические/рефрижераторные ВАГОНЫ schemes N30/N31 — a different product), `tr1-empty-run.json` (схема N26 lists изотермические вагоны).

---

## 1. What this table is and where it enters the tariff

`Таблица N 14` is the **scheme-selector + coefficient table** for **грузы, перевозимые контейнерной отправкой в ТЕРМИЧЕСКИХ контейнерах** (thermal/insulated/refrigerated *containers* — NOT thermal wagons). It does **two** things at once:

1. **Selects the тарифную схему** by container length (типоразмер, футы) and by loaded/empty state — schemes **102, 103** (гружёный) and **104, 105** (порожний).
2. **Supplies a multiplier коэффициент** applied to the rate read out of that scheme, differentiated by container size and (for >30 ft loaded) by mass of cargo.

**How it enters the calculation (plain Russian):**

The container tariff chain for a container shipment is `плата = (плата по тарифной схеме) × (коэффициент Табл.N14)`. Concretely:

- **Step A — выбор схемы.** Pick the scheme number from this table by container length and loaded/empty: 10 ft / >10–20 / >20–30 → гружёный **102**, порожний **104**; >30 ft → гружёный **103**, порожний **105**.
- **Step B — базовая плата.** Read the base tariff for that scheme. Thermal-container schemes 102–105 are continuous A + B×KL plates of the same family as the universal container schemes 85–94 in `tr1-i-belts-container.json` (plate = начально-конечные + движенческие × тарифное расстояние, руб./контейнер). **NB: the (A,B) plates for 102–105 are NOT yet sourced — see §4.**
- **Step C — коэффициент Табл.N14.** Multiply the base plate by the коэффициент from this table:
  - **10 ft:** ×**0,83** (loaded, независимо от загрузки) / ×**0,83** (empty).
  - **>10–20 ft:** «–» (no coefficient — i.e. coefficient = 1, plate taken as-is) for both loaded and empty.
  - **>20–30 ft:** ×**1,27** (loaded) / ×**1,27** (empty).
  - **>30 ft:** loaded ×**1,08** if cargo mass свыше 27 по 30 т включительно, ×**1,15** if свыше 30 т; empty «–» (no coefficient).

**Unit:** the коэффициент is **dimensionless** (множитель к ставке схемы). The underlying plate is **руб. за контейнер, без НДС**. The coefficient multiplies the whole per-container plate, not a per-ton or per-km sub-component.

**Mass band only matters for >30 ft loaded.** For 10 ft, >10–20, >20–30 the loaded coefficient is «независимо от загрузки» (independent of loading) — mass is irrelevant. The two-row split on «свыше 30» is purely a mass-band split of the SAME size/scheme (103), not two different container sizes.

---

## 2. Verbatim table (raw-HTML `<table>` pass, 2026-06-09)

Reproduced literally from the page `<table>`. Cell separator shown as ` || ` exactly as parsed; `<br>` inside a cell shown as ` / `; empty header cells shown blank. Decimal separator is a comma, exactly as in the source. The title appears twice in the source (banner + in-table caption); reproduced once.

```
Таблица N 14
Тарифные схемы, применяемые при расчете тарифа
на перевозку по инфраструктуре РЖД контейнерной отправкой
грузов в термических контейнерах

Типоразмер контейнера (длина), футы || Номера тарифных схем || Коэффициенты к ставкам тарифных схем ||
 || груженый контейнер || порожний контейнер || для груженых контейнеров, в том числе в зависимости от массы погруженного груза || для порожних контейнеров ||
 || || || масса груза, т || коэффициент || коэффициент ||
10 || 102 || 104 || независимо от загрузки || 0,83 || 0,83 ||
свыше 10 по 20 включительно || 102 || 104 || - || - || - ||
свыше 20 по 30 включительно || 102 || 104 || независимо от загрузки || 1,27 || 1,27 ||
свыше 30 || 103 || 105 || свыше 27 по 30 включительно || 1,08 || - ||
 || || || свыше 30 || 1,15 || - ||
```

**Header structure (3-level, observed in source):**
- Col 1 — `Типоразмер контейнера (длина), футы` (stub).
- Col 2 banner — `Номера тарифных схем`, split into `груженый контейнер` | `порожний контейнер`.
- Col 3 banner — `Коэффициенты к ставкам тарифных схем`, split into `для груженых контейнеров, в том числе в зависимости от массы погруженного груза` (itself split into `масса груза, т` | `коэффициент`) and `для порожних контейнеров` → `коэффициент`.

**Notes on layout (observed, not fabricated):**
- The `свыше 30` row is physically rendered as **two `<tr>` rows**: the first carries the schemes (103 / 105) and the first mass band (`свыше 27 по 30 включительно → 1,08`); the second `<tr>` has empty leading cells and carries only the second mass band (`свыше 30 → 1,15`). Both belong to the single >30 ft size class.
- `-` (dash) means **no coefficient is published** for that cell. Interpretation: the rate of the scheme is taken without a Табл.N14 multiplier (effective ×1,0). This is the standard reading of «–» in these ФАС coefficient tables.
- **No separate «Примечание» / footnote block** exists on this page outside the table.

---

## 3. Structured restatement (machine-friendly, derived from §2 — no new numbers)

| Типоразмер, футы | Схема гружёный | Схема порожний | Условие по массе (гружёный) | Коэф. гружёный | Коэф. порожний |
|---|---|---|---|---|---|
| 10 | 102 | 104 | независимо от загрузки | **0,83** | **0,83** |
| свыше 10 по 20 включительно | 102 | 104 | — | — (×1,0) | — (×1,0) |
| свыше 20 по 30 включительно | 102 | 104 | независимо от загрузки | **1,27** | **1,27** |
| свыше 30 | 103 | 105 | свыше 27 по 30 включительно | **1,08** | — (×1,0) |
| свыше 30 | 103 | 105 | свыше 30 | **1,15** | — (×1,0) |

Schemes used by this table: **102, 103** (loaded) and **104, 105** (empty). These are thermal-container-specific scheme numbers and appear in no other rulebook table captured so far.

Derivable engine rule (pseudocode, no invented numbers):

```
if shipment.kind == container and container.thermal:
    if length_ft <= 10:               scheme=(102,104); coefLoaded=0.83; coefEmpty=0.83
    elif 10 < length_ft <= 20:         scheme=(102,104); coefLoaded=1.0;  coefEmpty=1.0
    elif 20 < length_ft <= 30:         scheme=(102,104); coefLoaded=1.27; coefEmpty=1.27
    else:  # > 30 ft
        scheme=(103,105); coefEmpty=1.0
        if 27 < mass_t <= 30:          coefLoaded=1.08
        elif mass_t > 30:              coefLoaded=1.15
        # NB: no published band for mass <= 27 t on >30 ft — UNSPECIFIED in source (see §4 flag)
    plate = base_plate(scheme[loaded?0:1])   # (A + B*KL) — NOT YET SOURCED for 102-105
    charge = plate * (coefLoaded if loaded else coefEmpty)
```

---

## 4. Extends / contradicts the current engine & seed

Cross-referenced against `scripts/seed-data/tr1-i-belts-container.json`, `tr1-i-belts-reefer.json`, `tr1-special-rules.json`, `tr1-empty-run.json`, `tr1-scheme-classifier-extended.json` (read 2026-06-09).

**EXTENDS (entirely new, NOT in any seed) — this is the headline finding:**
- **Schemes 102, 103, 104, 105 are not present in any seed file** (verified: `"102"`/`"103"`/`"104"`/`"105"` absent from `tr1-i-belts-container.json`; absent as scheme codes elsewhere — only matches are unrelated rate digits).
- **The coefficients 0,83 / 1,27 / 1,08 / 1,15 are not seeded** in any thermal-container context. (`0,83` appears in `tr1-i-belts-reefer.json` only as a фрагмент of rate values like `rateRub: 109835`, never as a Табл.N14 coefficient.)
- `tr1-i-belts-container.json._meta.coverage` **already self-declares this gap**, verbatim: *«RED: … термические контейнеры (Табл.N14 — вне scope этого файла).»* This rulebook is the first verbatim capture of what that RED gap contains.
- `tr1-special-rules.json` (line ~95) flags a parallel reefer gap: *«Базовая ставка схемы N 30 и поправки для собств. реф.вагонов / термосов / ИВ-термосов НЕ извлечены»* — but that concerns reefer/thermos **WAGONS** (schemes N30/N31), a different product from thermal **CONTAINERS** (this table). Do not conflate them.

**FLAG — missing prerequisite to actually compute a thermal-container quote (HIGH):**
- This table gives the **scheme selector + multiplier**, but the **base (A,B) plates for schemes 102–105 are NOT sourced** anywhere on disk. Source-to-obtain: the thermal-container plates live in Приложение N 2 (the rate-schemes appendix), under the schemes index that publishes 85–105; the universal container plates 85–94 were taken from `…/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-24/`. The 102–105 plates must be fetched from the corresponding Прил.N2 scheme table before any thermal-container quote can be computed to the kopeck. **Until then, thermal-container quotes are not derivable — flag RED, do not fabricate a plate.**

**FLAG — undefined band on >30 ft loaded (MEDIUM):**
- The source publishes loaded coefficients for >30 ft only for mass **«свыше 27 по 30»** (1,08) and **«свыше 30»** (1,15). There is **no published coefficient for mass ≤ 27 т on a >30 ft thermal container.** The source is silent; do **not** assume 1,0 or interpolate. Treat ≤27 т on >30 ft as UNSPECIFIED and verify against R-Тариф / Прил.N2 before trusting any engine default.

**FLAG — empty-run scheme cross-check (LOW):**
- `tr1-empty-run.json.schemeMeta["26"]` lists «изотермические» under wagon empty-run scheme N26. That is the **wagon** empty-run regime and is unrelated to thermal-**container** empty schemes 104/105 defined here. No contradiction — just confirming these are distinct mechanisms (empty thermal CONTAINER → scheme 104/105 per this table; empty изотермический WAGON → N26).

**No fabrication:** every scheme code (102, 103, 104, 105), every coefficient (0,83; 1,27; 1,08; 1,15), the mass bands («свыше 27 по 30 включительно», «свыше 30»), the size classes («10», «свыше 10 по 20 включительно», «свыше 20 по 30 включительно», «свыше 30»), and «независимо от загрузки» / «–» are quoted directly from the §2 verbatim `<table>` cells. Nothing was invented, interpolated, or paraphrased into a number. Missing prerequisites (base plates 102–105; ≤27 т band) are flagged, not filled.
