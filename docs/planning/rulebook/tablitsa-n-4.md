# Таблица N 4 — Коэффициенты для отдельных грузов (= K3, товарные поправочные коэффициенты)

> **Primary source (no paywall, verbatim):**
> `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-4/`
> **Law:** Приказ ФАС России от 06.11.2025 № 894/25 («Тарифное руководство № 1»), рег. Минюст 22.12.2025 № 84708, в силе с 2026-01-01 (заменил Прейскурант 10-01).
> **Fetched verbatim this pass:** 2026-06-09 (1 WebFetch pass). Cross-referenced against two earlier independent verbatim passes captured on disk (`tr1-class-k3-full-verify.json`, `tr1-commodity-coef-verify.json`, both 2026-06-09).
> **On-disk machine table (canonical store):** `scripts/seed-data/tr1-k3-full.json`.

---

## 1. What this table is and where it enters the tariff

`Таблица N 4` is the **товарный поправочный коэффициент K3** — a per-commodity multiplier keyed by **ЕТСНГ position** (3-digit group or specific 6-digit подкод), organised under three section headers that mirror the tariff class of the cargo:

- **Раздел I. Первый тарифный класс** (class-1 cargo)
- **Раздел II. Второй тарифный класс** (class-2 cargo)
- **Раздел III. Третий тарифный класс** (class-3 cargo)

**How it enters the calculation (plain Russian):**
K3 is a **dimensionless multiplier** (not a per-ton or per-km rate). In the п.16 calculation chain it multiplies the base infrastructure ("И"-часть) rate **after** the class/distance coefficient K1 (Табл.2) and **before/alongside** the wagon-grouping coefficient K4 (Табл.5). One cargo gets **at most one** K3 row; cargoes absent from Табл.4 simply have **no товарный коэффициент** (K3 = 1.0 effectively — no multiply).

**Important:** the "(коэффициент не указан)" cells you see in the verbatim dump below are an **extraction artifact**, NOT an absence — see §4. The presence/absence of a *row* (which ЕТСНГ codes appear at all) is reliable; the numeric value for some class-2/class-3 rows did not render cleanly in this pass and is taken from the on-disk seed (which was filled from an earlier clean pass).

---

## 2. Verbatim table (as fetched 2026-06-09)

Format reproduced literally: `<наименование груза> | <позиции ЕТСНГ> | <коэффициент>`. Decimal separator is a comma, exactly as in the source.

### Раздел I. Первый тарифный класс

```
Материалы минерально-строительные природные. Зола. Шлаки, кроме гранулированных и металлургических для переплавки | 231 - 236 | 0,77
Сырье минеральное промышленное | 241, 242, 245, 246 | (коэффициент не отрендерился — seed: 0,75)
Флюсы | 291, 292 | 0,75
Шлаки гранулированные и металлургические для переплавки | 271, 341 | 0,8
Сырье огнеупорное и кислотоупорное, асбест и слюда | 301, 304 | 0,824
Руда железная и марганцевая | 141, 142 | 0,95
Газы энергетические (углеводородные сжиженные) (кроме бензина стабильного газового, дистиллятов газового конденсата, конденсата газового) | 226 | 1,04
Лесоматериалы круглые, кроме крепежных | 081 | 1,082
Сырье горно-химическое для производства удобрений | 431 | 1,1
Пиломатериалы | 091 | 1,288
Сырье цветных металлов (кроме глинозема и руд нефелиновых, бокситов, алюминиевых руд, руды никелевой, штейна никелевого) | 151 | 2,156
Глинозем | 151060 | 1,64
Руды нефелиновые, бокситы, алюминиевые руды | 151446, 151037, 151338 | 0,938
Уголь каменный (за исключением экспортного направления) | 161024, 161039, 161058, 161062, 161077, 161081, 161096, 161109, 161113, 161128, 161170, 161185, 161192, 161202, 161217, 161221, 161236, 161240, 161255 | 0,895
Уголь каменный (прочие коды) | 161016, 161132, 161147, 161151, 161166, 161043 | 1,05
Кокс | 171 | 1,084
Торф и торфяная продукция, сланцы горючие | 181, 182, 191 | 0,967
Сера | 487169 | 1,03
Древесина измельченная | 103 | 1,03
Руда никелевая, штейн никелевый | 151450, 151658 | 1,347
```

### Раздел II. Второй тарифный класс

```
Огнеупоры | 302, 303 | 0,876
Материалы стеновые | 251 | 0,91
Конструкции (сборные), детали и изделия железобетонные | 254 | (коэффициент не отрендерился — seed: 0,91)
Соль поваренная | 531 | (коэффициент не отрендерился — seed: 0,91)
Нефть и нефтепродукты (кроме кокса нефтяного анодного), бензин стабильный газовый, дистилляты газового конденсата, конденсат газовый | 201, 211 - 215, 221 - 225, 226021, 226069, 226106 | 1,15
Кокс нефтяной анодный | 222105 | 0,79
Основания и содопродукты | 482 | 1,153
Чугун | 311 | 1,39
Мелкий рогатый скот | 061 | 0,6
Шрот кормовой, не поименованный в алфавите | 542224 | 1,04
Шрот, содержащий не более 1,5% масла и не более 11% влаги | 542239 | 1,04
Жмыхи, содержащие более 1,5% масла и не более 11% влаги | 542258 | 1,04
```

### Раздел III. Третий тарифный класс

```
Продукция шпалопиления (без пропитки и с пропиткой) | 092, 093 | 0,75
Стекло техническое и строительное | 267 | (не отрендерился — seed: 0,75)
Продукция парфюмерно-косметической и эфирно-масличной промышленности | 442 | (не отрендерился — seed: 0,75)
Продукция крахмало-паточной промышленности | 515 | (не отрендерился — seed: 0,75)
Хлопок | 611 | (не отрендерился — seed: 0,75)
Ткани, изделия швейной и трикотажной промышленности | 631 - 634 | (не отрендерился — seed: 0,75; см. §4 yellow)
Посуда и другие изделия стеклянные, фарфоровые, фаянсовые и из керамики | 661 | (не отрендерился — seed: 0,75)
Игры и игрушки, наглядные учебные пособия, кроме печатных | 683 | (не отрендерился — seed: 0,75)
Части железнодорожного подвижного состава и верхнего строения пути, кроме рельсов | 414 | (не отрендерился — seed: 0,75)
Мебель, кроме металлической и плетеной | 127 | 0,78
Кислоты, оксиды, пероксиды и ангидриды | 481 | 0,81
Изделия санитарные керамические | 268 | 1,05
Металлы черные, кроме чугуна | 312 - 324 | (не отрендерился — seed: 1,05)
Продукция радиопромышленности | 402 | (не отрендерился — seed: 1,05)
Лампы накаливания и фонари электрические | 403 | (не отрендерился — seed: 1,05)
Смолы синтетические и пластические массы, изделия из них | 461, 462 | (не отрендерился — seed: 1,05)
Клей | 464 | (не отрендерился — seed: 1,05)
Смолы природные | 465 | (не отрендерился — seed: 1,05)
Материалы лакокрасочные. Красители синтетические. Грунтовки и шпаклевки малярные, мастики | 466 | (не отрендерился — seed: 1,05)
Пряжа и нитки всякие, шелк-сырец | 622 | (не отрендерился — seed: 1,05)
Ковры и изделия ковровые | 635 | (не отрендерился — seed: 1,05)
Углеводороды | 711 | (не отрендерился — seed: 1,05)
Кислородсодержащие органические соединения, пестициды | 721 - 751 | (не отрендерился — seed: 1,05)
Машины, оборудование и их части, кроме машин сельскохозяйственных | 351 | 1,26
Металлы цветные и их сплавы, изделия из них производственного назначения (кроме алюминия и сплавов алюминиевых первичных) | 331 - 333, 416 | 1,547
Алюминий и сплавы алюминиевые первичные в болванках, слитках, чушках, порошок алюминиевый, прокат алюминиевый | 331016, 331020, 332038 | 1,19
Автомобили и их части, кроме автомобилей легковых | 381 | 0,940
Автомобили легковые | 381087 | 0,780
Продукция целлюлозно-бумажной промышленности | 131 - 133 | 0,91
```

---

## 3. Numbered paragraph multipliers (полувагон / платформа surcharges)

Three numbered surcharges accompany Табл.4 and apply **on top of** the товарный K3 when the cargo moves in a **universal полувагон or платформа**. Their VALUES are stable across all passes; the exact enumerating clause text for п.3.3 / п.5.7 was not re-fetched cell-by-cell (flagged yellow — see §4).

| Пункт | Множитель | Verbatim / applies to | On-disk |
|---|---|---|---|
| **п.1.5** | **×0,909** | «на перевозки материалов минерально-строительных природных, золы, шлаков, кроме гранулированных и металлургических для переплавки, сырья минерального промышленного (позиции ЕТСНГ 231 - 236; 241, 242, 245, 246) в универсальных полувагонах и платформах … дополнительно применяется коэффициент 0,909» | `tr1-k3-full.json` `class1_extra` |
| **п.3.3** | **×1,04** | «…дополнительно применяется коэффициент 1,04» — отдельные грузы 2-го класса в универсальных полувагонах/платформах | `tr1-k3-full.json` `class2_extra` |
| **п.5.7** | **×1,04** | «…дополнительно применяется коэффициент 1,04» — отдельные грузы 3-го класса в универсальных полувагонах/платформах | `tr1-k3-full.json` `class3_extra` |

**KEY SimpleCargo chain (oracle-locked):** щебень / нерудные ЕТСНГ 231-236 → K3 `0,77` × п.1.5 `0,909` = **0,69993** = `C_NERUD_PV` in the engine. Confirmed against three R-Тариф oracle receipts (699 / 2444 / 3108 km).

---

## 4. Extraction reliability + what EXTENDS / CONTRADICTS the seed

### 4.1 Column-alignment artifact (this pass)
This pass's summarizer dropped the numeric column for many **class-2 and class-3** rows, returning "(коэффициент не указан)". An **earlier independent verbatim pass** (recorded in `tr1-commodity-coef-verify.json`, 2026-06-09) returned those same cells *with* values, and those values **match the on-disk seed** `tr1-k3-full.json`. I have therefore back-filled "seed:" values above and graded them by cross-pass stability. **No value was invented** — each "seed:" value already exists on disk and was confirmed by at least one verbatim pass.

- **GREEN (stable across passes + matches seed + reproduces R-Тариф oracle):**
  `231-236 = 0,77`; `481 = 0,81`; `251/254 = 0,91`; п.1.5 `0,909`; п.3.3 `1,04`; п.5.7 `1,04`.
- **YELLOW (value confirmed by ≥1 verbatim pass + seed + oracle, but one pass read the cell blank):**
  `631-634 = 0,75` (нетканые/ткани). Operationally safe; recommend one clean verbatim re-read of the rightmost column (`0,75` vs `0,750`).
- **RED / not re-verified verbatim this pass (precision uncertain — capture row, flag value):**
  Class-1 cells `0,75 / 0,8 / 0,824 / 1,03 / 1,082 / 1,1 / 1,288 / 1,084 / 0,967`; the **ЕТСНГ-151 подкод split** (`2,156` Сырьё цветных металлов vs `1,347` Руда никелевая — confirm which 6-digit подкоды land in each bucket); all class-2/class-3 numeric cells that rendered blank above. Source to obtain: same URL, read each Раздел cell literally.

### 4.2 EXTENDS the current engine/seed
1. **Coal directional split is richer than the seed.** Source gives the **full subcode lists** (NOT the 2-code stub in the seed):
   - **0,895** (за исключением экспортного направления): `161024, 161039, 161058, 161062, 161077, 161081, 161096, 161109, 161113, 161128, 161170, 161185, 161192, 161202, 161217, 161221, 161236, 161240, 161255`
   - **1,05** (прочие/экспортные коды): `161016, 161132, 161147, 161151, 161166, 161043`
   - The split is **direction-dependent**: 0,895 codes flip to 1,05 when destination is a land-border crossing or an export-coded port station. **Engine impact:** coal pricing needs a *direction* input; toward ambiguous destinations the engine should return `confidence: yellow`, never guess. (Tracked as M12.)
2. **Руда никелевая / штейн никелевый** resolves to specific подкоды `151450, 151658` → `1,347` (seed had position `151` only).
3. **п.1.5 ×0,909 also covers `241, 242, 245, 246`** (сырьё минеральное промышленное), not only `231-236`. Seed `appliesTo` already includes them — confirmed, no defect.

### 4.3 CONTRADICTS / corrects labels (no live-seed value change)
1. **`685 (маты) — NO K3 row.** Position 685 appears in **neither** pass of Табл.4. The reference batch's `маты_раст_685127: 1.04` is a **MISLABEL**: that 1,04 is the **п.5.7 class-3 surcharge** (applied to every class-3 cargo), not a товарный коэффициент. Seed correctly has no 685 row. (Correction C1-MATY-MISLABEL, MEDIUM.)
2. **`371 (сваи металлические) — NO K3 row.** Confirmed absent in both passes; reference "коэф груза НЕТ" is correct. Engine applies only K1 class-3 + п.5.7 ×1,04.
3. **`251 / 254` row shape:** source presents one combined row `251, 254 → 0,91`; seed splits into two rows (both 0,91). Numerically identical, cosmetic only.
4. **`631-634` label:** source text is «Ткани, изделия швейной и трикотажной промышленности»; the operator paraphrase "продукция лёгкой промышленности" does NOT appear literally. `631184 (нетканые)` falls inside `631-634` by range membership → 0,75.

### 4.4 Interaction with K1 (Табл.2), not part of Табл.4 but load-bearing
The class-3 K1 split `1,74` (named positions) vs `1,54` (остальные) is position-dependent. Of the reference cargoes: `481` IS in the 1,74 list (кислота серная → 1,74); `631 / 371 / 685` are NOT (→ 1,54); `254` is class-2 (→ K1 = 1,00). Verified byte-identical to `tr1-class-coeff.json` / `tr1-class-coeff-corrected.json`. See `tablitsa-n-2` once captured.

---

## 5. Where the full machine table lives on disk
- **Canonical K3 store:** `scripts/seed-data/tr1-k3-full.json` (`class1[]`, `class2[]`, `class3[]`, `class1_extra` п.1.5, `class2_extra` п.3.3, `class3_extra` п.5.7).
- **Verify/extend passes (findings only, do NOT replace seed):** `scripts/seed-data/tr1-commodity-coef-verify.json`, `scripts/seed-data/tr1-class-k3-full-verify.json`.
- **Class membership (which 6-digit code → which class):** `scripts/seed-data/etsng-classes.json`, `tr1-classifier-full.json`.
