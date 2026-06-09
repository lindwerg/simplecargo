# Таблица N 6 — Тарифные схемы, применяемые при расчёте тарифа на перевозку грузов по инфраструктуре РЖД в универсальных вагонах

> **Primary source (no paywall, verbatim):**
> `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-6/`
> **Law:** Приказ ФАС России от 06.11.2025 № 894/25 (с изм. от 13.02.2026) «Об утверждении Порядка расчёта тарифов … (Тарифное руководство № 1)», рег. Минюст России 22.12.2025 № 84708, в силе с 2026-01-01 (заменил Прейскурант 10-01).
> **Fetched verbatim this pass:** 2026-06-09. Two independent fetches: (1) WebFetch markdown pass, (2) raw-HTML `<table>` extraction (`curl` → row-by-row parse). The raw-HTML pass is authoritative here — it captured a long parenthetical rule inside the «N N 8, 25(1)» cells that the WebFetch summary abbreviated away.
> **On-disk machine table (canonical store):** `scripts/seed-data/tr1-scheme-classifier.json` (rows already cite this exact URL); related: `tr1-scheme-classifier-extended.json`, `tr1-empty-run.json` / `tr1-empty-run-full.json` (схема N25(1) porozhny), `tr1-special-rules.json`.

---

## 1. What this table is and where it enters the tariff

`Таблица N 6` is the **scheme-selector (сопоставление тип вагона → номер тарифной схемы)** for **universal wagons** (крытый, платформа, полувагон, 6-осный сочленённый). It does **not** contain any rates or money. It tells the engine **which tariff scheme(s)** to read out of the rate tables (the «И»-belts / схема N8 etc. and the «В»-component schemes) for a given combination of:

- **тип универсального вагона** (row), and
- **принадлежность вагона**: «Вагоны общего парка» (RZD-owned/general fleet) vs «Собственные (арендованные)» (own/leased) (column).

**How it enters the calculation (plain Russian):**

This table is **Step 1 (выбор тарифной схемы)** of the п.16 chain — it picks the scheme *number*, before any coefficient (K1/K3/K4) or distance lookup happens. It does **not** itself produce rubles or apply a per-ton/per-km unit; it only resolves *which* rate column you then read.

For a **вагон общего парка** the total has **two scheme components**:
- **«Тариф на использование инфраструктуры РЖД и локомотивов РЖД»** — the infrastructure/loco part (schemes И1 / «N N 8, 25(1)»);
- **«Тариф на использование вагонов»** — the wagon-rental part (schemes В1 / В3 / В4).

For a **собственный (арендованный)** wagon there is a **single column** «Собственные (арендованные)» → schemes **8** / **8(1)**: you pay only the infrastructure part (плюс отдельный порожний рейс по схеме N25/N25(1), который описан в Табл.17/п.18, не в этой таблице). There is **no «В»-component** for own wagons.

Two embedded **special rules** ride inside the cells (verbatim in §2):
1. **Порожний рейс универсальной платформы и полувагона общего парка** считается по схеме **N 25(1)** за расстояние, равное **60 % от расстояния перевозки груза**.
2. **Полувагоны спец-моделей** (12-9761-02, 12-9833-01; 12-9853, 12-9869, 12-196-01, 12-196-02, 12-2143, 12-2159) — к тарифной схеме **N 8** применяется **коэффициент 0,9595**.

---

## 2. Verbatim table (raw-HTML pass, 2026-06-09)

Reproduced literally from the page `<table>`. Column structure of the source: a stub column «Типы универсальных вагонов» + a banner «Вагоны» split into «Общего парка» (itself split into «Тариф на использование инфраструктуры РЖД и локомотивов РЖД» | «Тариф на использование вагонов») and «Собственные (арендованные)». The body row labelled «Тарифные схемы» is the sub-header for the three data columns. Decimal separator is a comma, exactly as in the source.

```
Таблица N 6
Тарифные схемы, применяемые при расчете тарифа на перевозку
грузов по инфраструктуре РЖД в универсальных вагонах

Типы универсальных вагонов | Вагоны
                           |   Общего парка                                              | Собственные (арендованные)
                           |   Тариф на использование инфраструктуры РЖД и локомотивов РЖД | Тариф на использование вагонов |
                           |   Тарифные схемы
```

Data rows (cell separator shown as `||`, exactly as parsed):

```
1. Крытый, кроме 6-осных сочлененных вагонов || И1 || В3 || 8

2. Платформа (в том числе платформа для крупнотоннажных контейнеров и колесной техники длиной менее 19,6 м), кроме 6-осных сочлененных вагонов || N N 8, 25(1) (при расчете тарифа на использование инфраструктуры РЖД и локомотивов РЖД при перевозке груза в вагоне общего парка в части тарифа на использование инфраструктуры РЖД и локомотивов РЖД в порожнем рейсе тариф рассчитывается по тарифной схеме N 25(1) за расстояние, составляющее 60% от расстояния перевозки груза) || В1 || 8

3. Полувагон (кроме 6-осных сочлененных вагонов). При перевозках грузов в полувагонах моделей 12-9761-02, 12-9833-01; 12-9853, 12-9869, 12-196-01, 12-196-02, 12-2143, 12-2159 тариф определяется по тарифным схемам, при этом к тарифной схеме N 8 применяется коэффициент 0,9595 || N N 8, 25(1) (при расчете тарифа на использование инфраструктуры РЖД и локомотивов РЖД при перевозке груза в вагоне общего парка в части тарифа на использование инфраструктуры РЖД и локомотивов РЖД в порожнем рейсе тариф рассчитывается по тарифной схеме N 25(1) за расстояние, составляющее 60% от расстояния перевозки груза) || В4 || 8

4. Универсальный 6-осный вагон сочлененного типа || - || - || 8(1)
```

**Notes on the source layout (not fabricated, observed):**
- Row 4 has «-» (dash) in both «общий парк» columns — a 6-axle articulated universal wagon is priced only as own/leased, scheme **8(1)**.
- No separate «Примечание» block exists outside the table on this page; the only conditional rules are the in-cell parentheticals reproduced above.

---

## 3. Structured restatement (machine-friendly, derived from §2 — no new numbers)

| # | Тип универсального вагона | Общий парк — И-часть (инфраструктура+локомотив) | Общий парк — В-часть (вагон) | Собственный / арендованный |
|---|---|---|---|---|
| 1 | Крытый (кроме 6-осных сочленённых) | **И1** | **В3** | **8** |
| 2 | Платформа (вкл. платформу для крупнотоннажных контейнеров и колёсной техники длиной < 19,6 м), кроме 6-осных сочленённых | **N 8** (груз) + **N 25(1)** на порожний рейс за **60 %** расстояния | **В1** | **8** |
| 3 | Полувагон (кроме 6-осных сочленённых); спец-модели → к **N 8** коэф. **0,9595** | **N 8** (груз) + **N 25(1)** на порожний рейс за **60 %** расстояния | **В4** | **8** |
| 4 | Универсальный 6-осный сочленённого типа | — | — | **8(1)** |

Спец-модели полувагонов (коэф. 0,9595 к схеме N 8): `12-9761-02, 12-9833-01, 12-9853, 12-9869, 12-196-01, 12-196-02, 12-2143, 12-2159`.

---

## 4. Extends / contradicts the current engine & seed

Cross-ref against `scripts/seed-data/tr1-scheme-classifier.json` (rows dumped 2026-06-09).

**CONFIRMS (seed already correct):**
- Полувагон спец-моделей → схема N8 × **0,9595** — present verbatim in seed `ownClassCoeffNote`: *"полувагоны спец. моделей 12-9761-02 etc → схема N8 ×0,9595"*. Model list matches.
- «В»-component charged only for `ownership: rzd`: seed rows `крытый/rzd → vScheme В3`, `платформа/rzd → В1`, `полувагон/rzd → В4` match Табл.6 columns exactly.
- 6-осный сочленённый → scheme **8(1)**: seed `универсальный-6ос-сочлененный/rzd → vScheme 8(1)` and `полувагон-сочлененный-6ос/own → iScheme N8(1)` both align.
- Порожний рейс платформы/полувагона общего парка по **N25(1) за 60 %** расстояния — present in seed notes on the rzd platform/полувагон rows (*"порожний рейс по схеме N25(1) за 60% расстояния"*). **This rule was abbreviated/dropped by the WebFetch summary and only recovered by the raw-HTML pass** — the seed is the better record here; this rulebook now backs it with the verbatim cell text.

**EXTENDS (rulebook adds verbatim text the seed only summarised):**
- The full legal wording of the порожний-60 % rule (the entire in-cell parenthetical) is now captured verbatim, so the engine's 0.6-distance multiplier on N25(1) is *derivable from primary text*, not just from R-Тариф behaviour.

**FLAG / potential CONTRADICTION to reconcile (HIGH — verify before trusting engine):**
- **Крытый, общий парк, И-часть:** Табл.6 verbatim says the infrastructure/loco scheme is **«И1»**. The seed row `крытый/rzd/wagon` records `iScheme: "N8"` (with `vScheme: В3`). These disagree on the *infrastructure-part scheme code* for the general-fleet covered wagon (И1 vs N8). The «В3» wagon-part matches; the И-part code does **not**. This needs reconciliation — either (a) seed should carry `iScheme: И1` for крытый/rzd to mirror Табл.6, or (b) there is an upstream mapping И1≡N8 for крытый that must be documented. **Do not silently trust the engine's крытый-общий-парк infrastructure leg until this is resolved.** No number was changed here — flagging only.
- Seed has rows not in Табл.6 (`спец-общий-парк И2..И7/В5..В14`, `цистерна-*`) — those come from other tables (Табл. for specialized wagons / cisterns), not a contradiction, just out of scope of Табл.6.

**No fabrication:** every scheme code (И1, В1, В3, В4, 8, 8(1), N8, N25(1)), the 60 % figure, the 0,9595 coefficient, and the 8-model list are quoted directly from the §2 verbatim cells. Nothing was invented or interpolated.
