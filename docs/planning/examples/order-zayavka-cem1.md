# Reference example — real ЗАЯВКА (Поручение) for drag-drop extraction

Source: `Заявка ЦЕМ-1 трейд на июнь 2026.pdf` (real document, provided by operator).
This is the canonical shape the **drag-drop Order extraction** lane must parse. Use it as a
golden fixture for the extraction prompt + a regression test.

## Document framing
- **Type:** «Поручение № N к Договору № M» — an *order/instruction* issued under a parent framework **contract** with the client. Orders roll up under a client contract.
- **From → To:** client **ООО «ЦЕМ-1 трейд»** → us **ООО «РНС»** (gen. dir. О.Г. Мишанихин). Confirms app owner = **РНС**.
- **Исх. № / date:** б/н from 02.06.2026.
- Title: "На организацию подачи вагонов под погрузку".

## Extracted fields → Direction card
| Document field | Example value | Maps to |
|---|---|---|
| Период перевозки | Июнь 2026 | `direction.period` / report month |
| Вид перевозки | внутрироссийская | `direction.transport_kind` (export/import/transit/domestic) |
| План | Основной | `direction.plan_kind` (main/additional/if-available) |
| Род подвижного состава | полувагон | `direction.wagon_type` (ПВ) |
| Станция отправления | ст. Красный Сокол, Октябрьская ж.д. **(02220)** | `origin_station` + ESR `02220` + road «Октябрьская» |
| Станция назначения | ст. Бологое-Московское, Октябрьская ж.д. **(050009)** | `dest_station` + ESR `050009` + road «Октябрьская» |
| Грузоотправитель | ООО «Гранит» | `shipper` counterparty |
| Грузополучатель | ООО «ИНТЕРНЕТ ТОРГОВЛЯ» | `consignee` counterparty |
| Груз | ЩЕБЕНЬ ГРАН ПР | `cargo_name` |
| Код груза по ЕТСНГ | 23239 | `cargo_etsng_code` |
| Вес, тн | 10000 | `planned_tonnage` |
| Кол-во вагонов | 150 | `planned_wagons` |
| Заявка ГУ-12 № | (empty) | `gu12_number` (RZD form, NOT commercial) |
| Условие перевозки | **41000 руб/вагон с НДС** | **client rate** → `Сумма УА` per wagon, **unit=per_wagon, vat_included=true** |
| Оплата | провозные платежи РЖД с ЕЛС Экспедитора | `payment_terms` (RZD haulage paid via forwarder ЕЛС) |
| Signed by | ген. дир. ЦЕМ-1 трейд Ходырев Д.С. + stamp | provenance |

## Pricing nuances the model MUST capture (or margin is wrong)
1. **Rate unit is explicit:** `руб/вагон` (per wagon). Must store `rate_unit ∈ {per_wagon, per_ton, total}`.
2. **VAT flag is explicit:** `с НДС` (VAT-included). Must store `vat_included` + `vat_rate`. Margin must compare like-for-like (both net or both gross).
3. **The ЗАЯВКА carries the CLIENT rate (revenue side)** = the "ПСЦ с клиентом" price. The **owner cost** (ПСЦ с собственником) arrives separately; margin/вагон = client_rate − owner_cost (normalized to same unit & VAT basis).
4. **Stations carry inline ESR codes** in the same `ст. NAME Дорога ж.д. (ESR)` format as Source A dislocations → feed the station dictionary directly (no guessing). Note ESR here is zero-padded 6-digit (`050009`).
5. **Parent contract** («Договор № 2») groups multiple orders → model `client_contracts` ← `orders` ← `directions`.
6. `Грузоотправитель`/`Грузополучатель` ≠ `Клиент`. Client = who pays us (ЦЕМ-1 трейд, the order issuer); never auto-fill Клиент from consignee (locked decision D16).

## Golden assertion for the extraction test
Dropping this PDF must yield: client=ЦЕМ-1 трейд, wagons=150, tonnage=10000, cargo=ЩЕБЕНЬ(ЕТСНГ 23239),
origin=Красный Сокол(02220), dest=Бологое-Московское(050009), wagon_type=ПВ,
client_rate=41000 RUB per_wagon vat_included, period=2026-06 — all confirmable by the operator before commit.
