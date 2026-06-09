# Раздел II. Тарифы на перевозки грузов (пп. 15–25) — ОСНОВНАЯ ФОРМУЛА

> **Primary source (verbatim, no paywall):** `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/ii/`
> **Document:** Приказ ФАС России от 06.11.2025 № 894/25 («Тарифное руководство № 1»), рег. Минюст 22.12.2025 № 84708, в силе с 2026‑01‑01 (заменил Прейскурант 10‑01).
> **Acquisition status:** The full verbatim text of пп. 15.4, 15.5, 16.1–16.10 (incl. 16.5.1), 17.1–17.3, 18.1.1, 18.2 was already extracted VERBATIM during a prior session and lives in `docs/planning/TARIFF_RULES_EXACT.md`. This chunk is the §II rulebook node: it (1) re‑states the load‑bearing verbatim quotes, (2) explains in plain Russian HOW each rule enters the tariff computation (step / multiplier / unit), (3) maps the per‑wagon‑type schemes of пп. 18–25 to on‑disk seed files, and (4) flags everything that EXTENDS or CONTRADICTS the current engine/seed.
> **Re‑fetch note (this session):** The `WebFetch` summarizer refuses long verbatim blocks (internal ~120‑char quote cap), so the long quotes below are cited from the already‑verified on‑disk capture in `TARIFF_RULES_EXACT.md`. The page structure (which пп. exist, which schemes each references) WAS re‑confirmed live against the URL this session — see “Live structure confirmation” at the end. No number below is invented; rows that could not be rendered verbatim are flagged `UNFETCHABLE-HERE` with the on‑disk location that already holds them.

---

## 0. How §II fits the whole calculation (orientation)

§II is the **method**: it fixes the *order* in which schemes and coefficients combine and *where* each step rounds. The *values* live elsewhere:
- base scheme rates (groups И / В / N8 / N25…) → **Приложение N 2** (on disk: `tr1-i-belts-*.json`, `tr1-n8-corrected.json`, `tr1-v-belts-full.json`, `tr1-empty-run-full.json`)
- coefficients K1/K3/K4/etc. → **Приложение N 1, Таблицы N 1–36** (on disk: `tr1-k1-full.json`, `tr1-class-coeff.json`, `tr1-k3-full.json`, `tr1-k4-full.json`, `tr1-coefficients.json`)
- classes & МВН → **Табл. N 1** (`tr1-classifier-full.json`, `etsng-classes.json`, `tr1-min-weight-norms.json`)

Machine‑usable distillation of §II already exists: `scripts/seed-data/tr1-rounding-rules.json` (rounding precision per step, coefficient order, belt‑snap, per‑ton vs per‑wagon, minimum‑charge). §II is the **legal anchor** that file points back to.

---

## 1. п. 15 — Округление массы и тарифа

### п. 15.4 — промежуточное округление **до целых копеек** (VERBATIM)
> «При расчете тарифа на перевозку грузов по инфраструктуре РЖД в вагонах и контейнерах за пробег порожних вагонов и контейнеров и других плат, рассчитанных по тарифным схемам, установленным в приложении N 1 к Тарифному руководству, после умножения базовых ставок тарифных схем, установленных приложением N 2 к Тарифному руководству (далее - базовые ставки тарифных схем), на коэффициенты, приведенные в Тарифном руководстве, в том числе после умножения на количество тонн грузов, перевозимых наливом, тариф на перевозку грузов по инфраструктуре РЖД округляется до целых копеек.»
> — `TARIFF_RULES_EXACT.md` §2 (verbatim from the §II URL). Re‑confirmed live: п. 15 heading = «Округление массы отправки и тарифа на перевозку грузов по инфраструктуре РЖД».

**How it enters the calc:** every intermediate product (base × coefficient, including ×тонны for наливных) **rounds to 0,01 ₽** *at that step* — not carried as a float to the end. In the engine this is `round01()` applied after п. 16.6, 16.7.1, 16.7.2, 16.8 (see `tr1-rounding-rules.json`). Unit: рубли, precision 0,01.

### п. 15.5 — итоговое округление накладной + правило half‑up (VERBATIM)
> «Сумма тарифов за вычетом размеров уменьшения тарифов, указанных в таблицах N N 12, 13 приложения N 1 к Тарифному руководству и в подпункте 28.2 пункта 28 Тарифного руководства, проставляемая в накладной, округляется следующим образом: до целых рублей - по тарифным схемам на повагонные отправки и отправки в крупнотоннажных контейнерах, на потонные тарифы грузов, перевозимых наливом; до 0,1 рубля (целых десяти копеек) - по тарифным схемам на отправки в среднетоннажных контейнерах, на мелкие отправки грузов.»
> — `TARIFF_RULES_EXACT.md` §2 (verbatim).

**Half‑up rule (п. 15.5):** 0,5 и более единицы округления → в бóльшую сторону; менее 0,5 → отбрасывается ⇒ `round-half-up` (= round‑half‑away‑from‑zero for positive tariffs). Same mode for the intermediate “до целых копеек”.

**How it enters the calc:** the **final** накладная sum rounds **to whole rubles** for повагонные / крупнотоннажные контейнеры / потонные наливные — which is exactly the SimpleCargo щебень path (`round1()`). 0,1 ₽ precision applies only to среднетоннажные контейнеры / мелкие отправки (not our path).

> EXTENDS engine: confirms the final‑sum subtraction of Табл. N12/N13 reductions happens **before** the whole‑ruble round. The engine currently has no FCL/контрейлер reductions wired (Табл. N12 is still `TO FETCH` per `00-index`), so this is inert for щебень but must be honored if container КП is added.

---

## 2. п. 16 — Последовательность расчёта (пп. 16.1–16.10) — THE ALGORITHM

Page heading re‑confirmed live: «Тарифы на перевозки грузов по инфраструктуре РЖД рассчитываются следующим образом». The full verbatim of **16.1, 16.2, 16.3, 16.4, 16.5 (+16.5.1), 16.6, 16.7 (+16.7.1/.2/.3), 16.8, 16.9, 16.10** is in `TARIFF_RULES_EXACT.md` §3. Step map (verbatim quotes there; plain‑Russian effect here):

| п. | Что делает (verbatim subject) | Эффект в расчёте | Округление / единица |
|---|---|---|---|
| 16.1 | определяется расстояние ст. отпр.→ст. назн. по п. 4 | вход `L_km` (по инфраструктуре РЖД; у нас — граф ТР‑4) | целые км |
| 16.2 | устанавливаются вид отправки, тип и принадлежность вагона/контейнера/локомотива | выбирает ветку (повагонная/групповая/маршрутная/контейнерная/мелкая/сборная/поездное формирование) + own vs общий парк | — |
| 16.3 | позиция ЕТСНГ; при повагонной/групповой/маршрутной — тарифный класс груза | класс (1/2/3) → K1 (Табл. N2); ЕТСНГ → K3/МВН | — |
| 16.4 | номер тарифной схемы + перечень применимых коэффициентов | привязка вагон→схема (`tr1-scheme-classifier-extended.json`) | — |
| 16.5 | по базовым ставкам считается тариф; **16.5.1** для универс. полувагонов/платформ **общего парка** | базовая ставка из Прил. N2 (N8 grid) **за вагон, за общую массу** | табличные целые копейки |
| 16.6 | K3 (Табл. N4) применяется как поправка **с‑расстояния** (не множитель «в лоб») | `rate(L_from) + K3·(rate(L) − rate(L_from))` | → **до целых копеек** |
| 16.7 | размер корректировки по K4 (Табл. N5): 16.7.1 на общее расст., 16.7.2 на макс. расст. пред. пояса, **16.7.3 берётся max абс. величина** | K4 belt‑correction = **max‑of‑two** | → **до целых копеек** |
| 16.8 | корректировка 16.7 суммируется с базой, откорректированной по 16.6 | складывает K4‑дельту на K3‑базу | → **до целых копеек** |
| 16.9 | далее **последовательно методом умножения** применяются прочие коэффициенты | K1 (класс), own‑полувагон класс‑факторы (18.1.1), нерудный‑полувагон ×0,909 и т.п. | per multiplier |
| 16.10 | рассчитывается размер уменьшения тарифа и **вычитается** | минус уменьшения (Табл. N12/13, п. 28.2) | → к итогу п. 15.5 |

### п. 16.5.1 — собственные/общий‑парк универсальный полувагон/платформа (VERBATIM, CRITICAL)
> «16.5.1. Для универсальных полувагонов и платформ, а также специализированных платформ для лесоматериалов с длиной по осям сцепления автосцепок менее 19,6 метров общего парка повагонными, групповыми, маршрутными отправками как сумма:
> тарифа на перевозку грузов в груженом рейсе, рассчитанного умножением базовой ставки тарифных схем N N 8, 8(1) или N 9 (в зависимости от типа подвижного состава) на коэффициенты…;
> тарифа на порожний пробег по инфраструктуре РЖД, определяемого умножением базовой ставки тарифной схемы N 25(1) за расстояние перевозки, соответствующее **60% от груженого рейса**, на коэффициенты…;
> тарифа на использование вагонов общего парка (**тариф группы В**) за расстояние перевозки в груженом рейсе.»
> — `TARIFF_RULES_EXACT.md` §3 (verbatim).

**So для ОБЩЕГО ПАРКА полувагона тариф = (груж. рейс N8/8(1)/9 ×коэфф.) + (порожний N25(1) на 60% расст. ×коэфф.) + (группа В на груж. расст.).** Three components.

> **CONTRADICTS naïve own‑wagon read — already flagged in engine.** п. 16.5.1 is written for **общий парк**. For **собственный/арендованный полувагон** (SimpleCargo щебень path, п. 18.1.1) there is **NO группа‑В component**, and the порожний is the **actual return haul по схеме N 25** — **not** 60%, **not** N 25(1). The engine encodes this correctly (`vScheme=null` for own; `emptyScheme="N25"` full distance). Keep this distinction load‑bearing — мисчитать В‑составляющую на собственный вагон = завышение тарифа.

---

## 3. п. 17 — Коэффициенты K4 при повагонной/групповой/маршрутной (VERBATIM gist)

Full verbatim 17.1 (scheme list И1–И7, И14–И18, 8, 8(1), 9–13, 19–24, 31), 17.2 (the absolute‑value floor at пояс boundaries = the max‑of‑two), 17.3 (маршрут “Отправительский маршрут N…”) is in `TARIFF_RULES_EXACT.md` §4.

**How it enters:** п. 17.2 is the legal basis for the **max‑of‑two** rule used in 16.7.3 — at a пояс‑дальности boundary the K4 increase/decrease may not be smaller than at the max distance of the previous belt. Machine form: `tr1-k4-full.json` + `tr1-rounding-rules.json`. Маршрутный coefficient (17.3) only with the накладная mark — irrelevant to single повагонная (shipmentGroup “1”).

---

## 4. пп. 18–25 — Схемы по типам вагонов (per‑wagon‑type computation)

Each point is «Тариф … рассчитывается следующим образом» specialized by wagon/shipment type. **First‑sentence subject + referenced scheme numbers were re‑confirmed live this session** against the §II URL. Long bodies are `UNFETCHABLE-HERE` via the summarizer; structure + on‑disk machine table noted per row.

| п. | Тип / вид отправки (live‑confirmed subject) | Схемы (live‑confirmed) | On‑disk machine table | Status |
|---|---|---|---|---|
| **18** | Универсальные вагоны (крытые, платформы, полувагоны); подпункты 18.1, 18.1.1, 18.1.2, 18.1.3, 18.2, 18.3 | И1, 8, 8(1), 25(1), В1, В3, В4 | `tr1-i-belts-full.json`, `tr1-n8-corrected.json`, `tr1-v-belts-full.json`, `tr1-empty-run-full.json`, `tr1-scheme-classifier-extended.json` | **CAPTURED** (наш путь) |
| **19** | Сборная повагонная отправка в универсальных вагонах | И1, 8, 25(1), В1, В3, В4 | `tr1-scheme-classifier-extended.json` | PARTIAL |
| **20** | Специализированные вагоны | И2–И7, 9–13, В1–В14 | `tr1-i-belts-full.json`, `tr1-scheme-classifier-extended.json` | PARTIAL |
| **21** | Наливные грузы в цистернах; подпункты 21.1, 21.2, 21.3, 21.4 | И14–И17, 19–23, В6, В7, В9, В12, В14 | `tr1-i-belts-cistern.json` | CAPTURED (не наш путь) |
| **22** | Специализированные изотермические вагоны | И3, И6, И7, 30, 31, В6, В13 | `tr1-i-belts-reefer.json` | CAPTURED |
| **23** | Грузы в контейнерах и порожние контейнеры | 85–94 (контейнерные) | `tr1-i-belts-container.json` | PARTIAL |
| **24** | Рефрижераторные вагоны | 30–31 | `tr1-i-belts-reefer.json` | PARTIAL |
| **25** | Транспортёры (грузы на транспортёрах) | 34–58 (по осности) | `tr1-i-belts-transporter.json` | PARTIAL |

> **Note on пп. 24/25 numbering:** the live re‑fetch returned п. 24 = рефрижераторные (схемы 30–31) and п. 25 = транспортёры (схемы 34–58). The `00-index-prikaz-894-25.md` master note (line 25) instead summarizes п. 22 = изотермические, п. 23 = контейнеры, п. 24 = контрейлерные, п. 25 = мелкие отправки сборные. **DISCREPANCY FLAGGED:** the summarizer’s scheme attributions for 22–25 are likely conflated (e.g. it tied контейнеры to 85–94 under п. 23 but also gave изотермические schemes under 22). The authoritative per‑point body text is `UNFETCHABLE-HERE` through the summarizer — **resolve by reading the rendered §II page directly** (or the per‑table sub‑pages already enumerated in `00-index`) before relying on пп. 22–25 numbering. Do NOT treat the 22–25 scheme map above as rule‑grade; only пп. 18 and 21 are cross‑checked against captured bodies on disk.

### п. 18 — universal wagons (наш путь), key sub‑points VERBATIM
- **п. 18.1.1** own/leased universal class factors (полувагон): класс 1 = **0,9346**; класс 2 = **0,9592**; класс 3 = **0,9774** — verbatim in `TARIFF_RULES_EXACT.md` §5. Enters at step 16.9 (sequential ×).
- **п. 18.2** weight basis + МВН floor: «…рассчитывается за общую массу груза в универсальном вагоне, но не менее МВН…» + over‑max per‑ton rule («ставка за 1 тонну путем деления тарифов по последней строке … на максимальное значение массы … умножается на общую массу … но не менее МВН») — verbatim in `TARIFF_RULES_EXACT.md` §5. Enters at step 16.5: `chargeable = max(actual, МВН)`; per‑wagon unless over scheme max → per‑ton.

---

## 5. Per‑ton vs per‑wagon & minimum charge (derived from §II, VERBATIM‑backed)
- **Own/общий‑парк универсальный полувагон (N8):** **за вагон** (за общую массу, но не менее МВН). SimpleCargo path.
- **В‑составляющая (общий парк):** за вагон, независимо от массы — **NOT applied for own wagons** (see 16.5.1 flag).
- **Наливные/цистерны (19–24, И14–И18):** **за 1 тонну × масса** (п. 21.2). Not our path.
- **Minimum charge:** there is **no general ruble minimum** in §II; the **only** floor is the **weight floor МВН** (`chargeable = max(actual, МВН)`). Налив has weight minimums (e.g. 22 т, п. 21.4) — not our path. (Verified by scanning «минимальн» across §II — `TARIFF_RULES_EXACT.md` §5.)

---

## 6. EXTENDS / CONTRADICTS the current engine & seed — explicit list
1. **CONTRADICTS (already correctly handled):** п. 16.5.1’s «60% + N25(1) + группа В» is **общий‑парк only**. Own полувагон = full‑distance N25, no В. Engine: `vScheme=null`, `emptyScheme="N25"`. ✅ Honor this; do not regress.
2. **EXTENDS:** п. 15.5 subtracts Табл. N12/N13 reductions **before** the whole‑ruble round. Табл. N12 (FCL container reduction) is still `TO FETCH` (`00-index` row 44). Inert for щебень, mandatory if container КП ships.
3. **CONFIRMS:** rounding precision per step (16.6/16.7.1/.2/16.8 → 0,01 ₽; final → 1 ₽ for повагонная) matches `tr1-rounding-rules.json`.
4. **CONFIRMS:** K4 max‑of‑two (16.7.3 / 17.2) and K3 с‑расстояния correction (16.6) — both encoded; legal anchor now pinned.
5. **OPEN / FLAGGED:** пп. 22–25 per‑point scheme attribution is **unresolved between the summarizer and `00-index`** (рефрижераторные vs изотермические vs контейнеры vs контрейлерные vs транспортёры). Not rule‑grade until the rendered §II body is read directly. Affects only non‑полувагон branches.
6. **OPEN (pre‑existing, from §5 of TARIFF_RULES_EXACT.md):** whether K4 (Табл. N5) also applies to the N25 порожний leg for own wagons — 17.1 lists schemes 8/8(1) but порожний schemes 25–29 are addressed separately. Confirm against Табл. N5 applicability list (`tr1-k4-full.json`).

---

## 7. Live structure confirmation (this session)
Re‑fetched `…/prilozhenie-n-1/ii/` and confirmed the following are present as headings: п. 15 «Округление массы отправки и тарифа…», п. 16 «…рассчитываются следующим образом», п. 17 «Применение коэффициентов…», and пп. 18–25 each opening «Тариф … рассчитывается следующим образом». Sub‑point inventory confirmed: п. 18 → 18.1, 18.1.1, 18.1.2, 18.1.3, 18.2, 18.3; п. 21 → 21.1, 21.2, 21.3, 21.4. The long verbatim bodies were NOT re‑pasted here because the fetch summarizer caps quotes (~120 chars) and refuses long blocks; the authoritative verbatim already lives in `docs/planning/TARIFF_RULES_EXACT.md` (extracted directly from the same URL in a prior session). **No coefficient, belt cell, or scheme number in this file was invented; unrenderable bodies are marked `UNFETCHABLE-HERE` with their on‑disk location.**
