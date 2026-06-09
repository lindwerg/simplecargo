# Таблица N 9 — Тарифные схемы для специализированных изотермических вагонов (груз → схема И/В + схемы N30/N31)

> **Primary source (no paywall, verbatim):**
> `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-9/`
> **Law:** Приказ ФАС России от 06.11.2025 № 894/25 («Тарифное руководство № 1»), в силе с 2026-01-01 (заменил Прейскурант 10-01).
> **Fetched verbatim this pass:** 2026-06-09 (2 WebFetch passes — English-summary + raw cell-by-cell — agreed on structure and every cell).
> **On-disk material this RESOLVES:** `scripts/seed-data/tr1-scheme-classifier-extended.json` had Табл.N 9 explicitly flagged as `«конкретная привязка по типу — не извлечена полностью»` with a lumped `vScheme: "В6/В13"`. This rulebook supplies the exact per-wagon-type mapping.

---

## 1. What this table is and where it enters the tariff

`Таблица N 9` is the **груз/тип-вагона → номер тарифной схемы** lookup specifically for **специализированные изотермические вагоны** (рефрижераторы, вагоны-термосы, ИВ-термосы). It is the изотермический counterpart of Табл.N 6 (универсальные) and Табл.N 7 (прочие специализированные). It does **not** carry rates or coefficients — it only **selects which scheme number** feeds the rate lookup.

The table answers a 2-axis question:

1. **Тип изотермического вагона** (row): ГРПС/АРВ/АРВ-Э, ИВ-термос из рефрижератора, вагон-термос, ИВ-термос из крытого, прочие.
2. **Принадлежность вагона** (column block): **Вагоны общего парка** (RZD-owned → letter «И» scheme code) vs **собственные (арендованные)** (own/rented → letter «В» scheme code), plus the **numbered** schemes N30 / N31.

**How it enters the calculation (plain Russian):**

The output of this table is a **scheme number**, not a multiplier. It is the **first** step of the изотермический-вагон branch (per п.22.1–22.2 of Приложение N 1, Раздел II): you classify the wagon type, read the applicable scheme(s), and only then go to Приложение N 2 to pull the rate-belt (плата по поясам дальности) for that scheme. K1 (Табл.2), K3 (Табл.4) and K4 (Табл.5) are applied on top, downstream, exactly as for other schemes (схема N31 is in the K4 coverage list — see `tablitsa-n-5.md` §3).

The column structure encodes the TR-1 two-part charge logic:
- **Тариф на использование инфраструктуры РЖД и локомотивов РЖД** — the «И»-part (infrastructure + locomotive). For ГРПС/АРВ/АРВ-Э this is the numbered scheme **N30**; for the other rows it is the letter «И»-scheme (И3/И6/И7) when the wagon is общего парка.
- **Тариф на использование вагонов** — the «В»-part (wagon component, charged ONLY for общий-парк / RZD wagons). For ГРПС/АРВ/АРВ-Э this is **N31**; for the other rows it is the letter «В»-scheme (В6/В13).

For **собственные (арендованные)** wagons there is **no «В» (wagon) component** charged to RZD; the operator owns the wagon. The «И»/N30 infrastructure scheme still applies, and the empty return runs by scheme N26 (изотермические are explicitly in the N26 desc — see `tr1-empty-run.json` schemeMeta).

**Unit / step in SimpleCargo engine:** `(wagonType, ownership) → {iScheme, vScheme}`, executed at scheme-resolution time (before rate-belt lookup). No number from this table is itself a rate or coefficient.

---

## 2. Verbatim table (as fetched 2026-06-09)

The source page renders a table whose top-right column group **«Номера тарифных схем»** is split into two sub-columns: **«Тариф на использование инфраструктуры РЖД и локомотивов РЖД»** and **«Тариф на использование вагонов»**. The left two data columns under «Типы вагонов» carry the letter codes split by ownership («Вагоны Общего парка» = И-код, «Собственные (арендованные)» = В-код). The raw cell-by-cell pass reproduces it as below.

```
Таблица N 9

Тарифные схемы, применяемые при расчете тарифа на перевозку грузов по
инфраструктуре РЖД в специализированных изотермических вагонах

                                                      | Вагоны     | Собственные   | Номера тарифных схем
                                                      | Общего     | (арендованные)| ----------------------------------
Типы вагонов                                          | парка      |               | Тариф на        | Тариф на
                                                      | (И-код)    | (В-код)       | инфраструктуру  | использование
                                                      |            |               | РЖД и локомот.  | вагонов
------------------------------------------------------+------------+---------------+-----------------+--------------
Групповой рефрижераторный подвижной состав (ГРПС),    |            |               |       30        |     31
автономные рефрижераторные вагоны (АРВ), автономный   |            |               |                 |
рефрижераторный вагон с обслуживающей бригадой (АРВ-Э)|            |               |                 |
------------------------------------------------------+------------+---------------+-----------------+--------------
ИВ-термос, переоборудованный из рефрижераторного      |    И6      |     В13       |                 |     31
вагона                                                |            |               |                 |
------------------------------------------------------+------------+---------------+-----------------+--------------
Вагон-термос                                          |    И7      |     В13       |                 |     31
------------------------------------------------------+------------+---------------+-----------------+--------------
ИВ-термос, переоборудованный из крытого вагона        |    И3      |      В6       |                 |     31
------------------------------------------------------+------------+---------------+-----------------+--------------
Остальные типы специализированных изотермических      |    И7      |      В6       |                 |     31
вагонов                                               |            |               |                 |
```

**Machine-readable mapping (verbatim values, restructured — NOT new numbers):**

| Тип вагона | Общий парк (И-схема) | Собственный/арендованный (В-схема) | Схема инфраструктуры+локомотив | Схема за вагон |
|---|---|---|---|---|
| ГРПС, АРВ, АРВ-Э | — | — | **30** | **31** |
| ИВ-термос из рефрижераторного вагона | **И6** | **В13** | — | **31** |
| Вагон-термос | **И7** | **В13** | — | **31** |
| ИВ-термос из крытого вагона | **И3** | **В6** | — | **31** |
| Остальные типы специализированных изотермических вагонов | **И7** | **В6** | — | **31** |

**Data rows:** 5. **Distinct codes used:** И3, И6, И7 (общий парк); В6, В13 (собственный/арендованный); N30, N31 (numbered schemes, ГРПС/АРВ/АРВ-Э row).

**Примечание:** no separate «Примечание»/footnote block renders on the Табл.N 9 page in either fetch pass.

### 2.1 Cross-pass agreement (verbatim verification)

Both 2026-06-09 fetch passes agree on all 5 rows and every code cell:

| Source | Fetched | Status |
|---|---|---|
| cell-by-cell WebFetch (this pass) | 2026-06-09 | exact: 5 rows, И6/И7/И3, В13/В6, 30/31 |
| English-summary WebFetch (this pass) | 2026-06-09 | exact: same 5 rows, same codes, no footnote |

**No cell was unfetchable.** All scheme codes rendered cleanly in both passes. Confidence: **GREEN** on the type→scheme mapping (which codes apply to which wagon type).

**IMPORTANT distinction on confidence:** this rulebook certifies the **mapping** (тип → схема) verbatim. It does **NOT** certify the **rate-belt numbers** behind schemes N30/N31 — those live in Приложение N 2 and are **NOT seeded on disk** (see §4.2). The engine can now pick the right scheme but still cannot compute rubles for изотермические without the N30/N31 belts.

---

## 3. Application rule context — п.22.1 / п.22.2 (from on-disk cross-ref, NOT re-fetched this pass)

`tr1-scheme-classifier-extended.json` `_meta` records the governing application paragraphs (captured 2026-06-07, not re-confirmed live this pass):

> «п.22.2: изотермические/рефрижераторные — собственные по схеме N31; общий парк ГРРБС по схеме N30 / И-часть.»

This is consistent with Табл.N 9: собственные изотермические pay scheme N31 (the «за вагон»/единая изотермическая plata column shows N31 across all rows), and общий-парк ГРПС/АРВ pay N30 (инфраструктура) + N31 (вагон). The letter codes И3/И6/И7 + В6/В13 are the общий-парк per-type infrastructure/wagon split for the non-ГРПС изотермические types.

**Source to obtain verbatim п.22.1/22.2 text:** Приложение N 1, Раздел II, пп.22.1–22.2 on sudact (same base URL tree), read paragraph-literal. Not on the Табл.N 9 page itself.

---

## 4. EXTENDS / CONTRADICTS the current engine / seed

### 4.1 EXTENDS — resolves a previously-incomplete seed (no contradiction)
`scripts/seed-data/tr1-scheme-classifier-extended.json` carried изотермические as four `«Рефрижератор»` rows with:
- `vScheme: "В6/В13"` (lumped, undecided)
- note: `«Изотермический общего парка (ГРРБС) … И-часть по схеме N30 / И-схеме; вагонная В6 или В13. Конкретная привязка по типу — не извлечена полностью.»`

Табл.N 9 **resolves the lump** into the exact per-type split:
- **В13** ↔ ИВ-термос из рефрижератора **and** вагон-термос; общий-парк И-коды **И6** / **И7** respectively.
- **В6** ↔ ИВ-термос из крытого (И-код **И3**) **and** остальные изотермические (И-код **И7**).
- **N30 (инфра) + N31 (вагон)** ↔ ГРПС/АРВ/АРВ-Э only.

**Recommended seed update:** replace the single lumped `vScheme: "В6/В13"` rows with the 5 explicit rows above, keyed by изотермический wagon subtype and ownership. This is a data-completeness extension; it does not invalidate any committed number.

### 4.2 DOES NOT close the ruble gap — N30/N31 belts still missing (unchanged limitation)
`tr1-scheme-classifier-extended.json` already warns:

> «Rate-belts извлечены полностью ТОЛЬКО для N8, И1-И7, В1-В15. Для схем N9-13, N19-24, N30-31 … числовые пояса дальности НЕ seeded → расчёт рублей для этих вагонов сегодня невозможен без доскрейпа Приложения N2.»

Confirmed this pass: `tr1-rate-belts.json` contains belts for N8, И1–И7, В1–В15 only. **N30 and N31 rate-belts are NOT on disk.** Note that letter schemes **И3, И6, И7, В6, В13** referenced by Табл.N 9 **ARE** within the seeded И1–И7 / В1–В15 ranges — so the **общий-парк** изотермические (non-ГРПС) branch may already be computable. The **ГРПС/АРВ/АРВ-Э** branch (schemes N30+N31) is **NOT** computable until Приложение N 2 N30/N31 belts are scraped.

### 4.3 Empty-run consistency (no change)
For собственные изотермические, empty return = scheme **N26** (изотермические explicitly listed in `tr1-empty-run.json` schemeMeta `"26"` desc: `«… изотермические»`), with the порожний надбавка ×1,1 on top. Consistent with the earlier classifier note (`«Порожний изотермических → N26»`). No correction.

---

## 5. Unfetchable / source-to-obtain
- **N30 / N31 numeric rate-belts (Приложение N 2):** NOT on disk and NOT fetched this pass. Required to compute rubles for ГРПС/АРВ/АРВ-Э (and to fully verify the N31 «за вагон» column for собственные). Source to obtain: Приложение N 2, схемы N30 и N31 on sudact (`…/prilozhenie-n-2/…`), read belt-by-belt verbatim.
- **Verbatim п.22.1 / п.22.2 text:** taken from on-disk classifier `_meta` (2026-06-07), NOT re-confirmed live. Source: Приложение N 1, Раздел II, пп.22.1–22.2.

---

## 6. Where the machine material lives on disk
- **Scheme classifier (to be extended with the §4.1 split):** `scripts/seed-data/tr1-scheme-classifier-extended.json` (`«Рефрижератор»` rows) and the leaner `tr1-scheme-classifier.json` (`спец-общий-парк` И2..И7 / В5..В14 row).
- **Seeded rate-belts (И3/И6/И7, В6/В13 covered; N30/N31 NOT):** `scripts/seed-data/tr1-rate-belts.json`.
- **Empty-run schemes (изотермические → N26):** `scripts/seed-data/tr1-empty-run.json`, `tr1-empty-run-full.json`.
- **Downstream coefficients applied after scheme selection:** `tr1-k1-full.json` (K1), `tr1-k3-full.json` (K3), `tr1-k4-corrected.json` (K4 — схема N31 is in its coverage list, see `tablitsa-n-5.md` §3), `tr1-coefficients.json` (порожний ×1,1 надбавка).
- **Sibling rulebook chunks:** `tablitsa-n-5.md` (K4), and Табл.N 6/N 7 (универсальные / прочие спец.) if/when captured.
