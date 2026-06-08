# ТР-1 2026 — EXACT computation rules (rounding, order, belt-snapping)

> Status: load-bearing reference for «в рубль» accuracy. Date: 2026-06-07.
> Companion to [TARIFF_CALCULATOR.md](./TARIFF_CALCULATOR.md) (§2 formula) and [DATA_ACQUISITION_REPORT.md](./DATA_ACQUISITION_REPORT.md) (numeric tables).
> Machine-usable params: [`scripts/seed-data/tr1-rounding-rules.json`](../../scripts/seed-data/tr1-rounding-rules.json).
>
> **Regulation:** Приказ ФАС России от 06.11.2025 № 894/25 («Тарифное руководство № 1»), рег. Минюст 22.12.2025 № 84708, в силе с 2026-01-01.
> **Application rules live in:** Приложение N 1, **Раздел II** «Порядок расчета тарифов».
> **Source (verbatim, no paywall):** `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/ii/`. Cross-check: consultant.ru LAW_522347; Прейскурант 10-01 Часть I методология (base.garant.ru/12131790/).
>
> All quotes below were extracted VERBATIM from the sudact ТР-1 2026 page during this acquisition. This is what separates «примерно» from «в рубль»: the rules below fix **where** each value rounds (to целые копейки), **in what order** the coefficients apply (пп.16.1→16.10), and **how** a distance snaps to a published пояс дальности.

---

## 1. The two things that cause a non-zero ruble diff

1. **Rounding at the wrong step / wrong precision.** ТР-1 rounds **до целых копеек** at *every* intermediate correction step (пп.16.6, 16.7.1, 16.7.2, 16.8) and the final sum **до целого рубля** (п.15.5, повагонная). Carrying full float precision to the end and rounding once gives a small but real kopeck/ruble drift versus the official engine.
2. **Wrong belt / wrong order of coefficients.** K3 (товарный, Табл.4) is applied as a *с-расстояния* correction at **16.6**; K4 (Табл.5, отправочный) at **16.7** under a **max-of-two** rule; K1 (класс) and own-wagon factors at **16.9** by sequential multiplication. Applying them in a different order, or interpolating between belts instead of snapping, shifts the result.

---

## 2. Rounding rules — VERBATIM (Russian)

### п.15.4 — intermediate rounding to целые копейки

> «При расчете тарифа на перевозку грузов по инфраструктуре РЖД в вагонах и контейнерах за пробег порожних вагонов и контейнеров и других плат, рассчитанных по тарифным схемам, установленным в приложении N 1 к Тарифному руководству, после умножения базовых ставок тарифных схем, установленных приложением N 2 к Тарифному руководству (далее - базовые ставки тарифных схем), на коэффициенты, приведенные в Тарифном руководстве, в том числе после умножения на количество тонн грузов, перевозимых наливом, тариф на перевозку грузов по инфраструктуре РЖД округляется до целых копеек.»

### п.15.5 — final rounding of the накладная sum + the half-up rule

> «Сумма тарифов за вычетом размеров уменьшения тарифов, указанных в таблицах N N 12, 13 приложения N 1 к Тарифному руководству и в подпункте 28.2 пункта 28 Тарифного руководства, проставляемая в накладной, округляется следующим образом: до целых рублей - по тарифным схемам на повагонные отправки и отправки в крупнотоннажных контейнерах, на потонные тарифы грузов, перевозимых наливом; до 0,1 рубля (целых десяти копеек) - по тарифным схемам на отправки в среднетоннажных контейнерах, на мелкие отправки грузов.»

**Half-up rule (п.15.5):** 0,5 и более единицы округления — в бóльшую сторону до целой единицы; менее 0,5 — отбрасывается. Это `round-half-up` (для положительных тарифов = round-half-away-from-zero). Тот же режим применяется к промежуточным «до целых копеек».

**Net effect for our повагонный полувагон path:** intermediate values round to **0,01 ₽**; the final накладная sum rounds to **1 ₽**.

---

## 3. Order of computation — VERBATIM (пп.16.1–16.10)

The algorithm sequence is fixed by the regulation. Quoted verbatim:

### п.16.1
> «Определяется расстояние от железнодорожной станции отправления до железнодорожной станции назначения согласно пункту 4 Тарифного руководства.»

### п.16.2
> «Устанавливаются вид отправки, предъявленного к перевозке груза по инфраструктуре РЖД (повагонная, групповая, маршрутная, контейнерная, мелкая, сборная повагонная или отправка в составе поездного формирования, не принадлежащего перевозчику РЖД), тип и принадлежность вагона, контейнера, локомотива.»

### п.16.3
> «Определяется позиция ЕТСНГ для данного груза и масса груза при повагонной, групповой, маршрутной отправках - тарифный класс груза.»

### п.16.4
> «Определяются номер тарифной схемы для данного вида отправки, установленного в соответствии с подпунктом 16.2 пункта 16 Тарифного руководства, а также коэффициенты к тарифным схемам, установленные Тарифным руководством и законодательством Российской Федерации о государственном регулировании цен (тарифов) в сфере железнодорожных перевозок.»

### п.16.5 (с подпунктом 16.5.1 — own/общий-парк универсальный полувагон/платформа)
> «По базовым ставкам тарифных схем рассчитывается тариф на перевозку груза по инфраструктуре РЖД:
>
> 16.5.1. Для универсальных полувагонов и платформ, а также специализированных платформ для лесоматериалов с длиной по осям сцепления автосцепок менее 19,6 метров общего парка повагонными, групповыми, маршрутными отправками как сумма:
> тарифа на перевозку грузов в груженом рейсе, рассчитанного умножением базовой ставки тарифных схем N N 8, 8(1) или N 9 (в зависимости от типа подвижного состава) на коэффициенты, установленные Тарифным руководством и законодательством Российской Федерации о государственном регулировании цен (тарифов) в сфере железнодорожных перевозок;
> тарифа на порожний пробег по инфраструктуре РЖД, определяемого умножением базовой ставки тарифной схемы N 25(1) за расстояние перевозки, соответствующее 60% от груженого рейса, на коэффициенты, установленные Тарифным руководством для расстояния, соответствующего 60% от груженого рейса;
> тарифа на использование вагонов общего парка (тариф группы В) за расстояние перевозки в груженом рейсе.»

> **CRITICAL read for own-wagon:** the «60% от груженого рейса» порожний rule and the «тариф группы В» term in 16.5.1 are written for вагоны **ОБЩЕГО ПАРКА** (RZD-owned). For **собственный/арендованный полувагон** (наш путь, п.18.1.1) there is **no В-component** and the порожний is the **actual return haul** by scheme N25 (not 60%, not N25(1)). See §6.

### п.16.6 — K3 (Табл.4) applied as a *с-расстояния* correction → round to копейки
> «При наличии коэффициентов, введенных с определенного расстояния перевозки и указанных в таблице N 4 приложения N 1 к Тарифному руководству, осуществляется корректировка базовой ставки тарифной схемы следующим образом: ставка на расстояние, начиная с которого вводится коэффициент, суммируется с произведением коэффициента на разницу между базовой ставкой тарифной схемы за общее расстояние перевозки и базовой ставкой тарифной схемы за расстояние, начиная с которого вводится коэффициент. Округление результата откорректированной базовой ставки тарифной схемы осуществляется до целых копеек.»

### п.16.7 — K4 (Табл.5) max-of-two correction
> «16.7. Определяется размер корректировки базовой ставки тарифной схемы с учетом коэффициентов, указанных в таблице N 5 приложения N 1 к Тарифному руководству, и применения особенностей в соответствии с подпунктом 17.2 пункта 17 Тарифного руководства, следующим образом:
>
> 16.7.1. Базовая ставка тарифной схемы на расстояние перевозки грузов или базовая ставка тарифной схемы, откорректированная, при условии применения подпункта 16.6 пункта 16 Тарифного руководства, умножается на коэффициент, указанный в таблице N 5 приложения N 1 к Тарифному руководству для общего расстояния перевозки, и рассчитывается размер увеличения (уменьшения) тарифов по сравнению с тарифами, рассчитанными без применения коэффициента, указанного в таблице N 5 приложения N 1 к Тарифному руководству. Результат округляется до целых копеек.
>
> 16.7.2. Производится умножение базовой ставки тарифной схемы или базовой ставки тарифной схемы, откорректированной согласно положениям подпункта 16.6 пункта 16 Тарифного руководства, применяемой к наибольшему расстоянию перевозки на предыдущем поясе дальности, на коэффициент, указанный в таблице N 5 приложения N 1 к Тарифному руководству, для этого пояса дальности и рассчитывается размер увеличения (уменьшения) тарифов по сравнению с тарифами, рассчитанными без применения коэффициента, указанного в таблице N 5 приложения N 1 к Тарифному руководству. Результат округляется до целых копеек.
>
> 16.7.3. Рассчитанный в соответствии с подпунктом 16.7.1 пункта 16 Тарифного руководства размер корректировки базовой ставки тарифной схемы сравнивается с размером корректировки базовой ставки тарифной схемы, рассчитанной в соответствии с подпунктом 16.7.2 пункта 16 Тарифного руководства, и к дальнейшему расчету принимается максимальная абсолютная величина увеличения (уменьшения) тарифов.»

### п.16.8 — add the 16.7 correction onto the 16.6-corrected base → round
> «Рассчитанный в соответствии с подпунктом 16.7 пункта 16 Тарифного руководства размер корректировки базовой ставки тарифной схемы суммируется с откорректированной в соответствии с подпунктом 16.6 пункта 16 Тарифного руководства базовой ставкой тарифной схемы. Результат округляется до целых копеек.»

### п.16.9 — sequential multiplication by remaining coefficients (K1 class, own-wagon factors)
> «Далее последовательно методом умножения дополнительно применяются коэффициенты, предусмотренные Тарифным руководством и законодательством Российской Федерации о государственном регулировании цен (тарифов) в сфере железнодорожных перевозок.»

### п.16.10 — subtract tariff reductions
> «Рассчитывается размер уменьшения тарифа на перевозку грузов по инфраструктуре РЖД, предусмотренного в Тарифном руководстве, и вычитается из полученных тарифов на перевозку грузов по инфраструктуре РЖД.»

---

## 4. Табл.5 (K4) belt-boundary rule — VERBATIM (пп.17.1–17.3)

### п.17.1
> «При перевозке грузов по инфраструктуре РЖД в универсальных, специализированных вагонах и цистернах в зависимости от количества вагонов в отправке (повагонная, групповая) и применяемой грузоотправителем технологии перевозки грузов (отправительский маршрут) к тарифным схемам N N И1 - И7, N N И14 - И18, N 8, N 8(1), N N 9 - 13, N N 19 - 24, N 31 применяются коэффициенты, указанные в таблице N 5 приложения N 1 к Тарифному руководству.»

### п.17.2 — the absolute-value floor at пояс boundaries (this IS the max-of-two)
> «При применении коэффициента абсолютная величина увеличения (уменьшения) тарифов на перевозку грузов по инфраструктуре РЖД при переходе на последующую градацию пояса дальности не должна быть меньше абсолютной величины увеличения (уменьшения) тарифов на перевозку грузов по инфраструктуре РЖД на наибольшем расстоянии предыдущего пояса.»

### п.17.3
> «Коэффициенты, указанные в таблице N 5 приложения N 1 к Тарифному руководству, для маршрутных отправок применяются в случаях, когда в графе 1 'Особые отметки' накладной проставлена отметка 'Отправительский маршрут N ___ прямой' или 'Отправительский маршрут N ___ с распылением на станции ______'.»

---

## 5. Distance-belt snapping + МВН / per-wagon vs per-ton

### Distance belts — SNAP, do not interpolate
The Прил.N2 rate tables (incl. scheme N8) have **explicit пояса дальности rows** with non-uniform widths that widen with distance (e.g. `0-5, 6-10, …, 1451-1500, 1551-1600, 1601-1700, …`). A distance `L` falls into the belt whose `[distFromKm, distToKm]` covers it (both ends inclusive). The official ТР-1 grid itself **folds some intermediate ranges** (e.g. `1501-1550` is absent from N8); for an `L` landing in such a published gap, **SNAP to the nearest published belt — never interpolate or fabricate a value**. There is no linear interpolation anywhere in Раздел II; п.16.6 is a step-wise *с-расстояния* correction, not interpolation.

### Weight grid (schemes N8/N8(1)/И1) — also snap, and the МВН floor — п.18.2 (VERBATIM)
> «18.2. Тариф на перевозку грузов по инфраструктуре РЖД по тарифным схемам N N И1, 8, 8(1) рассчитывается за общую массу груза в универсальном вагоне, но не менее МВН, установленной для соответствующих грузов и приведенной в таблице N 1 приложения N 1 к Тарифному руководству, в зависимости от тарифного класса груза.»

Over-max rule (when actual mass exceeds the scheme's max weight row): «рассчитывается ставка за 1 тонну путем деления тарифов по последней строке базовых ставок тарифных схем на максимальное значение массы груза соответствующей тарифной схемы; полученная ставка за 1 тонну умножается на общую массу груза в универсальном вагоне, но не менее МВН».

So for N8: `chargeable_tons = max(actual_tons, МВН)`, then look up the rate at the **weight row** = chargeable_tons (grid is integer tonnes 10..80) × the matched distance belt. The result is a **per-wagon** ruble figure (за общую массу в вагоне), *not* per-ton, as long as chargeable ≤ scheme max.

### per-wagon vs per-ton
- **Own/общий-парк универсальный полувагон (N8):** **за вагон** (за общую массу груза в вагоне, но не менее МВН). Our path.
- **В-составляющая (общий парк):** за вагон, независимо от массы — **not applied for own wagons**.
- **Наливные/цистерны (схемы 19-24, И14-И18):** за 1 тонну × масса (п.21.2). Not our path.

### Minimum charge floor
There is **no general ruble minimum tariff** in Раздел II. The **only** floor is the **weight floor МВН** (`chargeable = max(actual, МВН)`). (Налив has weight minimums like 22 т, п.21.4 — not our path.) Verified by scanning «минимальн» across Раздел II.

### Own-полувагон class factors — п.18.1.1 (VERBATIM)
> «18.1.1. Тариф на перевозку грузов по инфраструктуре РЖД в собственных (арендованных) универсальных вагонах (крытые, платформы, полувагоны) повагонными, групповыми, маршрутными отправками рассчитывается по тарифным схемам N N 8, 8(1) в зависимости от типа подвижного состава, рода груза и направления перевозки.
> Дополнительно при перевозке грузов по инфраструктуре РЖД в полувагонах в зависимости от тарифного класса груза применяются следующие коэффициенты:
> первый класс - 0,9346;
> второй класс - 0,9592;
> третий класс - 0,9774.»

---

## 6. UNAMBIGUOUS pseudocode — own-wagon полувагон class-1 нерудные path

> Inputs: `L_km` (gruzhenyy, from ТР-4), `L_empty_km` (actual return haul), `actual_tons`, ЕТСНГ class=1, нерудные (231-236), wagon=полувагон own.
> Tables: `N8` (вес×расстояние grid), `N25` (порожний), `class_coeff` (K1 Табл.2), `distance_corr` (K4 Табл.5, shipmentGroup="1" for single повагонная), K3=0,77 (Табл.4 нерудный), нерудный-полувагон ×0,909 (Табл.4 п.1.5), own-полувагон class-1 ×0,9346 (п.18.1.1), порожний надбавка ×1,1.
> `round01(x)` = round-half-up to 0,01 ₽. `round1(x)` = round-half-up to 1 ₽.

```
# ── 16.1–16.4: setup ─────────────────────────────────────────────
L          = L_km                       # 16.1 (ТР-4 distance, integer km)
shipment   = "wagon"                    # 16.2 повагонная single → shipmentGroup "1"
class      = 1                          # 16.3 ЕТСНГ → class
mvn        = МВН(etsng)                 # 18.2 ; нерудные щебень → г/п (~69-71 т полувагон г/п)
chargeable = max(actual_tons, mvn)      # 18.2 weight floor (the ONLY floor)
iScheme    = "N8"                       # 16.4 own полувагон груженый
emptyScheme= "N25"                      # own полувагон порожний (full distance)

# ── 16.5: base rate from N8 grid (за вагон, за общую массу) ───────
wRow       = snapWeightRow(chargeable)         # snap to integer-tonne row 10..80
belt       = snapBelt(N8, L)                   # SNAP to published пояс; do NOT interpolate
if chargeable > N8.maxWeight:                  # 18.2 over-max → per-ton
    perTon = N8.lastRow(belt) / N8.maxWeight
    base   = round01(perTon * chargeable)
else:
    base   = N8.rate(wRow, belt)               # already целые копейки in table

# ── 16.6: K3 commodity (Табл.4), applied с-расстояния ────────────
# нерудный K3=0,77 applies from km 1 (whole haul) → degenerate с-расстояния:
#   corrected = rate(L_from) + K3 * (rate(L) - rate(L_from))  with L_from=1 ⇒ ≈ K3*rate
base_K3 = round01( base * 0.77 )               # п.16.6 round to копейки
#   (if a Табл.4 coef were introduced only beyond some km, use the full 16.6 delta formula)

# ── 16.7: K4 (Табл.5) отправочный, MAX-OF-TWO ───────────────────
k4_now  = distance_corr("1", belt_of(L))       # coef for общее расстояние
k4_prev = distance_corr("1", belt_of(prevBeltMaxDist))
delta1  = round01( base_K3 * k4_now  - base_K3 )                 # 16.7.1
ratePrev= N8.rate(wRow, prevBelt) * 0.77                          # base at prev belt max
delta2  = round01( ratePrev * k4_prev - ratePrev )               # 16.7.2
corr    = max_abs(delta1, delta2)              # 16.7.3 max absolute value (signed kept)

# ── 16.8: add correction onto 16.6 base ─────────────────────────
i_after_belt = round01( base_K3 + corr )       # п.16.8 round

# ── 16.9: sequential × remaining coefficients ───────────────────
i_k1   = round01( i_after_belt * K1(class=1, L) )   # Табл.2 class taper (0,75→0,55)
i_ner  = round01( i_k1 * 0.909 )                    # Табл.4 п.1.5 нерудный-полувагон
i_own  = round01( i_ner * 0.9346 )                  # п.18.1.1 own-полувагон class-1
#   (spec models 12-9761-02 etc: additional × 0,9595 here)
I_loaded = i_own                                # И-часть гружёного рейса

# ── 16.10: subtract reductions (none for inert stone) ───────────
I_loaded = round01( I_loaded - reductions )    # reductions=0 here

# ── порожний (own wagon = actual haul, NOT 60%) ─────────────────
empty_belt = snapBelt(N25, L_empty_km)
empty_base = N25.rate(empty_belt)
empty      = round01( empty_base * 1.1 )       # надбавка ×1,1 (Приказ ФАС 999/24)
#   K4/Табл.5 on порожний if applicable, same max-of-two pattern

# ── total (no В for own wagon) ──────────────────────────────────
PP_bezNDS = round1( I_loaded + empty )         # п.15.5 итог → целый рубль
#   NOTE: indexation +10% is ALREADY in N8/N25 base — do NOT re-apply.

# ── НДС last (outside Раздел II) ────────────────────────────────
NDS  = (traffic == "domestic") ? 0.22 : 0.0
KP   = round1( PP_bezNDS * (1 + NDS) )         # 22% domestic 2026 / 0% export
```

### Rounding-step map (where each round happens)
| Step | пункт | Operation | Round to |
|---|---|---|---|
| base from N8 grid | 16.5 | table lookup | (table is целые копейки) |
| K3 commodity | 16.6 | × 0,77 (с-расстояния) | **0,01 ₽** |
| K4 size now | 16.7.1 | corr on общее расст. | **0,01 ₽** |
| K4 size prev | 16.7.2 | corr on prev-belt max | **0,01 ₽** |
| K4 max-of-two | 16.7.3 | pick max abs | — |
| add K4 corr | 16.8 | base_K3 + corr | **0,01 ₽** |
| K1 class | 16.9 | × taper | **0,01 ₽** |
| нерудный-полувагон | 16.9 | × 0,909 | **0,01 ₽** |
| own-полувагон | 16.9 | × 0,9346 | **0,01 ₽** |
| reductions | 16.10 | − уменьшения | **0,01 ₽** |
| порожний надбавка | — | × 1,1 | **0,01 ₽** |
| **итог накладной** | **15.5** | I + порожний | **1 ₽** |
| НДС | (вне Разд.II) | × (1+ставка) | **1 ₽** |

---

## 7. Things explicitly NOT in Раздел II (apply outside, in this order, last)
1. **Индексация** — not in the application rules; the +10% (2025-12-01) is **already baked into** Прил.N2 base rates. Re-applying double-counts. (See `tr1-coefficients.json`.)
2. **НДС** — tariffs are net (без НДС). Apply **last**, on the п.15.5 итог: 22% domestic (2026) / 0% export-international.

## 8. Residual NEEDS-VERIFICATION
- **K3 «с-расстояния» degeneracy:** нерудный K3=0,77 in `tr1-coefficients.json` is modeled as applying to the whole haul (from km 1). If Табл.4 introduces it only beyond a threshold km, the full п.16.6 delta formula (not a flat ×0,77) must be used — confirm the Табл.4 «с расстояния» column for positions 231-236 cell-by-cell.
- **K4 on порожний:** whether Табл.5 max-of-two also applies to the N25 порожний leg for own wagons (п.17.1 lists scheme 8/8(1) but порожний schemes N25-29 are addressed separately) — confirm against Табл.5 applicability list.
- **prevBeltMaxDist** for 16.7.2 = the max distance of the immediately preceding пояс дальности row in the *same* scheme grid — read from the N8 belt boundaries already in `tr1-rate-belts.json`.
