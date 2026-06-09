# Таблица N 8 — Тарифные схемы для наливных грузов в цистернах (сопоставление груз → схема)

> **Primary source (no paywall, verbatim):**
> `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-8/`
> **Law:** Приказ ФАС России от 06.11.2025 № 894/25 («Тарифное руководство № 1»), с изм. от 13.02.2026, рег. Минюст 22.12.2025 № 84708, в силе с 2026-01-01 (заменил Прейскурант 10-01).
> **Fetched verbatim this pass:** 2026-06-09 — raw HTML pulled by `curl` (85 920 bytes) and tag-stripped; all 11 numbered cargo rows plus sub-rows rendered cleanly. A first WebFetch pass collapsed rows ("same as above") and mislabeled the two tariff columns; that summary was **discarded** in favour of the raw-HTML extraction below.
> **On-disk cross-refs:** `scripts/seed-data/tr1-scheme-classifier-pinned.json`, `tr1-scheme-classifier-extended.json`, `tr1-scheme-classifier.json` (the cargo→scheme rows). **NOTE the naming clash** — `scripts/seed-data/tr1-n8-corrected.json` is **NOT** this table; it is the weight×distance rate grid for a tariff *schedule* the seeds internally label "N8" (`schemeN8_weightDist`, 8449 cells). Таблица N 8 of the Приказ is a *mapping* table, not a rate grid.

---

## 1. What this table is and where it enters the tariff

`Таблица N 8` is the **scheme-selection (classifier) table for liquid cargo carried in cisterns** (`наливные грузы … в цистернах`). It does **not** contain any rouble amounts. Its job is to answer one question: *given the ЕТСНГ code of the liquid cargo and the ownership of the cistern, which tariff scheme(s) drive the rate lookup?*

Each row resolves to **up to three** outputs across two ownership regimes:

| Column header (verbatim) | Meaning | Used when |
|---|---|---|
| **Тариф на использование инфраструктуры РЖД и локомотивов РЖД** | the **«И»-scheme** (infrastructure + locomotive part) | always (both own and RZD-fleet) |
| **Тариф на использование вагонов** | the **«В»-scheme** (wagon part), only for **РЖД (общий парк)** cisterns | only when the cistern is RZD common-fleet |
| **Номера тарифных схем** | the **numeric scheme № (19–24)** used when the cistern is **собственная/арендованная** (own/leased) | only for own/leased cisterns |

**How it enters the calculation (plain Russian):**

1. Determine cargo ЕТСНГ code → find the matching row in Табл.8.
2. **If the cistern is общего парка (RZD):** the tariff = «И»-схема (one of **И14–И18**) for the infrastructure part **plus** the «В»-схема (one of **В6–В15**) for the wagon part. Both parts are per-cargo rate schedules looked up by **вес × расстояние** belts elsewhere in Приложение N 1.
3. **If the cistern собственная/арендованная (own/leased):** the tariff = the **numeric scheme № (19–24)**, which is a single per-ton schedule (no separate «В»-part, since the owner provides the wagon). The «–» dashes in rows 6 and 7 mean there is **no «И»/«В» pair** for those gases — only the numeric scheme applies.

The scheme numbers (19–24) and the И/В schemes are **inputs to a downstream rate-belt lookup** (вес-пояс × расстояние-пояс). This table itself contributes **no multiplier and no unit** — it is purely the *router* that picks which rate schedule to read. Belt/rate values live in the i-belt / v-belt seeds (`tr1-i-belts-cistern.json`, `tr1-v-belts-full.json`) and the schedule grids.

---

## 2. Verbatim table (as fetched 2026-06-09 from raw HTML)

Reproduced literally. Layout in source: `<наименование груза ЕТСНГ> | <позиции/коды ЕТСНГ> | <И-схема> <В-схема> <номер схемы>`. Sub-rows (1.1, 4.1, …) list additional ЕТСНГ codes that **inherit the scheme triple of their parent numbered row** (the source prints them under the parent with no separate scheme columns). Decimal/range punctuation kept exactly (hyphen ranges, commas).

```
Таблица N 8
Тарифные схемы, применяемые при расчете тарифа на перевозку наливных грузов
по инфраструктуре РЖД в цистернах

Колонки:
  Наименование груза ЕТСНГ
  Позиции ЕТСНГ и коды ЕТСНГ для отдельных грузов
  Вагоны Общего парка → { Тариф на использование инфраструктуры РЖД и локомотивов РЖД ; Тариф на использование вагонов }
  Собственные (арендованные) → Номера тарифных схем

1.   Нефть и нефтепродукты | 201, 211 - 215, 221 - 225 | И14 | В7 | 19
1.1.   Бензин стабильный газовый | 226021 | (inherits row 1: И14 / В7 / 19)
1.2.   Дистилляты газового конденсата | 226069 | (inherits row 1: И14 / В7 / 19)
1.3.   Конденсат газовый (конденсат из природного газа) | 226106 | (inherits row 1: И14 / В7 / 19)

2.   Кислоты, оксиды, пероксиды, ангидриды | 481 | И14 | В12 | 19

3.   Спирт метиловый (метанол) | 721484 | И15 | В9 | 20

4.   Углеводороды и их производные: винилбензол (стирол) ингибированный | 711088 | И16 | В14 | 20
4.1.   Хлорэтил | 712574 | (inherits row 4: И16 / В14 / 20)
4.2.   Этилхлорид (хлорэтан, монохлорэтан) | 712606 | (inherits row 4: И16 / В14 / 20)

5.   Молоко и молочные продукты | 551, 552 | И17 | В12 | 22

6.   Газы, кроме энергетических | 488, кроме 488015, 488020, 488049, 488161, 488123 | - | - | 21
6.1.   Винил хлористый (винилхлорид) ингибированный | 712095 | (inherits row 6: – / – / 21)
6.2.   Метил хлористый (монохлорметан, метилхлорид) | 712254 | (inherits row 6: – / – / 21)

7.   Газы энергетические (углеводороды сжиженные) | 226, кроме 226021, 226069, 226106 | - | - | 23
7.1.   Азот жидкий, охлажденный | 488015 | (inherits row 7: – / – / 23)
7.2.   Азот сжатый | 488020 | (inherits row 7: – / – / 23)
7.3.   Аммиак жидкий безводный | 488049 | (inherits row 7: – / – / 23)
7.4.   Аммиак безводный сжиженный | 488161 | (inherits row 7: – / – / 23)
7.5.   Бутадиен ингибированный | 488123 | (inherits row 7: – / – / 23)
7.6.   Изобутилен (1-метил-пропен) | 711209 | (inherits row 7: – / – / 23)
7.7.   Изопентан ингибированный | 711228 | (inherits row 7: – / – / 23)
7.8.   Пропилен (пропен) | 711374 | (inherits row 7: – / – / 23)

8.   Нефть, нефтепродукты после распыления | (нет отдельных кодов) | И18 | В15 | 24

9.   Остальные грузы, кроме поименованных в тарифных схемах N N В7 - В10, В12, В14 | (нет кодов) | И14 | В6 | 19

10.  Соки, виноматериалы | (нет кодов) | И14 | В12 | 19

11.  Остальные химические грузы, кроме поименованных в тарифных схемах N N В9, В10, В12 | (нет кодов) | И14 | В14 | 19
```

**Примечания:** на странице явных примечаний (приписок) после таблицы НЕТ. Навигация подтверждает положение: предыдущая — «Таблица N 7. … специализированные вагоны», следующая — «Таблица N 9. … специализированные изотермические вагоны».

---

## 3. Reading the column semantics precisely (verbatim trap)

The first WebFetch pass labeled the third numeric column as the only "tariff scheme" and folded the two named columns together — that is **wrong**. The raw HTML header order, verbatim, is:

```
… | Вагоны Общего парка | Собственные (арендованные)
        ├─ Тариф на использование инфраструктуры РЖД и локомотивов РЖД   → И-схема
        └─ Тариф на использование вагонов                                 → В-схема
                                              Номера тарифных схем         → № 19–24
```

So per row there are exactly three scheme tokens in fixed order: **И-schema, В-schema, numeric-№**. Where a cargo is gas (rows 6 and 7) the И and В tokens are literal dashes `-`/`-` (no common-fleet infrastructure/wagon split is offered for those gases — only the numeric own-cistern scheme).

---

## 4. What this EXTENDS / CONTRADICTS in the current engine & seeds

### 4.1 Naming clash to fix (HIGH — not a data error, a labeling hazard)
- `scripts/seed-data/tr1-n8-corrected.json` carries top key `schemeN8_weightDist` and is an **8449-cell weight×distance rouble grid** for a schedule the seeds call "N8". **This file is unrelated to Приказ Таблица N 8.** Anyone wiring the cistern classifier from "n8" will grab the wrong artifact. Recommend the seed be aware that *Приказ Табл.N8 = cargo→scheme mapping*, while the rate grid should be referenced by its own schedule number, not "N8".

### 4.2 Coverage gap in the pinned classifier (MEDIUM — extends seed)
`tr1-scheme-classifier-pinned.json` pins **only the dominant nefteproduct row** as hard fields and stuffs every other cistern cargo into a free-text `sourceNote`:
- Own/leased cistern rows pin `iScheme:"19"`, `iBeltScheme:"N19"`, `emptyScheme:"25"` — i.e. **only row 1 (нефть, ЕТСНГ 201–225, схема 19)**.
- RZD-fleet cistern rows pin `iScheme:"И14"`, `vScheme:"В7"`, `vBeltScheme:"В7-4"` — again **only row 1**.
- The note then mentions in prose: `метанол=И15/В9/20, винилхлорид=И16/В14, молоко=И17/В12/22`.

This table SUPPLIES the **complete, structured mapping** the pinned seed lacks. The full set of own-cistern numeric schemes is **{19, 20, 21, 22, 23, 24}** and the full RZD-fleet pairs are **И14–И18 × В6–В15**, keyed by ЕТСНГ as listed in §2. The pinned seed should be extended with rows 2–11 (currently only row 1 is machine-pinned; rows 2–11 are verified verbatim here for the first time).

### 4.3 Confirmations (no contradiction)
- `tr1-scheme-classifier-extended.json` already states own cisterns → `N19..N24` and RZD cisterns → `И14..И17` + `В6..В14` at `confidence:"medium"`. This table **confirms and tightens** that range to the exact upper bounds **И14–И18** and **В6–В15** (extended seed under-stated the top of each range — it stopped at И17/В14; the real maxima are **И18** (row 8) and **В15** (row 8)). MEDIUM contradiction on the range endpoints — extended seed should be widened.
- Row-1 triple (И14/В7/19) matches the pinned seed exactly. ✔

### 4.4 New facts surfaced (not previously on disk in structured form)
- Scheme **21** (газы кроме энергетических) and scheme **23** (газы энергетические) have **no И/В pair** (dashes) — own-cistern numeric-only. Not represented in any seed row.
- Scheme **24** + **И18/В15** = «нефть/нефтепродукты после распыления» — a distinct row not pinned anywhere.
- Catch-all rows 9 / 10 / 11 (residual / juices-winematerials / residual chemicals) all funnel to **И14** but split В-part: В6 / В12 / В14 respectively, all own-scheme 19. This is the default-routing logic the engine needs for unlisted liquid cargo.

### 4.5 Not in scope of this table (flagged so the engine doesn't over-read it)
- **No rouble amounts, no belts, no coefficients here.** The actual rates for schemes 19–24 and И14–И18 / В6–В15 live in the belt/grid seeds; Табл.8 only routes to them.
- **Empty-run (порожний пробег)** schemes (N25/N26) are **not** in Табл.8 — they come from the empty-run rules (`tr1-empty-run-full.json`); the classifier seeds correctly source them separately.

---

## 5. Machine-table recommendation

The verbatim §2 content should be normalised into a dedicated seed (e.g. `tr1-scheme-cistern-naliv.json`) with one record per ЕТСНГ key:
`{ etsngKeys: [...], cargoName, iScheme, vScheme (nullable), ownSchemeNo, inheritsFromRow }`.
Until then, the canonical machine source for cistern routing is `tr1-scheme-classifier-pinned.json` (row 1 only, reliable) supplemented by THIS document for rows 2–11. Do not reuse `tr1-n8-corrected.json` for routing (see §4.1).
