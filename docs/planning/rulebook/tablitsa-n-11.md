# Таблица N 11 — Тарифные схемы для контрейлерных перевозок

> **Primary source (no paywall, verbatim):**
> `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-11/`
> **Law:** Приказ ФАС России от 06.11.2025 N 894/25 (с изм. от 13.02.2026) «Об утверждении Порядка расчета тарифов … (Тарифное руководство N 1)», зарегистрировано в Минюсте России 22.12.2025 N 84708. В силе с 2026-01-01 (заменил Прейскурант 10-01).
> **Official table title (from breadcrumb + heading, verbatim):** «Таблица N 11. Тарифные схемы, применяемые при расчете тарифа на контрейлерные перевозки по инфраструктуре РЖД». Path: Приложение N 1 → Таблица N 11.
> **Fetched verbatim this pass:** 2026-06-09 via `curl` of the raw sudact HTML (74 790 bytes), parsed `<table>` row-by-row. WebFetch helper-model passes were unreliable here (one partial copyright refusal, one returned a German-mangled header), so the authoritative capture below is the **raw-HTML parse**, not the WebFetch summaries.
> **On-disk machine table (canonical store):** NONE. These schemes are **not seeded** — see §4.

---

## 1. What this table is and where it enters the tariff

`Таблица N 11` is a **scheme-selector lookup**, not a coefficient table and not a rate (belt) table. Its only output is a **номер тарифной схемы** (`93` or `94`) — the И-схема identifier that then drives the rate-belt lookup elsewhere in ТР-1.

It applies **only to контрейлерные перевозки** (piggyback / Ro-La transport: a road vehicle — прицеп, полуприцеп, съёмный кузов, автопоезд — carried on a railway wagon). The selector key is **the type and length of the road vehicle**; ownership of the wagon (общего парка vs собственный/арендованный) and load state (груженый vs порожний) are present as columns **but do not change the scheme number** — every cell in a given row is the same number.

**How it enters the calculation (plain Russian):**
1. Определяется, что перевозка — контрейлерная (на платформе/вагоне везут автотранспортное средство).
2. По **типу и длине ТС** выбирается строка → получается **номер схемы**: `93` для коротких прицепов/съёмных кузовов (до 7,8 м включительно), `94` для полуприцепов (любой длины), длинных прицепов/кузовов (свыше 7,8 м) и автопоездов.
3. Этот номер схемы — это И-схема. Дальше плата считается по обычной механике ТР-1 для соответствующей И-схемы (свой пояс-граф ставок по расстоянию), затем применяются повагонные/маршрутные коэффициенты и т.д., как для любой грузовой схемы.

**Unit / step in SimpleCargo engine:** this is a **scheme-classifier row** (`iScheme = "93" | "94"`), upstream of the rate-belt and coefficient steps. The scheme number itself is dimensionless (an identifier). It would slot into the same place as the `iScheme` field in `tr1-scheme-classifier-extended.json` — but keyed by a **road-vehicle dimension** that the current classifier has no concept of.

---

## 2. Verbatim table (raw Russian HTML parse, fetched 2026-06-09)

Reproduced literally from the parsed `<table>` cells. The header is a two-level merged header (груженое/порожнее × общий парк/собственный). Reproduced here as the source renders it.

```
Таблица N 11
Тарифные схемы, применяемые при расчете тарифа на контрейлерные перевозки
по инфраструктуре РЖД

Тип транспортного средства, длина, м        | Номер тарифной схемы
                                             | в груженом состоянии              | в порожнем состоянии
                                             | вагон общего | вагон собственный  | вагон общего | вагон собственный
                                             | парка        | (арендованный)     | парка        | (арендованный)
---------------------------------------------+--------------+--------------------+--------------+-------------------
Прицеп и съемный автомобильный кузов         |      93      |        93          |      93      |        93
длиной до 7,8 м включительно                 |              |                    |              |
---------------------------------------------+--------------+--------------------+--------------+-------------------
Полуприцеп вне зависимости от размера;        |      94      |        94          |      94      |        94
прицеп и съемный автомобильный кузов          |              |                    |              |
длиной свыше 7,8 м                            |              |                    |              |
---------------------------------------------+--------------+--------------------+--------------+-------------------
Автопоезд                                     |      94      |        94          |      94      |        94
```

**Raw parsed cells (exact, before reflow):**

| Тип транспортного средства, длина, м | груж. — общий парк | груж. — собственный (аренд.) | порож. — общий парк | порож. — собственный (аренд.) |
|---|:---:|:---:|:---:|:---:|
| Прицеп и съемный автомобильный кузов длиной до 7,8 м включительно | 93 | 93 | 93 | 93 |
| Полуприцеп вне зависимости от размера; прицеп и съемный автомобильный кузов длиной свыше 7,8 м | 94 | 94 | 94 | 94 |
| Автопоезд | 94 | 94 | 94 | 94 |

Header column group (verbatim cell text): `Тип транспортного средства, длина, м` · `Номер тарифной схемы` → `в груженом состоянии` / `в порожнем состоянии`, each split into `вагон общего парка` / `вагон собственный (арендованный)`.

**Примечание:** there is **no «Примечание»/footnote block on the Табл.11 page** — `Примечание` count in the fetched HTML is **0**. The application rules that say *when* a перевозка is контрейлерная and how schemes 93/94 then map to ставки are **not on this page**; they live in the application text of Приложение N 1 / N 2 (not captured in this pass — see §5).

### 2.1 Fetch verification

| Source | Fetched | Status |
|---|---|---|
| raw-HTML `<table>` parse (this pass) | 2026-06-09 | **authoritative** — exact cells, all 3 rows × 4 value columns |
| WebFetch raw-Russian pass | 2026-06-09 | partial copyright refusal; gave correct *structure* (schemes 93/94, vehicle types) but declined full reproduction |
| WebFetch structured pass | 2026-06-09 | gave 93/94 values but with a **mangled German header** and a wrongly-split row set → **discarded**, raw HTML used instead |

**All 12 value cells rendered cleanly** in the raw-HTML parse (3 rows × 4 ownership/load columns), every cell `93` or `94`. No cell unfetchable. Confidence: **GREEN** on the table values; the only thing not verified live this pass is the *application/eligibility text* (§5).

---

## 3. Decision logic distilled (derived from the verbatim cells only)

```
ЕСЛИ перевозка контрейлерная:
    ЕСЛИ ТС = «прицеп» ИЛИ «съёмный автомобильный кузов», длина ≤ 7,8 м  → схема 93
    ИНАЧЕ (полуприцеп любой длины;
           прицеп/съёмный кузов длиной > 7,8 м;
           автопоезд)                                                    → схема 94
    # номер схемы НЕ зависит от: собственности вагона (общий/собственный)
    #                            и от состояния (гружёный/порожний)
```

- **Граница длины:** `7,8 м` — `включительно` относится к схеме 93 (до 7,8 м включительно). Полуприцеп → всегда 94 «вне зависимости от размера».
- **Автопоезд** → всегда 94.

---

## 4. EXTENDS / CONTRADICTS the current engine / seed

### 4.1 EXTENDS — контрейлерные схемы 93/94 are entirely UNMODELED (NOT a defect, a gap)
The SimpleCargo engine has **no concept of контрейлерные перевозки** and **no schemes 93/94** anywhere:
- `grep` for `контрейлер` across all of `scripts/seed-data/` matches **nothing** in any tariff seed (the only `093/094` hits are unrelated **ЭТСНГ codes** like `093005`, `094012` in `etsng-classes.json`, not tariff schemes).
- No `iScheme` / `vScheme` / `emptyScheme` field in `tr1-scheme-classifier-extended.json` (84 rows) or `tr1-scheme-classifier.json` (11 rows) is ever `93` or `94`. The `93/94` substrings found in those files are **URL fragments** (`…n-89425/prilozhenie-`) and coefficient digits, not schemes.
- The scheme classifier is keyed by **railway wagon type** (полувагон, цистерна, платформа фитинговая, …) + ownership + shipment. It has **no road-vehicle dimension** (прицеп / полуприцеп / съёмный кузов / автопоезд / length 7,8 м). Табл.11 introduces exactly that dimension. To model it, the classifier needs a new branch keyed by **road-vehicle type & length**, emitting `iScheme = "93" | "94"`.

### 4.2 Existing seed already FLAGS this gap (consistent — no contradiction)
`tr1-scheme-classifier-extended.json` carries an explicit low-confidence note:

> «… Конкретные контейнерные схемы (порядка N90-94 собств.) НЕ сверены и НЕ seeded → расчёт рублей невозможен сегодня.» (`"confidence": "low"`)

This rulebook **partly corrects the label**: schemes **93 and 94 are контрейлерные (piggyback/Ro-La), NOT контейнерные (container)** per the verbatim Табл.11 title. The seed lumped the whole N90-94 band as «контейнерные собств.»; Табл.11 shows the 93/94 tail of that band is specifically the **контрейлерный** selector. The «НЕ seeded → расчёт рублей невозможен» status is accurate and unchanged: even with the scheme number known, the **rate belts for schemes 93/94 are still not on disk**, so ruble amounts cannot be computed today.

### 4.3 What this table does NOT give (so it does not close ruble calc by itself)
Табл.11 yields only the **scheme number**. It carries **no rates, no belts, no coefficients**. To produce a ruble amount for a контрейлерная перевозка you still need the **rate-belt table for schemes 93/94** (the И-ставки by distance), which is a *different* page/appendix and is **not captured anywhere on disk** (`tr1-i-belts-*.json`, `tr1-rate-belts.json`, `tr1-n8-corrected.json` contain no 93/94 belts — verified absent in §1 grep). Do **not** infer 93/94 rates from any existing schedule.

### 4.4 No contradiction with any seeded value
Because nothing in the engine references schemes 93/94, there is **no numeric conflict to reconcile**. This is purely additive scope.

---

## 5. Unfetchable / source-to-obtain
- **Eligibility & application text for контрейлерные перевозки** (when a shipment is классифицируется as контрейлерная; how schemes 93/94 feed the ставочная механика; any min-weight / коэффициент specifics): **NOT on the Табл.11 page** (no Примечание, no body rules). Source to obtain: the application paragraphs of Приложение N 1 (Раздел on спецперевозки/контрейлерные) and possibly Приложение N 2 on the same sudact tree — read paragraph-literal. NOT fetched this pass.
- **Rate-belt schedule for schemes 93/94 (И-ставки по поясам дальности):** required for ruble computation, **not present on disk and not on this page**. Source to obtain: the И-схемы ставочные таблицы of ТР-1 (the rate-belt appendix) on sudact, schemes 93 & 94 specifically. Until captured, контрейлерный ruble calc is **impossible** (consistent with the existing seed flag in §4.2).

---

## 6. Where it should live on disk (currently nowhere)
- **No canonical store exists.** When seeded, the **scheme selector** belongs alongside `scripts/seed-data/tr1-scheme-classifier-extended.json` as new rows (or a sibling `tr1-kontreiler-schemes.json`) keyed by `{vehicleType, lengthM, ownership, loadState} → iScheme`. The three verbatim rows + 7,8 m boundary above are the complete content of Табл.11.
- **The rate belts for 93/94** (separate, missing — §5) would go with the other И-belt stores (`tr1-i-belts-*.json` / `tr1-rate-belts.json`).
- **Related seeds for cross-reference (none currently touch 93/94):** `tr1-scheme-classifier-extended.json` (carries the N90-94 «НЕ seeded» flag), `etsng-classes.json` (has unrelated `093*/094*` ЭТСНГ codes — do not confuse with schemes).
