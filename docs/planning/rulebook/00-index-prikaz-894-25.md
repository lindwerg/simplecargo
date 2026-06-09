# Rulebook Index — Приказ ФАС России от 06.11.2025 № 894/25 («Тарифное руководство № 1»)

> **Primary source (no paywall, verbatim):** `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/`
> **Registration:** Минюст России 22.12.2025 № 84708. In force from 2026-01-01 (superseded Прейскурант 10-01).
> **Last amended on sudact page:** 13.02.2026.
> This file is the master work-list for capturing ТР-1 2026 VERBATIM. Each row = one fetchable sub-page. Status column says whether the content is already captured on disk (cite, do NOT re-derive) or still a blind spot (TO FETCH).

## Document tree (top level)

| Slug | Title | URL | Status |
|---|---|---|---|
| `prikaz` | Приказ (вводная часть, дата вступления в силу) | `/law/prikaz-fas-rossii-ot-06112025-n-89425/prikaz/` | TO FETCH (low) |
| `prilozhenie-n-1` | Приложение N 1 — Порядок расчёта тарифов и Тарифное руководство № 1 | `/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/` | container |
| `prilozhenie-n-1/i` | Раздел I. Общие положения (пп.1–14) | `/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/i/` | CAPTURED (this index lists пп.; quote in TARIFF_RULES_EXACT.md) |
| `prilozhenie-n-1/ii` | Раздел II. Тарифы на перевозки грузов (пп.15–25, ФОРМУЛА) | `/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/ii/` | CAPTURED VERBATIM in TARIFF_RULES_EXACT.md (пп.15.4–15.5, 16.1–16.10) |
| `prilozhenie-n-1/iii` | Раздел III. Тарифы на услуги по использованию инфраструктуры РЖД | `/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/iii/` | TO FETCH (low — infra-use, not cargo freight) |
| `prilozhenie-n-2` (acts) | Перечень утративших силу актов | `/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-2_1/` | TO FETCH (low — repeal list, not calc) |

## Раздел I — Общие положения (пункты, verbatim subjects)

п.1 разработка ТР по ФЗ о ж/д транспорте · п.2 область применения тарифов · п.3 дата расчёта по штемпелям станций · п.4 определение расстояния по инфраструктуре РЖД · п.5 тариф с участием строящихся/внешних линий · п.6 применение тарифов к работам/услугам · п.7 определение вагонов общего парка · п.8 применение к собственным вагонам/контейнерам · п.9 применение к арендованным вагонам/контейнерам · **п.10 дифференциация по трём тарифным классам + таблицы коэффициентов** · п.11 расчёт по отметкам в накладных · п.12 исключение коэффициентов для вагонов общего парка · п.13 услуги, входящие в тариф НКО · п.14 расчётные параметры тарифных схем.

## Раздел II — Тарифы на перевозки грузов (пункты, verbatim subjects)

п.15 округление массы и тарифа (15.4 промежуточное до целых копеек; 15.5 итог до рублей/0,1 руб, half-up) · **п.16 методология/последовательность расчёта (16.1–16.10) — ОСНОВНАЯ ФОРМУЛА**; п.16.5.1 собственные вагоны = груж.рейс + порож.пробег (60% расст.) + использование вагонов (группа В) · п.17 коэффициенты при повагонной/групповой/маршрутной отправке · п.18 универсальные вагоны · п.19 сборная повагонная в универсальных · п.20 специализированные вагоны · п.21 наливные в цистернах · п.22 изотермические вагоны · п.23 контейнеры · п.24 контрейлерные · п.25 мелкие отправки в сборных вагонах.

## Приложение N 1 — Таблицы N 1 … N 36

Base path: `/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-1_1/tablitsa-n-<N>/`

| N | Subject | On-disk file (scripts/seed-data) | Status |
|---|---|---|---|
| 1 | ЕТСНГ номенклатура грузов + тарифные классы + МВН | `tr1-classifier-full.json`, `etsng-classes.json`, `tr1-min-weight-norms.json` | CAPTURED |
| 2 | Коэффициенты по расстоянию перевозки (классы 1–3) = K1 | `tr1-k1-full.json`, `tr1-class-coeff.json` | CAPTURED |
| 3 | Коэффициенты по отдельным направлениям | `tr1-k3-full.json` (товарные поправочные); направленческие — see note | PARTIAL — verify directional vs commodity split |
| 4 | Коэффициенты для отдельных грузов = K3 | `tr1-k3-full.json`, `tr1-commodity-coef-verify.json` | CAPTURED |
| 5 | Коэффициенты повагонные/групповые/маршрутные = K4 | `tr1-k4-full.json`, `tr1-k4-corrected.json` | CAPTURED |
| 6 | Тарифные схемы — универсальные вагоны | `tr1-scheme-classifier-extended.json` | PARTIAL (scheme map) |
| 7 | Тарифные схемы — специализированные вагоны | `tr1-scheme-classifier-extended.json` | PARTIAL |
| 8 | Тарифные схемы — цистерны наливные | `tr1-scheme-classifier-extended.json` | PARTIAL |
| 9 | Тарифные схемы — изотермические вагоны | `tr1-scheme-classifier-extended.json` | PARTIAL |
| 10 | Тарифные схемы — контейнерные отправки | `tr1-i-belts-container.json` (schemes) | PARTIAL |
| 11 | Тарифные схемы — контрейлерные перевозки | — | TO FETCH (low) |
| 12 | Уменьшение тарифов — контейнерные полные комплекты | — | TO FETCH (med — affects КП for FCL) |
| 13 | Уменьшение тарифов — контрейлерные полные комплекты | — | TO FETCH (low) |
| 14 | Тарифные схемы — термические контейнеры | — | TO FETCH (low) |
| 15 | Коэффициенты ГРПС по кол-ву рефрижераторных вагонов | — | TO FETCH (low) |
| 16 | Тарифные схемы — габаритные/негабаритные грузы | `tr1-i-belts-transporter.json` (часть) | PARTIAL |
| 17 | Тарифные схемы — пробег порожних вагонов | `tr1-empty-run-full.json` | CAPTURED |
| 18 | Тарифные схемы — в составе поездного формирования | — | TO FETCH (low) |
| 19 | Плата за проезд проводников грузоотправителя | — | TO FETCH (low) |
| 20 | Плата за накатку/выкатку на паромной переправе | — | TO FETCH (low) |
| 21 | Сбор за перевозку с объявленной ценностью | — | TO FETCH (low) |
| 22 | Коэффициенты повагонные/групповые отдельным поездом | `tr1-k4-full.json` (related) | PARTIAL |
| 23 | Повагонные отправки | `tr1-scheme-classifier-extended.json` | PARTIAL |
| 24 | Отправки грузов в контейнерах контейнерной отправкой | `tr1-i-belts-container.json` | CAPTURED |
| 25 | Личные/семейные грузы контейнерной отправкой | — | TO FETCH (low) |
| 26 | Мелкие отправки сборные вагоны (схема N 100) | — | TO FETCH (low) |
| 27 | Мелкие отправки личные грузы (схема N 101) | — | TO FETCH (low) |
| 28 | Отправки в термических контейнерах | — | TO FETCH (low) |
| 29 | Отправки в составе поездного формирования | — | TO FETCH (low) |
| 30 | Сборы за перегрузку/простой иностранных вагонов | — | TO FETCH (low) |
| 31 | Сборы за перевозку отдельных грузов и услуги | — | TO FETCH (low) |
| 32 | Тарифные схемы услуг по использованию инфраструктуры | — | TO FETCH (low) |
| 33 | Коэффициенты по длине/массе вагона (ОПВ N 1) | — | TO FETCH (low) |
| 34 | Коэффициенты по длине/массе вагона (ОПВ N 2) | — | TO FETCH (low) |
| 35 | Коэффициенты по длине/массе вагона (ОПВ N 3) | — | TO FETCH (low) |
| 36 | Коэффициенты организация продвижения подвижного состава | `tr1-coefficients.json` (related) | TO FETCH (low) |

## Приложение N 2 — Тарифные схемы (БАЗОВЫЕ СТАВКИ, группы И и В)

Base path: `/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/prilozhenie-n-2/`

| Sub-page slug suffix | Subject (schemes) | On-disk file | Status |
|---|---|---|---|
| `tarify-na-perevozku-gruzov-po/` | Универсальные общего парка — схема **И1** | `tr1-i-belts-full.json` | CAPTURED |
| `tarify-na-perevozki-gruzov-po/` | Специализированные общего парка — **И2–И7** | `tr1-i-belts-full.json` | CAPTURED |
| `tarify-na-perevozki-gruzov-po_1/` | Собственные универсальные — схема **N8** | `tr1-n8-corrected.json`, `tr1-i-belts-full.json` | CAPTURED |
| `tarify-na-perevozki-gruzov-po_2/` | Собственные 6-осные — **N8(1)** | `tr1-i-belts-full.json` | CAPTURED |
| `tarify-na-perevozki-gruzov-po_3/` | Собственные специализированные — **N9–N13** | `tr1-i-belts-full.json` | CAPTURED |
| `tarify-na-perevozki-nalivnykh-gruzov/` | Цистерны общего парка — **И14–И18** | `tr1-i-belts-cistern.json`, `tr1-i-belts-full.json` | CAPTURED |
| `tarify-na-perevozki-nalivnykh-gruzov_1/` | Собственные цистерны — **N19–N24** | `tr1-i-belts-cistern.json` | CAPTURED |
| `tarify-na-perevozki-po-infrastrukture/` | Собственные вагоны с локомотивом — **N25–N29 (25(1),26(1))** | — | TO FETCH (med) |
| `tarify-za-polzovanie-vagonov-obshchego/` | Пользование вагонами общего парка — группа **В1–В15** | `tr1-v-belts-full.json` | CAPTURED |
| `tarify-na-perevozki-gruzov-po_4/` | Изотермические вагоны — **N30–N31** | `tr1-i-belts-reefer.json` | CAPTURED |
| `tarify-na-probeg-spetsializirovannykh-peredvizhnykh/` | Передвижные формирования — **N32** | — | TO FETCH (low) |
| `tarify-na-perevozki-negabaritnykh-gruzov/` | 4-осные платформы негабарит — **N34–N38** | `tr1-i-belts-transporter.json` (часть) | PARTIAL |
| `tarify-na-perevozki-gruzov-gabaritnykh/` | 4/6-осные транспортёры — **N39–N43** | `tr1-i-belts-transporter.json` | CAPTURED |
| `tarify-na-perevozki-gruzov-gabaritnykh_1/` | 8-осные транспортёры — **N44–N48** | `tr1-i-belts-transporter.json` | CAPTURED |
| `tarify-na-perevozki-gruzov-gabaritnykh_2/` | 12/14-осные транспортёры — **N49–N53** | `tr1-i-belts-transporter.json` | CAPTURED |
| `tarify-na-perevozki-gruzov-gabaritnykh_3/` | 16-осные транспортёры — **N54–N58** | `tr1-i-belts-transporter.json` | CAPTURED |
| `tarify-na-perevozki-gruzov-gabaritnykh_4/` | 16-осные с отдельным локомотивом — **N59–N63** | `tr1-i-belts-transporter.json` | PARTIAL |
| `tarify-na-perevozki-gruzov-gabaritnykh_5/` | 20-осные сочленённые 300 т — **N64–N68** | `tr1-i-belts-transporter.json` | PARTIAL |
| `tarify-na-perevozki-gruzov-gabaritnykh_6/` | 28-осные сочленённые 400 т — **N69–N73** | `tr1-i-belts-transporter.json` | PARTIAL |
| `tarify-na-perevozki-gruzov-gabaritnykh_7/` | 32-осные сочленённые 500 т — **N74–N78** | `tr1-i-belts-transporter.json` | PARTIAL |
| `tarify-na-perevozki-gruzov-gabaritnykh_8/` | 24/32-осные сочленённые — **N79–N83** | `tr1-i-belts-transporter.json` | PARTIAL |
| `tarify-na-perevozki-gruzov-dlia/` | Личные нужды универсальные — **N84** | — | TO FETCH (low) |
| `tarify-na-perevozki-po-infrastrukture_1/` | Контейнеры общего парка — **N85–N89** | `tr1-i-belts-container.json` | CAPTURED |
| `tarify-na-perevozki-po-infrastrukture_2/` | Собственные контейнеры — **N90–N94** | `tr1-i-belts-container.json` | CAPTURED |
| `tarify-na-perevozki-po-infrastrukture_3/` | Контейнеры личные грузы — **N95–N99** | — | TO FETCH (low) |
| `tarify-na-perevozki-gruzov-krome/` | Мелкие отправки предпр. — **N100** | — | TO FETCH (low) |
| `tarify-na-perevozki-gruzov-dlia_1/` | Мелкие отправки личные — **N101** | — | TO FETCH (low) |
| `tarify-na-perevozki-gruzov-po_5/` | Собственные термические контейнеры — **N102–N105** | — | TO FETCH (low) |
| `tarify-na-perevozki-gruzov-po_6/` | Поездное формирование — **N110–N115** | — | TO FETCH (low) |
| `tarifnye-skhemy-na-uslugi-po/` | Занятие инфраструктуры — **ЗИ N1–N3** | — | TO FETCH (low) |
| `tarify-za-organizatsiiu-prodvizheniia-po/` | Продвижение подвижного состава — **ОПВ N1** | — | TO FETCH (low) |
| `tarify-za-organizatsiiu-prodvizheniia-po_1/` | Продвижение — **ОПВ N2–N3** | — | TO FETCH (low) |
| `tarify-za-organizatsiiu-prodvizheniia-po_2/` | Продвижение локомотива — **ОПЛ N1–N2** | — | TO FETCH (low) |

## Priority for SimpleCargo cargo-freight engine (щебень/нерудные, повагонная)

CRITICAL path already CAPTURED: Раздел II формула (п.16) + округление (п.15) + И1/И14 base (Прил.N2) + В-группа + K1 (Табл.2) + K3 (Табл.4) + K4 (Табл.5) + порожний пробег (Табл.17) + классы/МВН (Табл.1).

Remaining gaps worth fetching (medium): **Таблица N3** (directional coefficients — confirm whether separate from commodity K3), **Таблица N12** (FCL container reduction), **Прил.N2 схемы N25–N29** (own wagon + own locomotive). All other TO-FETCH rows are low priority for the current bulk-rail щебень use case.
