# ТР-1 2026 — Master Rulebook Index (Приказ ФАС России от 06.11.2025 № 894/25)

> **Primary source (verbatim, no paywall):** `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/`
> **Registration:** Минюст России 22.12.2025 № 84708. **In force from 2026-01-01** (superseded Прейскурант 10-01). **Last amended on the sudact page:** 13.02.2026 — captured chunks reflect the post-amendment редакция.
> **Signatory (pinned to primary source):** Руководитель ФАС М.А. Шаскольский, 6 ноября 2025 г.
>
> **Purpose of this file.** A developer-facing trace index. Every chunk under `docs/planning/rulebook/*.md` is a VERBATIM capture of one ТР-1 sub-page (with source URL + plain-Russian "how it enters the calc"). This index orders those chunks **by calculation step** so any ruble in a SimpleCargo КП can be traced back to its ТР-1 clause. **No number here is paraphrased into existence** — every figure lives verbatim in the chunk it points to. Cells marked `TO FETCH` / `PARTIAL` are explicit blind spots, not invented data.
>
> **Companion docs:** verbatim arithmetic in [`TARIFF_RULES_EXACT.md`](./TARIFF_RULES_EXACT.md); per-rule engine conformance + money risks in [`TR1_ENGINE_CONFORMANCE.md`](./TR1_ENGINE_CONFORMANCE.md); machine-usable rounding/order in [`scripts/seed-data/tr1-rounding-rules.json`](../../scripts/seed-data/tr1-rounding-rules.json).

---

## 0. The two-appendix homonym trap (read first)

Per the приказ itself ([`prikaz.md`](./rulebook/prikaz.md) п.1–2) there are **two distinct "Приложение N 2"** and the engine/seed must keep them separate:

| Name | What it is | Role in calc |
|---|---|---|
| **Приложение N 2 к приказу** | Перечень утративших силу актов (the repeal list of dead ФЭК/ФСТ/ФАС acts) | none — legal traceability only |
| **Приложение N 2 к Тарифному руководству** (nested INSIDE Приложение N 1 к приказу) | Базовые ставки тарифных схем (groups И / В / N8 / N25 …), cited in п.15.4 | the rate values the engine multiplies |

The base-rate schemes the engine consumes live in the **N 2 к Тарифному руководству**, not the приказ-level N 2. Conflating them = "where are the rates?" failures.

---

## 1. Document tree → chunk map

| Layer | Chunk file | What it pins | Source URL suffix (base = sudact URL above) |
|---|---|---|---|
| 00 index | [`rulebook/00-index-prikaz-894-25.md`](./rulebook/00-index-prikaz-894-25.md) | Full fetch work-list (Табл. N1–36 + Прил. N2 scheme pages) with on-disk seed mapping + TO-FETCH gaps | — |
| Приказ | [`rulebook/prikaz.md`](./rulebook/prikaz.md) | Header, legal-basis chain (147-ФЗ, 17-ФЗ, 18-ФЗ, ПП №331, ПП №643), п.3 effective-date gate 2026-01-01, signatory, two-N2 homonym | `/prikaz/` |
| Прил.N1 §I | [`rulebook/prilozhenie-n-1-i.md`](./rulebook/prilozhenie-n-1-i.md) | Общие положения пп.1–14: distance rules (п.4), общий-парк vs собственный (пп.7–9), 3 classes + Табл.1–4 names (п.10), K1∉группа В (п.12), НКО included (п.13) | `/prilozhenie-n-1/i/` |
| Прил.N1 §II | [`rulebook/prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) | THE FORMULA pp.15–25: rounding (15.4/15.5), order-of-operations (16.1–16.10), 16.5.1 own-vs-общий-парк, K4 max-of-two (17.2), own-полувагон class factors (18.1.1), МВН floor (18.2) | `/prilozhenie-n-1/ii/` |
| Прил.N1 §III | [`rulebook/prilozhenie-n-1-iii.md`](./rulebook/prilozhenie-n-1-iii.md) | Инфраструктурный тариф пп.50–55 (ЗИ/ОПВ/ОПЛ schemes) — **NOT the SimpleCargo path**; captured for completeness | `/prilozhenie-n-1/iii/` |
| Табл. N1–N20 | [`rulebook/tablitsa-n-1.md`](./rulebook/tablitsa-n-1.md) … [`tablitsa-n-20.md`](./rulebook/tablitsa-n-20.md) | Per-table verbatim captures (ЕТСНГ/класс/МВН; K1; directional; K3; K4; scheme maps; порожний; reductions; …) | `/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-<N>/` |

> Chunks for the Приложение N 2 scheme sub-pages (И1/И14, N8, В1–В15, N25–29, transporters, containers) and Табл. N21–N36 are enumerated with status (CAPTURED / PARTIAL / TO FETCH) in `00-index-prikaz-894-25.md`. The high-value щебень/повагонная path is CAPTURED end-to-end; remaining `TO FETCH` rows are low-priority for bulk rail.

---

## 2. Trace a ruble — chunks ordered by calculation step

This is the spine: follow the steps top-to-bottom and you reconstruct the engine's `И_loaded + порожний (+ В for общий парк)`, без НДС, then НДС.

| Step | What happens | ТР-1 clause | Chunk (verbatim) | On-disk seed/engine |
|---|---|---|---|---|
| **0. Gate** | Quote dated ≥ 2026-01-01 → use ТР-1, not 10-01 | приказ п.3 | [`prikaz.md`](./rulebook/prikaz.md) §1 п.3 | `tr1-rounding-rules.json._meta.regulation` |
| **1. Расстояние** | `L_km` = кратчайшее по ТР-4 + Приказ Минтранса №313; БЕЗ ветвей необщего пользования | §I п.4 (+4.1–4.7); §II п.16.1 | [`prilozhenie-n-1-i.md`](./rulebook/prilozhenie-n-1-i.md) п.4; [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) §2/16.1 | ТР-4 graph / калькулятор |
| **2. Вид отправки + принадлежность** | повагонная/групповая/…; общий парк (И+В) vs собственный (И + порожний, no В) | §I пп.7–9; §II п.16.2 | [`prilozhenie-n-1-i.md`](./rulebook/prilozhenie-n-1-i.md) пп.7–9; [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) 16.2 | `computeTariff.ts` ownership branch; `tr1-scheme-classifier-extended.json` |
| **3. Класс + ЕТСНГ + МВН** | ЕТСНГ → класс (1/2/3); chargeable = max(actual, МВН) | §I п.10; §II пп.16.3, 18.2 | [`prilozhenie-n-1-i.md`](./rulebook/prilozhenie-n-1-i.md) п.10; [`tablitsa-n-1.md`](./rulebook/tablitsa-n-1.md); [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) 18.2 | `tr1-classifier-full.json`, `etsng-classes.json`, `tr1-min-weight-norms.json` |
| **4. Схема + база** | scheme № (N8/8(1)/9 own, И1/И14 общий) → base rate за вагон за общую массу; **snap belt, do NOT interpolate** | §II пп.16.4, 16.5, 16.5.1 | [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) 16.4/16.5/16.5.1; [`tablitsa-n-6.md`](./rulebook/tablitsa-n-6.md) | `tr1-n8-corrected.json`, `tr1-i-belts-full.json`, `tr1-rate-belts.json` |
| **5. K3 товарный (Табл.4)** | с-расстояния correction: `rate(L_from) + K3·(rate(L)−rate(L_from))` → **round 0,01 ₽** | §II п.16.6 | [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) 16.6; [`tablitsa-n-4.md`](./rulebook/tablitsa-n-4.md) | `tr1-k3-full.json`, `tr1-commodity-coef-verify.json` |
| **6. K4 отправочный (Табл.5)** | belt correction, **max-of-two абс. величина** (16.7.1 vs 16.7.2); пояс floor п.17.2 → **round 0,01 ₽** | §II пп.16.7–16.8, 17.1–17.3 | [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) 16.7/16.8/17; [`tablitsa-n-5.md`](./rulebook/tablitsa-n-5.md) | `tr1-k4-full.json`, `tr1-k4-corrected.json` |
| **7. Классовые K1 (Табл.2)** | sequential × class taper по расстоянию; **K1 ∉ группа В** (п.12) → **round 0,01 ₽ each** | §I п.12; §II п.16.9 | [`prilozhenie-n-1-i.md`](./rulebook/prilozhenie-n-1-i.md) п.12; [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) 16.9; [`tablitsa-n-2.md`](./rulebook/tablitsa-n-2.md) | `tr1-k1-full.json`, `tr1-class-coeff.json` |
| **8. Прочие × (Табл.4 / п.18.1.1)** | нерудный-полувагон ×0,909; own-полувагон класс 0,9346/0,9592/0,9774; инновац. ×0,9595 → **round 0,01 ₽ each** | §II пп.16.9, 18.1.1 | [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) 18.1.1; [`tablitsa-n-4.md`](./rulebook/tablitsa-n-4.md) | `tr1-coefficients.json`, `tr1-innovative-models.json` |
| **9. Уменьшения** | минус Табл.N12/N13 + п.28.2 (FCL/контрейлер) — inert for щебень | §II пп.16.10, 15.5 | [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) 16.10; [`tablitsa-n-12.md`](./rulebook/tablitsa-n-12.md) | (none wired; Табл.N12 TO FETCH) |
| **10. Порожний** | own = actual return haul по N25 (full distance); общий парк = N25(1) на 60% (16.5.1); ×надбавка → **round 0,01 ₽** | §II п.16.5.1; Табл.17 | [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) 16.5.1; [`tablitsa-n-17.md`](./rulebook/tablitsa-n-17.md) | `tr1-empty-run-full.json` |
| **11. Группа В** | **only общий парк**; за вагон, без K1 (п.12). Собственный → NO В | §I п.12; §II п.16.5.1 | [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) 16.5.1 | `tr1-v-belts-full.json` |
| **12. Итог накладной** | `И + порожний (+ В)` → **round 1 ₽** (повагонная/крупнотоннаж./потонные налив), half-up | §II п.15.5 | [`prilozhenie-n-1-ii.md`](./rulebook/prilozhenie-n-1-ii.md) §1/15.5 | `round1()` |
| **13. Индексация** | +10% (2025-12-01) **already baked into** Прил.N2 base — do NOT re-apply | (вне §II) | [`TARIFF_RULES_EXACT.md`](./TARIFF_RULES_EXACT.md) §7 | `tr1-coefficients.json` |
| **14. НДС** | last, on the п.15.5 итог: 22% domestic 2026 / 0% export | (вне §II) | [`TARIFF_RULES_EXACT.md`](./TARIFF_RULES_EXACT.md) §7 | `computeTariff.ts` VAT |

---

## 3. Known blind spots (do not fabricate — fetch when needed)

- **Табл. N3 (directional coefficients)** — §I п.10 names it as a *separate* table from Табл. N4 (commodity K3). The `00-index` currently maps both N3 and N4 onto `tr1-k3-full.json`; the directional N3 has **no dedicated seed yet** (flagged PARTIAL). Affects directional pricing only.
- **Табл. N12 (FCL container reduction)** — required by п.15.5/16.10 before the whole-ruble round. Not fetched, not wired. Inert for щебень; mandatory before any container КП.
- **Прил. N2 schemes N25–N29 (own wagon + own locomotive)** — TO FETCH (med).
- **пп.22–25 per-point scheme numbering** — the WebFetch summarizer's attribution (рефрижераторные / изотермические / контейнеры / контрейлерные / транспортёры) conflicts with the `00-index` note; resolve by reading the rendered §II body directly before relying on it. Only пп.18 and 21 are cross-checked against captured bodies. Affects non-полувагон branches only.
- **Минюст registration line (84708)** — cross-referenced in seed `_meta`, not printed on the `/prikaz/` page; obtain from consultant.ru `LAW_522347` if a verbatim Минюст line is ever required.
