# Reference example — real ПСЦ (Протокол согласования договорной цены)

Source: `ПСЦ №1 РНС.pdf` (real document). Golden fixture for the **drag-drop price-protocol extraction** lane.

## Document framing
- **Type:** «ПРОТОКОЛ № N согласования договорной цены» — a price-agreement protocol, issued as an **Приложение to a parent Договор** (here: к Договору № ТЭО/04-26/07 от 21.04.2026).
- Place/date: г. Новосибирск, 04.05.2026.
- **Parties (the auto-classification signal):**
  - **ИСПОЛНИТЕЛЬ** (provides wagons) = ООО «Вектор Движения» (dir. Перов А.Е.)
  - **ЗАКАЗЧИК** (pays) = ООО «РНС» (gen.dir. Мишанихин О.Г.)

### ⭐ Side is derived from РНС's role — DO NOT ask the operator
| РНС role in ПСЦ | ПСЦ side | Price feeds |
|---|---|---|
| **ЗАКАЗЧИК** (customer) | **owner ПСЦ → COST** | `Сумма от Поставщика` |
| **ИСПОЛНИТЕЛЬ** (executor) | **client ПСЦ → REVENUE** | `Сумма УА` |
This example: РНС = ЗАКАЗЧИК ⇒ **owner/cost ПСЦ**. Counterparty (Вектор Движения) = the **owner/собственник**.

## ⭐ A ПСЦ is a RATE TABLE, not a single price
Rates are keyed by **(origin_station, dest_station, wagon_type)**:

| Станция отправления | Станция назначения | Вид ПС | Ставка/вагон, руб (в т.ч. НДС 22%) |
|---|---|---|---|
| ТЮЛЬМА | СОБОЛЕКОВО | Полувагон | 48000 |
| ВЛАДИКАВКАЗ | АСТРАХАНЬ 2 | Полувагон | 26000 |
| НОГИНСК | ЛОКОМОТИВСТРОЙ | Полувагон | 30000 |
| КИЗИЛЮРТ | НОВОЛЕСНАЯ | Полувагон | 12000 |
| ДОБРЯТИНО | НОГИНСК | Полувагон | 19000 |

**Price resolution for a Direction:** look up the Direction's `(origin, dest, wagon_type)` in the applicable
owner ПСЦ rate table (by owner + date validity) → cost per wagon. Revenue rate comes from the client ПСЦ
(or directly from the ЗАЯВКА, which carries the client rate). Margin/wagon = revenue_rate − cost_rate
(normalized to same unit & VAT basis). Note stations here are bare NAMEs (no ESR) → must resolve via the
station dictionary; beware homonyms.

## Terms that affect cost/margin computation
- **VAT = 22%, included** (`в т.ч. НДС 22%`); rate **per wagon**. Store `rate_unit=per_wagon`, `vat_included=true`, `vat_rate=22`.
- **п.2 cost allocation:** loaded tariff (гружёный) paid by Заказчик (РНС); empty run (порожний пробег) paid by Исполнитель (owner). Affects true cost.
- **п.3 service date** = cargo-acceptance date per ж/д накладная → use to date the cost / pick report month.
- **п.4 rate change** = new приложение ⇒ **ПСЦ is versioned**; a newer protocol supersedes prior rates for the same route. Keep validity dates; never overwrite.

## Data model implication (see SCHEMA_DELTA.md)
- `price_protocols`: number, parent_contract_ref, protocol_date, executor_party, customer_party, **side (owner|client) derived from РНС role**, vat_rate, vat_included, source_document_id, valid_from, signed_by, superseded_by.
- `price_protocol_rates`: protocol_id, origin_station_id, dest_station_id, wagon_type, rate, currency, rate_unit, vat_included.
- Direction cost/revenue = resolved lookups into these tables, not scalars copied onto the deal.

## Golden assertion for the extraction test
Dropping this PDF must yield: side=owner/COST, owner=Вектор Движения, customer=РНС, vat=22% included,
rate_unit=per_wagon, parent_contract="ТЭО/04-26/07", protocol_date=2026-05-04, and 5 route-rates incl.
(Добрятино→Ногинск, Полувагон, 19000) and (Тюльма→Соболеково, Полувагон, 48000).
