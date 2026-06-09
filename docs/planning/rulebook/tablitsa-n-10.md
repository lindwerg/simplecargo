# Таблица N 10 — Тарифные схемы для контейнерных отправок (выбор схемы + коэффициенты гружёный/порожний)

> Status: VERBATIM-fetched rulebook chunk. Date: 2026-06-09.
> **Regulation:** Приказ ФАС России от 06.11.2025 N 894/25 (с изм. от 13.02.2026), «Тарифное руководство N 1», рег. Минюст 22.12.2025 N 84708, в силе с 2026-01-01.
> **Location in act:** Приложение N 1 → Таблица N 10.
> **Source (verbatim, no paywall):** `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-10/`
> **Fetch method:** `curl` of the public sudact page (HTTP 200, 80 612 bytes) → HTML table parsed cell-by-cell on 2026-06-09. Each cell below is reproduced as rendered; no number paraphrased or invented.
> **Companion chunks:** rate plates (A+B) for the schemes named here live in [`scripts/seed-data/tr1-i-belts-container.json`](../../../scripts/seed-data/tr1-i-belts-container.json) (sourced from Таблица N 24).

---

## 1. Verbatim title

> «**Таблица N 10.** Тарифные схемы, применяемые при расчете тарифа на перевозку по инфраструктуре РЖД контейнерной отправкой грузов в контейнерах общего парка и собственных (арендованных) контейнерах в соответствии с подпунктом 23.2 пункта 23 Тарифного руководства»

---

## 2. Verbatim header structure (column hierarchy)

The header is a 3-level merged grid. Reproduced verbatim from the rendered cells:

> Column group 1 — «**Максимальная масса брутто, т (для среднетоннажных)/Типоразмер контейнера (длина), футы (для крупнотоннажных)**»
>
> Column group 2 — «**Номера тарифных схем**», split into:
> - «**все грузы, кроме грузов позиции ЕТСНГ 691**», split into:
>   - «**контейнеры общего парка**»
>   - «**контейнеры собственные (арендованные)**»
> - «**грузы для личных, семейных, домашних и иных нужд, не связанных с осуществлением предпринимательской деятельности (позиция ЕТСНГ 691)**»
>
> Column group 3 — «**Коэффициенты к ставкам тарифных схем**», split into:
> - «**для груженых контейнеров, в том числе в зависимости от массы погруженного груза**», split into:
>   - «**масса груза, т**»
>   - «**коэффициент**»
> - «**для порожних контейнеров**» → «**коэффициент**»

So effective columns (left→right):
`[Размер/типоразмер] | [Схема: общий парк] | [Схема: собств.(аренд.)] | [Схема: ЕТСНГ 691] | [гружёный: масса груза, т] | [гружёный: коэффициент] | [порожний: коэффициент]`

---

## 3. Verbatim data rows

Reproduced exactly as rendered (`-` = прочерк / нет значения; `;` retained where the source uses it):

### Контейнеры среднетоннажные

| Макс. масса брутто, т | Схема общий парк | Схема собств.(аренд.) | Схема ЕТСНГ 691 | Гружёный: масса груза, т | Гружёный: коэф. | Порожний: коэф. |
|---|---|---|---|---|---|---|
| 3 | 85 | 90 | 95 | - | - | - |
| 5 | 86 | 91 | 96 | - | - | - |

### Контейнеры крупнотоннажные

| Типоразмер (длина), футы | Схема общий парк | Схема собств.(аренд.) | Схема ЕТСНГ 691 | Гружёный: масса груза, т | Гружёный: коэф. | Порожний: коэф. |
|---|---|---|---|---|---|---|
| 10 | 87 | 92 | 97 | от 10 по 24 включительно; | 1,6 | - |
|  |  |  |  | свыше 24 | 2,0 | - |
| свыше 10 по 20 включительно | 88 | 93 | 98 | свыше 24 по 28 включительно; | 1,28 | - |
|  |  |  |  | свыше 28 | 1,5 | - |
| свыше 20 по 30 футов включительно | 88 | 93 | 98 | независимо от загрузки | 1,5 | 1,5 |
| свыше 30 по 40 футов включительно | 89 | 94 | 99 | свыше 28 | 1,2 | - |
| свыше 40 | 89 | 94 | 99 | независимо от загрузки | 1,2 | 1,2 |

**Verbatim note on the «10» row label:** in the среднетоннажные block the left column carries «Максимальная масса брутто, т» (values 3, 5); in the крупнотоннажные block it carries «Типоразмер контейнера (длина), футы». The первая крупнотоннажная row is labelled simply «10» (per the source) — read in context with the column-group header as the 10-футовый/10-тонный typorazmer; subsequent rows are «свыше 10 по 20 включительно», «свыше 20 по 30 футов включительно», «свыше 30 по 40 футов включительно», «свыше 40».

**Verbatim note on the «-» cells:** for среднетоннажные (3, 5) all three coefficient columns are «-» (no per-mass gružёnyj coefficient and no separate порожний coefficient given in this table). For крупнотоннажные, the порожний «коэффициент» column is populated ONLY for the two «независимо от загрузки» rows (1,5 for 20–30 ft; 1,2 for >40); the four mass-banded gružёnye rows have порожний = «-».

---

## 4. How this enters the tariff calculation (plain Russian)

Таблица N 10 is a **classifier + multiplier table**, not a rate table. It plugs into the общий порядок (Приложение N1, Раздел II, п.16) at **two distinct points**:

1. **Шаг 16.4 «Определяется номер тарифной схемы».** For a контейнерная отправка (определена на 16.2), this table is the lookup that picks the **scheme number** from the triple:
   - **container type** → row: среднетоннажный (макс. масса брутто 3 или 5 т) vs крупнотоннажный (typoрazmer 10 / >10–20 / >20–30 / >30–40 / >40 футов);
   - **container ownership** → column: общий парк vs собственный (арендованный);
   - **cargo kind** → column: «все грузы кроме ЕТСНГ 691» (uses the ownership column) vs «грузы для личных/семейных/домашних нужд» = **позиция ЕТСНГ 691** (uses the dedicated schemes 95–99).
   The resulting scheme number (85–99) is then evaluated by its **base rate plate** `плата = A + B × KL` (руб./контейнер) — those A/B coefficients are NOT in Таблица N 10; they are in **Таблица N 24** / on-disk [`tr1-i-belts-container.json`](../../../scripts/seed-data/tr1-i-belts-container.json).

2. **Шаг 16.9 «последовательно методом умножения дополнительно применяются коэффициенты».** The «Коэффициенты к ставкам тарифных схем» columns are **multipliers applied to the scheme base rate**:
   - **гружёный контейнер:** select the коэффициент by the **mass band of the loaded cargo** (e.g. 20-футовый, масса >24 по 28 т → ×1,28; >28 т → ×1,5) OR by «независимо от загрузки» (20–30 ft → ×1,5; >40 ft → ×1,2). For среднетоннажных (3/5 т) there is **no** such multiplier in this table (column = «-»).
   - **порожний контейнер:** the порожний коэффициент (only ×1,5 for 20–30 ft, ×1,2 for >40 ft) is applied to the scheme rate for an **empty** container move; for all other rows the empty-container coefficient is «-» in this table.

   **Unit:** dimensionless multiplier applied to a руб./контейнер base. Rounding: per п.16.9 each sequential multiplication rounds **до целых копеек** (see [`TARIFF_RULES_EXACT.md`](../TARIFF_RULES_EXACT.md) §3, §6).

**Driving subpunkt:** the table title binds it to **подпункт 23.2 пункта 23** Тарифного руководства (контейнерные отправки в контейнерах общего парка и собственных/арендованных). п.23 is the section that should be read alongside this table for the exact wording of «масса погруженного груза» and the scheme-selection mechanics; not captured in this chunk.

---

## 5. What this EXTENDS / CONTRADICTS vs the current engine & seed

### EXTENDS (new, not previously on disk)

1. **Scheme-selection map (size+ownership+cargo → scheme №).** `tr1-i-belts-container.json` stores A/B plates keyed by `(containerSize, ownership, loadedState)` but its `containerSizeMap` only covers schemes **85–94** and is keyed loosely (`3т/5т/10т/20ft/40ft`). Таблица N 10 gives the **authoritative, exhaustive lookup** including:
   - the **собственный (арендованный)** column → schemes **90–94** (the seed `ownership:"собств./аренд."` plates) and
   - the **ЕТСНГ 691 «личные/семейные/домашние нужды»** column → schemes **95–99**, which are **NOT present in the seed at all** (seed covers 85–94 only). **schemes 95–99 are a new gap to close.**

2. **Gružёnye per-mass coefficients (the «Коэффициенты к ставкам» block).** The seed's `linearAB` plate is `A + B×KL` with **no mass multiplier baked in**. Таблица N 10 says крупнотоннажные plates must additionally be multiplied by a **mass-band коэффициент** (1,28 / 1,5 / 1,6 / 2,0 / 1,2 depending on typoрazmer × загрузка). The engine currently does **not** apply these. This is the contestable correction at шаг 16.9.

3. **Порожний-контейнер coefficient — directly closes a flagged RED gap.** The seed `_meta` flags:
   > «RED порожний-пробег: коэффициенты для перевозки ПОРОЖНИХ контейнеров отсутствуют в Табл.N24.»
   Таблица N 10 supplies (partially) the empty-container multipliers: **×1,5** (контейнер свыше 20 по 30 футов, независимо от загрузки) and **×1,2** (контейнер свыше 40, независимо от загрузки). All other container sizes show «-» for порожний in this table → still no published empty coefficient there (consistent with seed RED for those sizes). This table is the **source-of-record for the 20–30 ft and >40 ft empty cases.**

### POTENTIAL CONTRADICTION / RECONCILE

- **Size taxonomy mismatch.** Seed `containerSizeMap` maps `20ft → «свыше 10 до 30 фут включительно»` and `40ft → «свыше 30 до 40 фут»`. Таблица N 10 splits крупнотоннажные finer: «10», «свыше 10 по 20 включ.», «свыше 20 по 30 футов включ.», «свыше 30 по 40 футов включ.», «свыше 40» — and the SCHEME number changes across this finer grid (88 covers both «>10–20» and «>20–30»; 89 covers both «>30–40» and «>40»). The engine's coarse `20ft/40ft` keys must be reconciled against this 5-row grid before applying the mass multipliers, or the wrong коэффициент will be picked. **Action: align `tr1-i-belts-container.json` containerSizeMap to the exact Таблица N 10 row boundaries.**

- **«независимо от загрузки» vs mass-band.** For 20–30 ft (scheme 88) the gružёnyj coefficient is a flat ×1,5 «независимо от загрузки», whereas for 10 ft (scheme 87) and >40 ft it is mass-banded / flat per row. The engine must branch on row, not assume a uniform mass-band rule.

### NOT in this table (do NOT source from here)

- A/B base rate values (those are Таблица N 24 → seed). Таблица N 10 contains **zero rub-per-km values**.
- The **+5% 2026 container indexation** and any +1% (приказ ФАС 88/26) — parallel indexation measures, not part of N 10 (see seed `plus5_2026`).
- Термические/рефрижераторные контейнеры — separate Таблица N 14, out of scope here.
- Empty coefficients for среднетоннажных (3/5 т), 10 ft, «>10–20 ft», «>30–40 ft» — shown «-» in N 10; **unfetched/absent here**, must come from a dedicated порожний-пробег provision if it exists (flag preserved from seed RED).

---

## 6. Machine-ready extract of Таблица N 10 (для будущего seed-файла)

> Not fabricated — every field below is copied from §3. Provided so a future `tr1-container-scheme-map.json` can be materialized verbatim.

```json
{
  "_source": "Приказ ФАС РФ 06.11.2025 N 894/25, Прил.N1, Таблица N 10 (sudact verbatim 2026-06-09)",
  "rows": [
    {"segment":"среднетоннажный","sizeLabel":"3","schemeCommonPark":85,"schemeOwned":90,"schemeETSNG691":95,"loadedCoeffs":[],"emptyCoeff":null},
    {"segment":"среднетоннажный","sizeLabel":"5","schemeCommonPark":86,"schemeOwned":91,"schemeETSNG691":96,"loadedCoeffs":[],"emptyCoeff":null},
    {"segment":"крупнотоннажный","sizeLabel":"10","schemeCommonPark":87,"schemeOwned":92,"schemeETSNG691":97,"loadedCoeffs":[{"massBand":"от 10 по 24 включительно","coeff":1.6},{"massBand":"свыше 24","coeff":2.0}],"emptyCoeff":null},
    {"segment":"крупнотоннажный","sizeLabel":"свыше 10 по 20 включительно","schemeCommonPark":88,"schemeOwned":93,"schemeETSNG691":98,"loadedCoeffs":[{"massBand":"свыше 24 по 28 включительно","coeff":1.28},{"massBand":"свыше 28","coeff":1.5}],"emptyCoeff":null},
    {"segment":"крупнотоннажный","sizeLabel":"свыше 20 по 30 футов включительно","schemeCommonPark":88,"schemeOwned":93,"schemeETSNG691":98,"loadedCoeffs":[{"massBand":"независимо от загрузки","coeff":1.5}],"emptyCoeff":1.5},
    {"segment":"крупнотоннажный","sizeLabel":"свыше 30 по 40 футов включительно","schemeCommonPark":89,"schemeOwned":94,"schemeETSNG691":99,"loadedCoeffs":[{"massBand":"свыше 28","coeff":1.2}],"emptyCoeff":null},
    {"segment":"крупнотоннажный","sizeLabel":"свыше 40","schemeCommonPark":89,"schemeOwned":94,"schemeETSNG691":99,"loadedCoeffs":[{"massBand":"независимо от загрузки","coeff":1.2}],"emptyCoeff":1.2}
  ]
}
```

---

## 7. Residual NEEDS-VERIFICATION

- **п.23.2 wording** — read «подпункт 23.2 пункта 23» (Прил.N1, Раздел II) to confirm whether the gružёnyj coefficient applies before or after the порожний leg and whether «масса погруженного груза» = масса брутто or нетто. Source: `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/ii/`.
- **«10» row label** — first крупнотоннажная row reads «10» (футы/тонны typoрazmer); cross-check against п.23 to confirm it means 10-футовый крупнотоннажный (not 10-тонный среднетоннажный), given it sits under «Контейнеры крупнотоннажные».
- **Empty coefficient for sizes shown «-»** — N 10 gives empty multipliers only for 20–30 ft and >40 ft. Whether other sizes' empty moves use scheme base unmodified, or a separate порожний table, is unresolved (seed RED preserved).
