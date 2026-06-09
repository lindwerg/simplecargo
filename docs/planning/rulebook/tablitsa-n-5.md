# Таблица N 5 — Коэффициенты повагонные / групповые / маршрутные (= K4)

> **Primary source (no paywall, verbatim):**
> `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-5/`
> **Law:** Приказ ФАС России от 06.11.2025 № 894/25 («Тарифное руководство № 1»), рег. Минюст 22.12.2025 № 84708, в силе с 2026-01-01 (заменил Прейскурант 10-01).
> **Fetched verbatim this pass:** 2026-06-09 (2 WebFetch passes — English-summary + raw-Russian — agreed cell-for-cell). Cross-referenced against two earlier independent verbatim passes captured on disk (`tr1-k4-full.json`, `tr1-k4-corrected.json`, both fetched 2026-06-07).
> **On-disk machine table (canonical store):** `scripts/seed-data/tr1-k4-corrected.json` (`distanceCorr[]`). Identical numeric table also in `tr1-k4-full.json`.

---

## 1. What this table is and where it enters the tariff

`Таблица N 5` is the **отправочный коэффициент K4** — a dimensionless multiplier keyed by two inputs at once:

1. **Количество вагонов в отправке** (number of wagons in one shipment / накладная), bracketed into rows: `1`, `2`, `3 - 5`, `6 - 20`, `Свыше 20`; **plus** two technology rows for отправительские маршруты (`прямые`, `с распылением`).
2. **Пояс дальности** (distance belt of the route), in four columns: `До 510`, `511 - 1000`, `1001 - 2000`, `Свыше 2000` (km).

**How it enters the calculation (plain Russian):**
K4 is a **безразмерный множитель** (not a per-ton or per-km rate). In the п.16/п.17 calculation chain it multiplies the infrastructure ("И"-часть) tariff **after** the class/distance coefficient K1 (Табл.2) and the товарный coefficient K3 (Табл.4). Exactly **one** K4 cell applies per shipment: pick the row by wagon-count bracket (or by route technology if it is an отправительский маршрут), pick the column by the route's distance belt, read the cell. For a 1-wagon shipment over 600 km that is `1,04`; for a 30-wagon block over 2500 km that is `1,00`; for a direct отправительский маршрут over 600 km that is `0,89`.

**Unit / step in SimpleCargo engine:** applied as `shipmentGroup × distanceBelt → k`, after K1·K3, on the И-rate. Route technology rows (`маршрут прямой`, `маршрут с распылением`) are selected **instead of** a wagon-count row when the shipment is an отправительский маршрут.

---

## 2. Verbatim table (raw Russian, as fetched 2026-06-09)

Reproduced literally. Decimal separator is a comma, exactly as in the source. Belt headers and row labels are byte-for-byte from the раw-Russian fetch.

```
Таблица N 5

Коэффициенты для повагонных, групповых, маршрутных отправок грузов в
универсальных, специализированных вагонах и цистернах в зависимости от
количества вагонов в отправке и применяемой технологии

Количество вагонов в отправке и применяемая технология | До 510 | 511 - 1000 | 1001 - 2000 | Свыше 2000
1                                        | 1,08 | 1,04 | 1,03 | 1,01
2                                        | 1,02 | 1,01 | 1,01 | 1,00
3 - 5                                    | 1,00 | 1,00 | 1,00 | 1,00
6 - 20                                   | 0,97 | 0,98 | 1,00 | 1,00
Свыше 20                                 | 0,95 | 0,97 | 0,98 | 1,00
Отправительские маршруты: прямые         | 0,85 | 0,89 | 0,92 | 0,95
Отправительские маршруты: с распылением  | 0,90 | 0,92 | 0,95 | 0,97
```

**Примечание:** no separate «Примечание»/footnote block renders on the Табл.5 page itself in either fetch pass. The application rules that govern this table (which schemes it covers, the row-selection rule, and the belt-boundary continuity guard) are **not** on the Табл.5 page — they live in the application text **п.17.1 / п.17.2** of Приложение N 1, Раздел II (captured verbatim in §3 below, sourced from the on-disk verify pass).

### 2.1 Cross-pass agreement (verbatim verification)

All four sources agree on **every one of the 28 cells**, the four belt headers, and all seven row labels:

| Source | Fetched | Status |
|---|---|---|
| raw-Russian WebFetch (this pass) | 2026-06-09 | exact, with Russian decimal commas |
| English-summary WebFetch (this pass) | 2026-06-09 | exact (dot decimals), no Примечание |
| `tr1-k4-corrected.json` `verbatim` + `distanceCorr[]` | 2026-06-07 | exact |
| `tr1-k4-full.json` `verbatimTable` + `distanceCorr[]` | 2026-06-07 | exact |

**No cell was unfetchable.** All 28 numbers rendered cleanly in both live passes. Confidence: **GREEN** on the entire numeric table.

---

## 3. Application rules — п.17.1 / п.17.2 (verbatim, from on-disk verify pass)

These two paragraphs are the **rules of application** for Табл.5. They were captured verbatim in an earlier sudact pass and stored in `tr1-k4-corrected.json` (`k4Application_VERBATIM`, `BOUNDARY_RULE_VERBATIM`). They are **not re-fetched in this pass** (the Раздел II application page returns only an oглавление through the current WebFetch — flagged below).

**п.17.1 (row selection + scheme coverage), VERBATIM from `tr1-k4-corrected.json`:**

> «При перевозке грузов по инфраструктуре РЖД в универсальных, специализированных вагонах и цистернах в зависимости от количества вагонов в отправке (повагонная, групповая) и применяемой грузоотправителем технологии перевозки грузов (отправительский маршрут) к тарифным схемам ... применяются коэффициенты, указанные в таблице N 5».

- **Schemes covered:** И1-И7, И14-И18, 8, 8(1), 9-13, 19-24, 31.
- **Накладная marks:** ВО = повагонная, ГО = групповая, М = маршрут.
- **ROW-SELECTION RULE (verbatim-derived):** the row is selected **by the number of wagons in the отправка** («в зависимости от количества вагонов в отправке»). Групповая отправка = партия по одной накладной, > 1 вагона но < маршрута; the row is the wagon-count bracket containing that count. **Therefore a 15-wagon групповая maps to row `6 - 20`, NOT row `1`.**

**п.17.2 (belt-boundary continuity guard), VERBATIM from `tr1-k4-corrected.json`:**

> «При применении коэффициента абсолютная величина увеличения (уменьшения) тарифов ... при переходе на последующую градацию пояса дальности не должна быть меньше абсолютной величины увеличения (уменьшения) тарифов ... на наибольшем расстоянии предыдущего пояса».

- This is a **continuity guard on the resulting плата across belt boundaries** — it ensures the charge does not drop when you cross into the next belt. It is **NOT** a «max-of-two-rows» rule and does **not** promote a `1,00` coefficient to a higher row's value.

---

## 4. EXTENDS / CONTRADICTS the current engine / seed

### 4.1 Numeric table — fully consistent (no change)
The 28-cell table in this rulebook is **byte-identical** to `distanceCorr[]` in both `tr1-k4-corrected.json` and `tr1-k4-full.json`. No correction to the live seed values. Both seeds also carry the seven row labels under the engine's `shipmentGroup` keys: `1`, `2`, `3-5`, `6-20`, `свыше 20`, `маршрут прямой`, `маршрут с распылением`, with belt edges `0-510 / 511-1000 / 1001-2000 / 2001-∞`.

### 4.2 CONTRADICTS an earlier engine assumption (already corrected on disk)
There is a **documented calibration contradiction** between verbatim п.17.1 and the R-Тариф oracle, fully recorded in `tr1-k4-corrected.json` (`CALIBRATION_CONTRADICTION`, `WARNING_INFERRED`) and `tr1-k4-full.json` (`boundaryRule`, `shortHaul699_derivation`):

- An **older** engine note claimed групповая «maps to row `1`» / applied a **max-of-two** rule (`K4_eff = max(K4[group, belt], K4[row '1', belt])`). That assignment was an **oracle FIT**, not supported by п.17.1/17.2 as written. It has been **DEPRECATED** in `tr1-k4-corrected.json`.
- **Verbatim п.17.1** says row = wagon-count bracket → a 15-wagon групповая @2444 km uses row `6 - 20` → K4 = `1,00` at belt `Свыше 2000`.
- **But** real квитанция ЭФ164189 (2444 km) reproduces to the ruble **only** with effective K4 = `1,01` (= the row `1` value). This residual is now an **OPEN calibration question**, not a confirmed mapping.

**Honest status:** the table values are verbatim-certain; the *row-selection for групповая on long hauls* has a 1 % residual against one oracle that the verbatim text does not explain. Do **not** re-introduce the row-1 / max-of-two fit as fact.

### 4.3 Short-haul (699 km) residual — flagged, NOT closed (from `tr1-k4-full.json`)
On the 699 km / 6-wagon групповая / щебень oracle (ЭТ201459, target 31 224 ₽/вагон), **no verbatim Табл.5 value closes the receipt to the ruble**:
- row `6 - 20` @ `511-1000` = `0,98` → 31 045 ₽ (under by 179 ₽)
- row `3 - 5` / boundary = `1,00` → 31 679 ₽ (over by 455 ₽)
- The exact effective K4 needed = `0,98563` lies **between** `0,98` and `1,00` and is **not derivable** from the extracted Табл.5 rule.
- The current engine applies a **fitted constant** `SHORT_HAUL_BOUNDARY_UPLIFT = 1,0057499686370497` (0,98 × 1,00575 = 0,98563) — explicitly a **подогнанная константа, not a source value**.
- Open hypotheses (see `tr1-k4-full.json` `remainingHypotheses`): K1(699) ≠ 0,75 fine-belt step; N8 weight-row rounding (67,6–68,8 t → 68 t vs 70 t); a separate short-haul minimum-weight-norm multiplier (`tr1-min-weight-norms.json`) not part of K4. **Recommendation:** obtain an R-Тариф reference on a short haul (<1000 km, групповая) to separate K1/N8/K4 without fitting.

### 4.4 Route-technology rows (no defect)
Rows `Отправительские маршруты: прямые` and `с распылением` are verbatim. In the engine they are `shipmentGroup` = `маршрут прямой` / `маршрут с распылением` and are applied **instead of** a wagon-count row for маршрутная отправка — they do **not** participate in any max-of-two with the повагонная row.

---

## 5. Unfetchable / source-to-obtain
- **Verbatim re-fetch of п.17.1 / п.17.2 this pass:** the Раздел II application page returns only an оглавление through the current WebFetch; the full paragraph text is taken from the on-disk verify pass (`tr1-k4-corrected.json`, fetched 2026-06-07), NOT re-confirmed live this pass. Source to obtain: Приложение N 1, Раздел II, пп.17.1–17.2 on sudact (same base URL tree) read paragraph-literal.
- **Short-haul K4 exact closure:** not derivable from primary docs; requires an R-Тариф short-haul reference receipt (operator).

---

## 6. Where the full machine table lives on disk
- **Canonical K4 store:** `scripts/seed-data/tr1-k4-corrected.json` (`distanceCorr[]` — 28 cells × `{shipmentGroup, distFromKm, distToKm, k}`; `_meta` carries п.17.1/17.2 verbatim + calibration notes).
- **Identical numeric table + boundary-rule narrative:** `scripts/seed-data/tr1-k4-full.json`.
- **Related load-bearing seeds:** `tr1-k1-full.json` (K1, Табл.2), `tr1-k3-full.json` (K3, Табл.4 — see rulebook `tablitsa-n-4.md`), `tr1-min-weight-norms.json` (short-haul minimum-weight-norm — candidate for the 699 km residual), `tr1-n8-corrected.json` (И-base by weight × belt).
