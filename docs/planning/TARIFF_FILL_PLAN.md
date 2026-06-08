# TARIFF FILL PLAN — driving the FREE RZD tariff calculator to ideal

> Source of truth for this plan: 20 adversarially-verified research findings (2026-06-07) +
> on-disk verification of `src/lib/tariff/computeTariffN8.ts`, `scripts/seed-data/*`, and
> `src/lib/tariff/goldenUniversal.test.ts`. Every value below is tagged
> **sourced-official** / **sourced-unofficial** / **inferred** / **fitted**.
> This calculator computes real money paid to РЖД — no value here is fabricated. Where a fact
> was not found in a primary source it is marked **not-found**.
>
> Primary regulatory baseline: Прейскурант 10-01 superseded 2026-01-01 by «Тарифное руководство №1»,
> Приказ ФАС 06.11.2025 № 894/25 (с изм. 13.02.2026), Минюст 22.12.2025 № 84708.
> Free full text: sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/ (paginated HTML).

---

## STATUS LEGEND

| Tag | Meaning |
|-----|---------|
| ✅ READY | Sourced-official, verdict `real`, can be applied to disk now without new operator data |
| ⚠️ READY-CONFLICT | Sourced-official BUT contradicts a passing oracle — needs a decision/код-comment, not a blind flip |
| 🔒 NEEDS-DATA | Cannot close without operator-only input (more квитанции / paid matrix / wagon registry) |
| 📦 STRUCTURE-ONLY | Rule/scheme structure sourced, but numeric belts not yet seeded |

---

# PART A — THE 3 FITTED LEVERS

## Lever 1 — 699 km short-haul K4 `SHORT_HAUL_BOUNDARY_UPLIFT = 1.0057499686370497`

**Where it lives:** `src/lib/tariff/computeTariffN8.ts:50` (constant) and `:155` (applied in `resolveK4`, short-haul branch), flagged `fitted:true`.

**Sourced fact (the rule itself — VERBATIM, sourced-official):**
The belt-boundary "max-of-two" mechanism is now fully sourced. It is **п.16.7.1 / 16.7.2 / 16.7.3** of ТР-1 894/25 Раздел II, with the floor stated in **п.17.2**. Verbatim (re-verified live on sudact, stored in `docs/planning/TARIFF_RULES_EXACT.md` lines 64-96):
- п.16.7.1: correction computed on the **full** distance with that belt's Табл.5 coefficient, rounded to целые копейки.
- п.16.7.2: correction computed at the **max distance of the previous пояс дальности** with that belt's coefficient, rounded to целые копейки.
- п.16.7.3: take the **maximum absolute value** of the two corrections.
- п.17.2 (floor): "абсолютная величина увеличения (уменьшения) тарифов … при переходе на последующую градацию пояса дальности не должна быть меньше абсолютной величины … на наибольшем расстоянии предыдущего пояса."
- п.17.1: applies Табл.5 to schemes И1-И7, И14-И18, **N8, N8(1)**, 9-13, 19-24, 31 (covers our own-ПВ path).

Source: `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/ii/` — **official**. Verdict: `real`, `supportsFinding: true`.

**Does it kill the lever?** ❌ **NO.** Having the verbatim rule does **not** make the 699 km oracle close. `tr1-k4-full.json` honestly documents that the effective K4 the квитанция demands (ЭТ201459, 31224 ₽/wagon) = **0.9856349692643086**, which lies BETWEEN sourced row "6-20"@511-1000 (0.98 → 31045, under by 179₽) and the boundary value 1.00 (31679, over by 455₽), and is **not** reproduced by the verbatim max-of-two (row 1 → 1.04 → over). The 1.00575 uplift stays a **pure fit constant**. The residual is most likely in **K1(699)** or the **N8 weight-row (68t vs 70t)**, NOT K4 — but K1 Табл.2 and the N8(70,699)=64570 cell are both independently sourced-official and verified (see Part C), which sharpens the suspicion onto the **assumed chargeable weight / actual wagon count** of the receipt.

**Apply now (✅):** Implement the verbatim п.16.7.1/16.7.2/16.7.3 + п.17.2 max-of-two faithfully in `resolveK4` for the **long-haul** branch (already correct in spirit) AND add the **short-haul** belt-boundary computation per the same mechanism (delta1 vs delta2 across the previous пояс). Even though it won't close 699, it replaces the magic `> 2000` branch with the sourced general algorithm. Update the код comment at `:42-50` to cite п.16.7.1-3/17.2 and TARIFF_RULES_EXACT.md instead of "text not available".

**Needs operator data (🔒):** An **R-Тариф reference for a short haul (<1000 km, групповая, own ПВ, class-1 нерудные)** OR the actual ЭТ201459 квитанция header (exact wagon count + chargeable tonnage per wagon). This is the only way to disambiguate K1(699) vs N8-weight-row vs K4 without fitting. Until then the 1.00575 constant must stay, flagged `fitted:true` (do not present as sourced).

---

## Lever 2 — 2444 km long-haul K4 row-selection (`max-of-two → 1.01`)

**Where it lives:** `src/lib/tariff/computeTariffN8.ts:140-150` (`> 2000` branch, `fitted:false`).

**Sourced fact (Табл.5 + п.17.1, VERBATIM, sourced-official):**
Full Табл.5 verified byte-for-byte (matches `tr1-k4-corrected.json`, 28/28 cells):

| Строка (вагонов) | До 510 | 511-1000 | 1001-2000 | Свыше 2000 |
|---|---|---|---|---|
| 1 | 1,08 | 1,04 | 1,03 | **1,01** |
| 2 | 1,02 | 1,01 | 1,01 | 1,00 |
| 3-5 | 1,00 | 1,00 | 1,00 | 1,00 |
| 6-20 | 0,97 | 0,98 | 1,00 | **1,00** |
| свыше 20 | 0,95 | 0,97 | 0,98 | 1,00 |
| маршрут прямой | 0,85 | 0,89 | 0,92 | 0,95 |
| маршрут с распылением | 0,90 | 0,92 | 0,95 | 0,97 |

Row selection rule **п.17.1 (verbatim):** by **number of wagons in the отправка** (повагонная/групповая) — so a 15-wagon групповая maps to row **6-20** = **1,00** at >2000 km.
Source: `.../tablitsa-n-5/` and `.../ii/` — **official**.

**Does it kill the lever?** ⚠️ **NO — it CONFLICTS and must NOT be flipped to 1.00.** Verbatim п.17.1 says групповая → row 6-20 → 1.00 at >2000 km. But **TWO independent real oracles** both require **1.01**:
- ЭФ164189 Возрождение→Гремячая 2444 km (15 wag групповая) → reproduces to the ruble only with K4=1.01.
- R-Тариф Элисенваара→Элиста 3108 km, **confirmed 6-wagon групповая** (мрамор 232215), → 82816 ₽/wagon only with K4=1.01 (`goldenUniversal.test.ts:100-116`, asserts `k4Fitted=false`).

So "wrong wagon count" cannot be the general explanation; two групповые long-hauls both need 1.01. The engine reproduces them via `max(row, row-1)` attributed to п.16.7, which is **oracle-validated (2 points) but not source-traced for WHY 1.01**. The verbatim п.17.1 genuinely conflicts with two paid квитанции.

**Apply now (✅):** Keep `max-of-two → 1.01` (it satisfies both oracles). Update the код comment + `tr1-k4-corrected._meta` to record the **explicit contradiction**: п.17.1 verbatim says 1.00, but ЭФ164189 (2444) + R-Тариф (3108, 6-wag confirmed) demand 1.01. Do **not** present `fitted:false` without this caveat — the basis is empirical, not yet a traced clause.

**Needs operator data (🔒):** Verbatim of any clause that promotes групповая to row 1 at long haul (none found in п.16.7/17.x as currently extracted), OR a third long-haul групповая R-Тариф reference to confirm the +1% is universal. Highest-value: a raw-HTML char-for-char re-pull of п.16.7.x body (the live fetcher self-censored to opening fragments only).

---

## Lever 3 — Innovative gondola `C_INNOVATIVE = 0.9595` (per-wagon, FITTED assignment)

**Where it lives:** `src/lib/tariff/computeTariffN8.ts:39` (constant), `:237` (applied when `w.innovative === true`). The **coefficient** is sourced; the **boolean** is caller-supplied (the fit).

**Sourced fact (Табл.6 п.3, VERBATIM, sourced-official):**
×0,9595 attaches to **scheme N8** for **9 specific полувагон models** (not a generic "innovative" flag): **12-9761-02, 12-9833-01, 12-9853, 12-9869, 12-196-01, 12-196-02, 12-2143, 12-2159, 12-6744**. (Табл.7 п.3 gives the same 0,9595 to scheme N9 for hopper **19-9835-01**.)
Verbatim stored in `tr1-innovative-models.json _meta.verbatimP3`. Correction applied: the 9th model **12-6744** was MISSING from the original 8-model seed and is now added (10 entries: 9 ПВ + 1 hopper). JSON validates.
Source: `consultant.ru/document/cons_doc_LAW_522347/959c65…` (Табл.6) + `…/LAW_43726/701bb5…` (Табл.7) — **official**. Verdict: `real`.

**Does it kill the lever?** 🔒 **Partially.** The coefficient `0.9595` and the model registry are now **sourced-official** (no longer fitted). What remains fitted is the **per-wagon `innovative` boolean**: `computeWagonN8` takes it as caller input rather than deriving it from a wagon-model lookup.

**Apply now (✅ data):** Registry is correct on disk (`tr1-innovative-models.json`, 10 entries, 12-6744 added). `seedLoader.getInnovativeModels()` already consumes it.

**Wire to fully close (✅ code, no new data):** Add a `wagonModel?: string` to `N8WagonInput`; in `computeWagonN8` derive `innovative = INNOVATIVE_MODELS.has(normalize(wagonModel))` instead of trusting the boolean. Keep the boolean as a fallback only when model is absent.

**Needs operator data (🔒):** A **customer-supplied wagon model number at quote time**. The registry makes the lookup deterministic, but the input field must exist in the quote intake. Until intake captures wagon model, the boolean stays caller-trusted (= fitted). Registry may also be non-exhaustive for non-gondola innovative wagons (cisterns, platforms) — out of scope for the validated path.

---

# PART B — DATA GAPS

## Gap 4 — CIS / Baltic / Central-Asia / Caucasus backbone (15 admins, zero ТП)

### 4a. Belarus (БЧ) — ⚠️ **CORRECTED: a FREE OFFICIAL matrix EXISTS**
The finding originally said "no free ТП↔ТП matrix exists" — **REFUTED by its own verdict.** The cited rw.by PDF `polozheni_ob_opredelenii_tarifnih_rasstoyaniy.pdf` (75pp) **contains a full ТАБЛИЦА ТАРИФНЫХ РАССТОЯНИЙ (eff. 01.08.2010)**: ~60,000 station-to-station cells with ЕСР codes on both axes (e.g. Бобруйск→Бобр=289, Брест-Восточный→Брест-Северный=5, diagonal=0). Extractable via `pdftotext -layout`.
- Sourced-official summation + border-min-50km rule confirmed (rw.by Положение).
- **✅ READY:** Re-extract the БЧ matrix from that PDF into a new `kniga3-backbone-cis-bch-matrix.json` and use it to **validate/replace** the existing 87-edge tr4.info section-sum approach (`kniga3-backbone-cis.json`). Caveat: 2010 vintage — spot-verify before production КП.
- Note: seed has **0** km=0 БЧ rows (the finding's "two km=0 rows" was wrong; those are ТРК/РУБК).

### 4b. Kazakhstan (КТЖ, road 68) — 🔒 **NEEDS-DATA (no free matrix)**
Re-verified `real`: no free ТП↔ТП matrix (`tr4.info/tp/rw/68` → "транзитные пункты не найдены"; official cntd.ru 901949506 paywalled behind auth.kodeks.ru SSO). Best free source = tr4.info/railway/68 **section graph**, already on disk as 97 КЗХ edges / 140 nodes / 16 border ТП.
- **Sourced-unofficial** (tr4.info). ESR resolution **64%** (89/140), not 53% as the finding stated.
- 🔒 Needs: paid ТР-4 Книга 1 matrix OR a real KZ-leg квитанция to validate. Engineering next step: alias map (Алматы 1⇐Алма-Ата I, Костанай⇐Кустанай, Оскемен⇐Усть-Каменогорск) to lift resolution.

### Other 13 admins — 🔒 NEEDS-DATA. Same shape: section-sum substitute where tr4.info has the road, paid Книга 1 otherwise. Mark all CIS distances **sourced-unofficial, never priced as money-exact without квитанция validation**.

---

## Gap 5 — Книга 1 (участок cumulative km) — ✅ **CLOSED (gap is STALE)**

**Sourced fact (sourced-official):** Росжелдор open-data `data-20231012-structure-20180312.csv` at `rlw.gov.ru/opendata/7708525167-tarifstations`. Per-station cumulative km to each узел on its участок (header: `Код станции,Наименование станции,Код узла,Название узла,Расстояние,Участок,Линия,Дорога`). Already parsed to `scripts/seed-data/kniga1-sections.json` = 28,586 records, 13,220 stations.
Golden re-verified: Серпухов(190205)→Ревякино(210606) = **74 km** via two узел anchors (Столбовая 109-35; Тула I-Курская 95-21). Verdict: `real`.

**Apply now (✅, housekeeping):**
- Correct README publisher attribution: **Росжелдор (ИНН 7708525167)**, not "РЖД / ФАС" (`kniga1-sections.README.md`).
- Note the framing fix: dataset is per-station **cumulative km** (subtract on the km column), NOT "участок ordinal numbers."
- Re-download script MUST set browser User-Agent + Referer `https://rlw.gov.ru/opendata/` (bare curl → HTTP 403).

**Needs (🔒, low priority):** Layer-C drift refresh — currency date 2025-07-29 is expired as of 2026-06; structure stable. RF only (no CIS участки → see Gap 4).

---

## Gap 6 — Узел adders (Moscow +54 / SPb +25 + same-line exclusion) — ✅ DATA / 🔒 CODE-WIRING

**Sourced fact (sourced-official):** Exactly TWO узлы with fixed adders: **Московский узел = 54 км**, **Санкт-Петербургский узел = 25 км**, both with a **same-line exclusion** (no adder if entry line == exit line). Moscow passenger/baggage variant = 20 км. Verbatim across consultant.ru LAW_63243 (ТР-4 Книга 1), garant 5367457 (Приказ МПС №55 15.07.2003), cntd 901918296. `hub-distances.json` reproduces both adders + exclusion texts + station lists correctly.
**KEY CORRECTION (vs Gap 7 below):** SPb 25 km is **sourced-OFFICIAL** (ТР-4 Книга 1, СЖТ СНГ), NOT "tr4.info-unofficial."

**Apply now (✅ data, ⚠️ code):** Data is correct. The **engine does NOT yet honor the same-line exclusion** — `computeDistance.ts:351-370` adds the hub adder unconditionally on interior traversal → **over-adds 54/25 km when wagon enters+exits on the same radial line** (real-money over-charge). The `lines` map in `hub-distances.json` is currently unused.

**Wire to close (✅ code, no new data):**
1. In `computeDistance`, when a hub узел is interior, look up entry-line vs exit-line from `hub-distances.json.lines`; suppress the adder when equal.
2. Gate the 20 km Moscow variant to passenger/baggage (out of scope for freight КП → always 54).
3. Both oracle endpoints (Возрождение/Гремячая, Исеть/Наб.Челны) confirmed **outside** hub station lists → wiring will NOT regress 89/89 golden tests. But add a Moscow/SPb-transit golden case (currently none exercises the adder path end-to-end).

**Needs (🔒):** Authoritative ESR verification of the ~60 constituent-station codes in `hub-distances.json`; full SPb-node station membership list (only Moscow's 16-station БМК list is captured) so the engine can decide WHICH routes trigger the 25 km.

---

## Gap 7 — §2 особые/кратчайшие расстояния override table — ✅ (rule-based, nothing more to table)

**Sourced fact:** No flat `(ESR-a, ESR-b, km)` §2 matrix exists for free — and primary sources confirm one does not exist as a tabulated matrix. The regime is **rule-based**. Only fixed-km узел adders: **Moscow 54 (official)** + **SPb 25 (official — ТР-4 Книга 1 LAW_63243, see Gap 6 correction)**. Everything else = the 18 routing_rules already in `special-distances.json` (include/exclude/mandated-direction).

**⚠️ ON-DISK BUG TO FIX:** `special-distances.json _meta.spb_note` (line 33) says **"Do NOT seed a flat СПб 25 км override — it is unsourced."** This is **WRONG** per the corrected verdict — SPb 25 km is sourced-official (ТР-4 Книга 1). **Reverse the note** and seed SPb 25 km as a sourced-official узел adder (consumed via Gap 6 / `hub-distances.json`, which already has it — so the engine is correct; only the special-distances note is stale and misleading).

**Apply now (✅):** Edit `special-distances.json _meta.spb_note` to reverse the do-not-seed guidance and cite LAW_63243. No new pair table to acquire.

**Needs (🔒):** SPb-node same-line exclusion nuance (analogous to Moscow) not yet confirmed for SPb specifically; verify 25/54 km unchanged in current ТР-4 redaction (LAW_63243 is the 25.01.2016 ред.).

---

## Gap 8 — Specialized schemes (cisterns, containers, transporters) — 📦 STRUCTURE-ONLY / 🔒 NEEDS-DATA

### 8a. Cisterns N19-N24 — 📦 per-tonne, partial belts seeded
- Unit = **за тонну** (NOT per wagon). Title + first 25 + last belt verified verbatim (e.g. 0-5: 409,4|334,7|467,2|718,8|694,2|3,5; 11701-11900: 16 496,4|…|14 711,2). Source `.../tarify-na-perevozki-nalivnykh-gruzov_1/` — official.
- Scheme selected by **cargo type (Табл.8)** not класс груза. Own cisterns: no K1, no В-component, empty-run = scheme 26/26(1).
- 📦 STRUCTURE-ONLY: middle ~160 belts NOT extracted; **belt count disputed (170 / 186 / 189 across fetches)** → must parse raw HTML for the true count.
- 🔒 NEEDS: a real cistern квитанция (none in repo) before pricing real money. Build `tr1-cistern-belts.json` + `tr1-cistern-classifier.json`.

### 8b. Containers N85-N105 — 📦 structure only, NO numeric belts
- Per-container (by typesize), blocks: N85-89 общий парк, N90-94 собств., N95-99 личные нужды (verbatim), **N100-101 мелкие отправки в сборных вагонах** (the sequence is NOT a clean 4×5), N102-105 термические. Coeff 1,13 at п.23.2.10. Source `.../ii/` + consultant LAW_522347 — official structure, summarized captions.
- 🔒 NEEDS: Приложение N2 numeric per-container rate belts (not seeded) → no ruble computation possible yet. Re-fetch captions char-for-char before seeding.

### 8c. Scheme classifier — ✅ verified + 1 money-affecting fix
- `tr1-classifier-pinned.json` confirmed vs primary (own ПВ → N8, no В; own gondola loaded = scheme 8). **84 rows verified.**
- ⚠️ **FIX (sourced-official):** own ordinary полувагон (<19.6m) **empty-run scheme = 25(1), NOT 25.** Pinned file ПВ-own rows have `emptyScheme:"25"` (lines 32/46/60) — should be `"25(1)"` with a length guard (<19.6m). Scheme 25 stays correct for агломерат/окатыши gondolas (ОК) and covered (КР). Impact at 2444 km 4-axle: 25=24281₽ vs 25(1)=11630₽ (≈2.09× over-charge on the empty leg). Also fix `tr1-empty-run-full.meta.json` schemeMeta["25"].desc (remove "полувагоны").
- ⚠️ Test coupling: `goldenUniversal.test.ts:280` asserts ПВ-own emptyScheme=25 against itself (no real anchor) — update when the seed is corrected, or it masks the fix.
- 🔒 NEEDS: a real own-полувагон **порожний return** квитанция to ruble-validate the 25→25(1) fix (both golden receipts are loaded-haul only; the empty leg is currently unvalidated by any anchor).

---

## Gap 9 — Empty-run unit + порожний ×1.1 — ⚠️ **POTENTIAL 4× BUG** + date fix

**Sourced fact (sourced-official):** N25 (own universal gondola empty run) is **за ось** (per AXLE), NOT per wagon. Heading verbatim: "…за ось в зависимости от расстояния перевозки, в рублях." For a 4-axle gondola: `empty_base = ставка(belt) × 4`, then × 1.1. N25 belts verified (0-5=27, 6-10=107, … 51-60=737 ₽/axle). N32 = construction передвижные формирования (per-axle, niche) — currently MISSING from disk, first belts captured if needed.

**⚠️ ON-DISK BUG:** `tr1-empty-run-full.meta.json` rateNote says **"за один вагон"** — contradicts the verbatim "за ось." If the engine reads `rateRub` as per-wagon, it **understates own-gondola empty return by 4×**.

**Порожний ×1.1 — sourced-official, DATE CORRECTION:** Effective **2025-01-01** (Приказ ФАС 999/24, Минюст 80651), extended into 2026 (ред. 05.11.2025 / 886/25) — **NOT 2026-01-01** as the design doc assumed. Exclusion: перевозки в ремонт/из ремонта. `tr1-coefficients.json` already corrected to effectiveFrom 2025-01-01.

**Apply now (✅):**
1. Fix `tr1-empty-run-full.meta.json` rateNote: "за один вагон" → "за ось (×осность)."
2. Verify the engine's empty-run path does `rate × axles × 1.1` (open the код before trusting the note).
3. Gate ×1.1 to effectiveFrom **2025-01-01** (any pre-2026 as-of date else underprices empty runs by 10%).

**Needs (🔒):** A real own-ПВ empty-return квитанция to validate `×axles×1.1` end-to-end; re-confirm ×1.1 in-force-for-2026 against a single primary in-force text (status currently sourced-official-pending).

---

# PART C — VALUES ALREADY SOURCED-OFFICIAL & VERIFIED (no action beyond housekeeping)

| Item | Value(s) | Source | Status |
|---|---|---|---|
| K1 Табл.2 taper | class1 0,75@≤1200 → −0,01/200km → 0,55@5001+; class2=1,00 flat; class3=1,74 (ЕТСНГ list) / 1,54 else | sudact `.../tablitsa-n-2/` | ✅ matches `tr1-class-coeff*.json` cell-for-cell. Selector MUST branch class-3 on ЕТСНГ membership, NOT distance. K1 applies only to И-component. |
| N8 base grid | N8(70,699)=64570; N8(70,2444)=160271; N8(75,2444)=163491 | sudact `.../tarify-na-perevozki-gruzov-po_1/` (raw HTML) | ✅ matches `tr1-n8-corrected.json` to the ruble. "+10% embedded / без НДС" = **not-found** on grid page (verify vs Прил.1). |
| K3 нерудный chain | 231-236=0,77; п.1.5 ×0,909; 0,77×0,909=**0,69993** exact; п.3.3/5.7 ×1,04 | sudact `.../tablitsa-n-4/` | ✅ matches `C_NERUD_PV`. Distance rules п.1.1 coal>3500km=0,4; п.1.2 timber>3500km=0,5; п.1.3 iron-ore = **tiered, not flat 1,15** (not yet seeded). |
| Own-wagon class coeff | class1 **0,9346**; class2 0,9592; class3 0,9774 (полувагоны only) | sudact `.../ii/` п.18.1.1 | ✅ matches `C_OWN_PV_CLASS1`/`OWN_GONDOLA_CLASS_FACTOR`. ⚠️ seed has no `wagonType=полувагон` guard — gate it, or a non-gondola own class-1 shipment wrongly gets 0,9346. Coincident timber-on-platform 0,9346 not modeled. |
| Distance belts (N8) | 127 non-uniform belts; **1501-1550 fold is real & scheme-specific** (N8/N8(1)/И1 fold; N9-24/И2-18 use single 1501-1600); snap-not-interpolate | sudact `.../tarify-na-perevozki-gruzov-po_1/` raw HTML | ✅ matches `tr1-rate-belts.json` edge-for-edge. Keep per-scheme belt grids. Rate VALUES may have moved under 13.02.2026 изм. — re-check cells. |
| ЕТСНГ class (нерудные) | 231000/232087/232395/232408/232431/281000 all **class 1**; полувагон МВН=г/п (use actual capacityTon) | consultant LAW_522347 (231000/281000 verbatim) + Alta-Soft mirror (232xxx) | ✅ underpins K3 path. 232xxx platform МВН=46 inferred-by-group (mirror-only). classLookup.ts defaults unknown 6-digit codes to class-2 — risk for out-of-seed detail codes. |
| K5 / exclusive | NO separate K5 table. Commodity coeff = Табл.4; **directional overlay = Табл.3** (timber собств. 1,668; пиломат. 1,525; чугун/сталь 1,66; Калининград class-1 belts 0,27-0,78) | sudact `.../tablitsa-n-3/` + `.../tablitsa-n-4/` | ✅ Табл.4 on disk. ⚠️ **Табл.3 directional layer MISSING from engine** → export timber/metals quotes under-priced by 1,66×/1,668×/1,525×. Re-fetch Табл.3 subcode lists char-for-char before wiring. |
| 2026 indexation stack | +13.8% (2024-12) & +10% (2025-12) baked into 2026 base — do NOT re-apply; Минстрой 0,9492 DEAD in 2026; НДС 20→22% on ancillary services only (rail carriage itself 0%) | rzd-partner / alta / dp.ru (sourced-unofficial); ФАС 894/25 base | ⚠️ "+10% embedded in cells" = inferred — verify by diffing `tr1-i-belts-full.json` vs a 2025 baseline before trusting non-re-application. Container +5% = **DRAFT only**, do NOT apply (matches `skipSeed:true`). +1% (Mar-2026) = draft. |

---

# READY-TO-APPLY-NOW vs NEEDS-MORE-DATA (summary split)

### ✅ READY NOW (sourced-official, verdict real — apply without new operator data)
1. Add 12-6744 to innovative registry — **already done**, verify.
2. Wire innovative boolean from wagon-model lookup (code; needs intake field for full effect).
3. Fix classifier own-ПВ `emptyScheme` 25 → 25(1) + length guard (+ `tr1-empty-run-full.meta.json` desc).
4. Fix `tr1-empty-run-full.meta.json` rateNote "за один вагон" → "за ось"; verify engine does `rate×axles×1.1`.
5. Gate порожний ×1.1 to effectiveFrom **2025-01-01**.
6. Gate own-wagon class coeff (0,9346…) on `wagonType=полувагон`.
7. Wire узел same-line exclusion (Moscow 54 / SPb 25) into `computeDistance`; suppress adder when entry line == exit line.
8. Reverse `special-distances.json _meta.spb_note` (SPb 25 km IS sourced-official).
9. Re-extract БЧ official matrix from rw.by PDF (`pdftotext -layout`) → validate CIS section-sum.
10. Replace `computeTariffN8.ts:42-50` comment with sourced п.16.7.1-3/17.2 citation; implement sourced short-haul max-of-two algorithm (won't close 699 but removes the magic branch).
11. Record the K4=1.01 long-haul CONTRADICTION (п.17.1 says 1.00; 2 oracles say 1.01) in код + `tr1-k4-corrected._meta`.
12. Correct `kniga1-sections.README.md` publisher → Росжелдор; document UA+Referer download requirement.
13. Add Табл.3 directional overlay seed (timber/metals export) — re-fetch subcodes verbatim first.
14. Seed K3 distance rules (coal>3500=0,4; timber>3500=0,5; iron-ore tiered).

### 🔒 NEEDS MORE DATA (operator-only — block until acquired)
- **Lever 1 (699 K4):** short-haul групповая R-Тариф reference OR ЭТ201459 raw header (wagon count + chargeable tonnage). Without it 1.00575 stays fitted.
- **Lever 2 (long-haul K4):** raw-HTML char-for-char re-pull of п.16.7.x body; or a 3rd long-haul групповая reference. Do NOT flip to 1.00.
- **Lever 3 (innovative):** customer wagon-model number captured at quote intake.
- **Empty-run 25(1) fix + ×axles×1.1:** a real own-ПВ порожний-return квитанция.
- **Cisterns N19-24 / containers N85-105:** raw-HTML full belt extraction + at least one cistern/container квитанция before any real-money quote.
- **CIS (Kazakhstan + 13 admins):** paid ТР-4 Книга 1 matrix OR per-admin quитанции; alias maps to lift ESR resolution.
- **Layer-B live cross-check (±5% unvalidated):** run the engine against an official РЖД/R-Тариф calculator on a sample of routes.

---

# 12-LINE HIGHEST-LEVERAGE NEXT ACTIONS

1. ✅ Fix classifier own-ПВ emptyScheme 25→25(1) + length guard (≈2.09× empty-leg over-charge; sourced-official).
2. ✅ Open empty-run код; confirm `rate×axles×1.1`; fix meta rateNote "за вагон"→"за ось" (potential 4× bug).
3. ✅ Gate порожний ×1.1 to effectiveFrom 2025-01-01 (not 2026) — else pre-2026 underprices 10%.
4. ✅ Gate own-wagon class coeff 0,9346 on wagonType=полувагон (prevents крытые/платформы mispricing).
5. ✅ Wire узел same-line exclusion (Moscow 54 / SPb 25) into computeDistance — stop unconditional over-add.
6. ✅ Reverse special-distances spb_note: SPb 25 km is sourced-official (ТР-4 Книга 1 LAW_63243).
7. ✅ Wire innovative flag from wagon-model registry (12-6744 already added) + add intake field.
8. ✅ Re-extract БЧ official ТП matrix from rw.by PDF; validate CIS section-sum substitute.
9. ⚠️ Record K4=1.01 long-haul contradiction in код/_meta (п.17.1 says 1.00; 2 oracles say 1.01) — do NOT flip.
10. 🔒 Acquire a short-haul (<1000km) групповая R-Тариф reference to kill the 699 K4 fit (1.00575).
11. 🔒 Acquire one own-ПВ порожний-return квитанция to ruble-validate the 25(1) + ×axles×1.1 fixes.
12. 🔒 Run Layer-B live cross-check vs official РЖД calculator on a route sample (close the ±5% blind spot).
