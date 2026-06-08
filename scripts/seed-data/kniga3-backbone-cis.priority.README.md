# kniga3-backbone-cis.priority.json — verified ТП↔ТП tariff-distance oracle (CIS priority)

This file holds **only verbatim, source-pinned** ТП↔ТП tariff distances for CIS railway
administrations — never a Dijkstra/section-sum derivation. Each row is the official
station-to-station tariff distance read directly from the authority's own published table.
It is a companion to (and does **not** modify) `kniga3-backbone-cis.json` (the section-graph
substitute used where no official matrix exists).

Row shape: `{a, b, km, aEsr, bEsr, admin, source, confidence}` with `aEsr < bEsr` (numeric).

---

## Belarus (БЧ) — FULL official ТП↔ТП oracle FOUND (29,696 rows)

### What this is
A complete, symmetric station-to-station tariff-distance **matrix** for the Belarusian Railway,
extracted verbatim from the **official БЧ source**:

> **«Положение об определении тарифных расстояний при перевозках грузов по Белорусской
> железной дороге» → ТАБЛИЦА ТАРИФНЫХ РАССТОЯНИЙ, действующих с 01.08.2010.**
> rw.by, `polozheni_ob_opredelenii_tarifnih_rasstoyaniy.pdf`, 75 pp, official, **free**.

- **29,696 unique ТП↔ТП pairs**, **245 distinct stations**, km range 3–838.
- `confidence: sourced-official` for every row.
- ЕСР codes are taken from the table's own axis codes (Тарифное руководство №4 numbering),
  both axes carry ЕСР, so `aEsr/bEsr` are authoritative, not inferred.

### IMPORTANT — this REFUTES the prior "no free matrix" finding
The earlier research finding (`cis-belarus`) claimed the published Книга-3 БЧ ТП↔ТП matrix is
"NOT obtainable for free anywhere" and that the rw.by Положение PDF is "methodology only —
NO distance table inside". **Both claims are false.** The very PDF that finding cites contains,
from page 4 onward, a complete ТП↔ТП distance matrix with ЕСР codes on both axes (the
adversarial verdict on that finding was correct). This file is that matrix, extracted.

### Extraction method (reproducible)
The matrix is laid out as **18 destination column-groups** (13 + 14×16 + 8 = 235 dest columns),
each repeated across **4 origin-range page-sets**, i.e. ~245 origins × ~235 destinations.
- pdftotext `-layout` is NOT reliable here: only the first column-group (Аульс…Бигосово) has the
  origin ЕСР on every data row; groups 2+ print the origin **name only** (no per-row ЕСР), and
  whitespace columns drift between page-sets, so naive whitespace counting mis-aligns cells
  (off-by-one column errors — e.g. a sed read gave Бобруйск→Берестовица 515 when the true
  value is 405; the next column, Бигосово, is 515).
- The correct method is **coordinate-based** (`pdfplumber`): cluster words into rows by y, take
  the per-page header row's ЕСР x-centers as columns, build a canonical
  origin-name → origin-ЕСР map from group-1 (where both appear), then on every page snap each
  numeric cell to its nearest column x-center (tolerance ≤16 pt) and resolve the origin by name.

### Why the data is trustworthy (integrity proofs)
- **0 symmetric conflicts** across all 4,359 extracted data rows: every A→B value equals the
  independently-extracted B→A value (read from a different physical page). A misaligned column
  would shatter symmetry; perfect symmetry is strong evidence the column-snapping is correct.
- Diagonal cells = 0 (genuine matrix).
- All exported spot-checks reproduce the adversarial verdict's hand-read values:
  Бобруйск↔Бобр = 289, Брест-Восточный↔Брест-Северный = 5, Борисов↔Бобр = 52,
  Аульс↔Барановичи-Полесские = 212, Брест-Центральный↔Брест-Северный = 8.
- `0`-km cells (expired / no-current-route placeholders, e.g. most Белынковичи-экс. and
  Брест-*-экс. columns) are **dropped** — never priced.

### Border-crossing (экспортные) ТП present in the matrix (20)
Distances to these are baked into the БЧ table **incl. the leg to the State border** (per п.9 of
the Положение). RF↔БЧ and other crossings captured:

| ЕСР | Station | Crossing |
|-----|---------|----------|
| 169100 | Осиновка-экс. | RF (Смоленск дир.) |
| 165805 | Заольша-экс. | RF |
| 161005 | Езерище-экс. | RF |
| 150805 | Тереховка-экс. | RF |
| 151003 | Терюха-экс. | RF |
| 150405 | Закопытье-экс. | RF |
| 134807 | Брузги-экс. | Lithuania |
| 135706 | Свислочь-экс. | Poland |
| 136605 | Беняконе-экс. | Lithuania |
| 164107 | Гудогай-экс. | Lithuania |
| 130505 | Брест-Северный-экс. | Poland |
| 130609 | Брест-Центральный-экс. | Poland |
| 131809 | Высоко-Литовск-экс. | Poland |
| 132106 | Хотислав-экс. | Ukraine/Poland |
| 161401 | Бигосово-экс. | Latvia |
| 151200 | Словечно-экс. | Ukraine |
| 138808 | Горынь-экс. | Ukraine |
| 159306 | Белынковичи-экс. | RF/Ukraine |
| 158604 | Шестеровка-экс. | — |
| 153901 | Пхов-экс. | — |

(4,499 rows in this file touch an экспортный ТП.)

---

## Per-administration segmentation rule (SOURCED-OFFICIAL, БЧ Положение, verbatim)

For routes that leave/enter БЧ, distance is segmented at the State border, **min 50 km per leg**:

> «…за расстояние от станции отправления до выходной пограничной станции, включая расстояние
> до Государственной границы, при отправлении грузов за пределы Республики Беларусь, но не
> менее 50 км; — за расстояние от пограничной станции Белорусской железной дороги, включая
> расстояние от Государственной границы, до станции назначения — при прибытии грузов из-за
> пределов Республики Беларусь, но не менее 50 км».

General БЧ rule (для маршрутов без прямой табличной величины):

> «Фактическое расстояние определяется путем суммирования кратчайших расстояний между
> станциями в соответствии с маршрутом следования…» (план формирования поездов).

**Distinct tariff regime — keep separate:** pure transit *through* Belarus is priced under
**МТТ + Тарифная политика СНГ** (п.11 of the Положение), NOT the domestic БЧ table here.

---

## Kazakhstan (КТЖ / КЗХ) — NO free official ТП↔ТП matrix → VOID (0 rows here)

Re-verified: a free, machine-readable Kazakhstan ТП↔ТП matrix **does not exist**.
- `tr4.info/tp/rw/68` returns verbatim «Для этой дороги транзитные пункты не найдены».
- Placeholder station pages (e.g. `/tp/684001` Костанай, `/tp/700007` Алматы 1) render an
  **empty `<tbody>`** — confirming absence even where a page is served.
- The official distance authority **ТР-4 Книга 1** (`docs.cntd.ru/document/901949506`) is
  **paywalled** (302 → `auth.kodeks.ru` SSO).
- The КТЖ Прейскурант (`ktzh-gp.kz`, parts 1–3) is **pricing rules only**, not a distance table.
- No verbatim КЗХ ТП↔ТП value could be pinned ⇒ **no Kazakhstan rows are written to this file**
  (per the "never Dijkstra-derive" rule).

**Free fallback for KZ remains `kniga3-backbone-cis.json`** (97 КЗХ section/участок edges from
tr4.info, `sourced-unofficial`), with ТП↔ТП distances recovered by section-leg summation —
explicitly NOT money-exact and unvalidated against any KZ квитанция.

**Official KZ acquisition path** (paid): ТР-4 Книга 1 «Тарифные расстояния между станциями на
участках» via a kodeks/cntd.ru subscription, or the ЕТТ Раздел V «Таблицы транзитных
расстояний» on ГАРАНТ (`base.garant.ru`, demo-gated). Both are licensed/paywalled.

---

## Cautions / residual risk
- **Vintage:** the БЧ table is dated **01.08.2010**. Section topology is structurally stable, but
  long-run plan-формирования changes since 2010 mean a few legs may be stale — spot-verify
  against a fresh БЧ capture before a production КП.
- The matrix is the БЧ **domestic** tariff distance; cross-border transit uses МТТ/СНГ (above).
- Values reflect the «кратчайшее расстояние в соответствии с планом формирования поездов», not
  a naive geodesic — on multi-routing stations the official table is authoritative over any graph.
- This file is **sourced-official** and may be priced as a money-exact БЧ-leg distance, subject to
  the 2010 vintage caveat. KZ is sourced-unofficial elsewhere and must NOT be priced money-exact.

## Source
- https://www.rw.by/uploads/userfiles/files/docs/polozheni_ob_opredelenii_tarifnih_rasstoyaniy.pdf
  — OFFICIAL БЧ Положение incl. the full ТАБЛИЦА ТАРИФНЫХ РАССТОЯНИЙ (01.08.2010). FREE.
