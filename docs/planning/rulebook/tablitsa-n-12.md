# Таблица N 12 — Уменьшение тарифов: контейнерные полные комплекты (FCL)

> **Primary source (no paywall, verbatim):**
> `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-12/`
> **Law:** Приказ ФАС России от 06.11.2025 № 894/25 («Тарифное руководство № 1»), в силе с 2026-01-01 (заменил Прейскурант 10-01). R-Тариф построен на этом документе.
> **Fetched verbatim this pass:** 2026-06-09 (2 WebFetch passes — English-summary + raw-Russian targeted at notes/footnotes — agreed cell-for-cell; second pass confirmed there are NO примечания/сноски below the table).
> **Cross-ref to п.15.5 verbatim (already on disk):** `docs/planning/TARIFF_RULES_EXACT.md` line 30 and `scripts/seed-data/tr1-rounding-rules.json` — both already quote the rule naming «таблицах N N 12, 13».
> **On-disk machine table (canonical store):** ⚠ NOT YET SEEDED. No `tr1` seed file currently contains these per-container discount amounts. See §4.

---

## 1. What this table is and where it enters the tariff

`Таблица N 12` is a **скидка (уменьшение тарифа) в абсолютных рублях на один контейнер**, применяемая к перевозке грузов **контейнерной отправкой полными комплектами на вагон** (full-car loads of containers, FCL-on-wagon), а также к **порожним собственным/арендованным контейнерам** полными комплектами.

Это НЕ коэффициент-множитель. Это **фиксированная сумма в руб./контейнер**, которая **вычитается** из рассчитанного инфраструктурного тарифа.

**Полное название таблицы (verbatim):** «Размер уменьшения тарифов на перевозку по инфраструктуре РЖД контейнерной отправкой грузов в контейнерах и порожних собственных (арендованных) контейнеров полными комплектами на вагон».

**Три измерения выбора ячейки:**
1. **Типоразмер контейнера** — строка. Среднетоннажные (3 т, 5 т) и крупнотоннажные (10 фт; свыше 10 по 20 включительно; свыше 20). Типоразмер определяется «согласно таблице N 10 приложения N 1 к Тарифному руководству» (см. сам заголовок столбца).
2. **Принадлежность контейнера** — Общий парк / Собственные (арендованные).
3. **Состояние** — Груженые / Порожние. Колонка «Порожние» есть **только** у собственных (арендованных) контейнеров; для общего парка порожних колонок нет.

**Как это входит в расчёт (plain Russian):**
- Сумма из Таблицы N 12 — это **руб./контейнер**. Её надо **умножить на число контейнеров** в полном комплекте на вагон и **вычесть** из инфраструктурного тарифа.
- Шаг вычитания — это **п.16.10 «вычитание размеров уменьшения тарифа»** (см. `tr1-rounding-rules.json`: `{"step": "16.10 вычитание размеров уменьшения тарифа", "roundTo": 0.01}`). На этом шаге промежуточный результат округляется **до целых копеек (0,01 ₽)**.
- **Затем** срабатывает **п.15.5**: итоговая сумма в накладной — это «**Сумма тарифов за вычетом размеров уменьшения тарифов, указанных в таблицах N N 12, 13 … округляется … до целых рублей** — по тарифным схемам … на отправки в крупнотоннажных контейнерах; **до 0,1 рубля (целых десяти копеек)** — … на отправки в среднетоннажных контейнерах». То есть единица итогового округления зависит от того, среднетоннажный это контейнер или крупнотоннажный — что совпадает с двумя строковыми блоками самой Таблицы N 12.

**Unit / step в движке SimpleCargo:**
```
reduction_total = lookup(Tabl12, типоразмер, принадлежность, состояние)  // руб./контейнер
                  × N_containers
И_после_скидки  = round2( И_тариф − reduction_total )        // п.16.10, до 0,01 ₽
ИТОГ_накладной  = round_по_15.5( И_после_скидки + порожний... )
                  // крупнотоннаж → до 1 ₽; среднетоннаж → до 0,1 ₽
НДС             // применяется последним, на итог п.15.5
```

---

## 2. Verbatim table (raw Russian, as fetched 2026-06-09)

Reproduced literally. Decimal separator не применяется (суммы целые рубли). Заголовки и метки строк — byte-for-byte из raw-Russian fetch.

```
Таблица N 12

Размер уменьшения тарифов на перевозку по инфраструктуре РЖД контейнерной
отправкой грузов в контейнерах и порожних собственных (арендованных)
контейнеров полными комплектами на вагон

Контейнеры с типоразмером     | Размер уменьшения тарифов в зависимости от
контейнера согласно таблице   | принадлежности контейнера, руб./контейнер
N 10 приложения N 1 к         |
Тарифному руководству         | Общий парк      | Собственные (арендованные)
                              | Груженые        | Груженые | Порожние
Среднетоннажные, тонны:
3                             | 2491            | 2382     | 1664
5                             | 4104            | 3952     | 2762
Крупнотоннажные, футы:
10                            | 5937            | 5641     | 3944
свыше 10 по 20 включительно   | 10379           | 9965     | 6976
свыше 20                      | 16207           | 15632    | 10937
```

**Примечания/сноски:** на странице их НЕТ (подтверждено вторым целевым fetch на notes/footnotes/пункт-references — ниже таблицы только навигация на Табл. N 11 / N 13). Колонка «Порожние» существует только у блока «Собственные (арендованные)»; у «Общий парк» порожних нет (в правовом смысле порожний пробег контейнера общего парка вне этой скидки).

### Machine-readable восстановление (для будущего сидинга)

```json
{
  "_source": "Приказ ФАС РФ от 06.11.2025 N 894/25, Прил.N1, Таблица N 12 (VERBATIM fetched 2026-06-09)",
  "_unit": "руб./контейнер",
  "_applied": "вычитается в п.16.10 (round 0.01), до итогового округления п.15.5",
  "_sizeRefTable": "Таблица N 10 Прил.N1 (типоразмеры)",
  "rows": [
    {"group": "среднетоннажные", "size": "3т",  "obshchiy_gruzh": 2491,  "sobstv_gruzh": 2382,  "sobstv_porozh": 1664},
    {"group": "среднетоннажные", "size": "5т",  "obshchiy_gruzh": 4104,  "sobstv_gruzh": 3952,  "sobstv_porozh": 2762},
    {"group": "крупнотоннажные", "size": "10фт",            "obshchiy_gruzh": 5937,  "sobstv_gruzh": 5641,  "sobstv_porozh": 3944},
    {"group": "крупнотоннажные", "size": "свыше 10 по 20 вкл", "obshchiy_gruzh": 10379, "sobstv_gruzh": 9965,  "sobstv_porozh": 6976},
    {"group": "крупнотоннажные", "size": "свыше 20",        "obshchiy_gruzh": 16207, "sobstv_gruzh": 15632, "sobstv_porozh": 10937}
  ]
}
```

---

## 3. How п.15.5 ties this table to final rounding (verbatim, already on disk)

The discount above is one of the deductions explicitly named in п.15.5. Cross-ref `docs/planning/TARIFF_RULES_EXACT.md` line 30 (already verbatim on disk):

> «Сумма тарифов за вычетом размеров уменьшения тарифов, указанных в таблицах N N 12, 13 приложения N 1 к Тарифному руководству и в подпункте 28.2 пункта 28 Тарифного руководства, проставляемая в накладной, округляется следующим образом: до целых рублей - по тарифным схемам на повагонные отправки и отправки в крупнотоннажных контейнерах, на потонные тарифы грузов, перевозимых наливом; до 0,1 рубля (целых десяти копеек) - по тарифным схемам на отправки в среднетоннажных контейнерах, на мелкие отправки грузов.»

So: Таблица N 12 = «уменьшение», п.16.10 = шаг вычитания (round 0,01), п.15.5 = итоговое округление (крупнотоннаж → 1 ₽; среднетоннаж → 0,1 ₽).

---

## 4. What this EXTENDS or CONTRADICTS in the current engine/seed

**EXTENDS (gap — not yet seeded):**
- **No on-disk seed file holds these per-container discount amounts.** `tr1-rounding-rules.json` *names* the step («16.10 вычитание размеров уменьшения тарифа», «таблицах N N 12, 13») but holds **zero numeric cells** for Таблица N 12. `tr1-i-belts-container.json` covers Таблица N **24** (контейнерные тарифные плиты, схемы N85–N94) — i.e. the **base** container tariff, NOT the FCL discount. The FCL discount is a separate, currently-missing input. **Action:** seed the §2 JSON as a new `tr1-tabl12-fcl-discount.json` if FCL container КП are to be priced to the ruble.
- The index `docs/planning/rulebook/00-index-prikaz-894-25.md` line 44 still marks Таблица N 12 as «TO FETCH (med — affects КП for FCL)». This pass closes that fetch; update that row to «FETCHED 2026-06-09 → rulebook/tablitsa-n-12.md».

**CONTRADICTS / risk flags:**
- **Engine likely does not apply this discount at all today.** The current bulk-rail щебень use case is повагонная (universal/cistern wagons), not контейнерная отправка, so FCL container quotes are out of the hot path. Any container quote produced today is missing this deduction → tariff is overstated by `amount × N_containers` rubles. This is a correctness gap for any future container КП, not for the present щебень flow.
- **Состояние «Порожние» only for own/arranged containers** — engine must not offer a порожний discount for общий парк (no such column exists). A naive 3-axis lookup that assumes every cell exists would fabricate a non-existent общий-парк-порожний value. Guard required.
- **Типоразмер resolution depends on Таблица N 10**, which is referenced but not fetched in this pass. The bracket «свыше 10 по 20 включительно / свыше 20» (in feet) must be mapped from the actual container ISO size via Табл. N 10 before this discount can be selected. That mapping is a separate fetch (Таблица N 10 Прил.N1) and is currently UNFETCHED.

**No contradiction found** between the §2 numbers and any existing seed — because no existing seed contains competing FCL-discount numbers to contradict. This is purely additive.
