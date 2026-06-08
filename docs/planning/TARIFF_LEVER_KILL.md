# TARIFF_LEVER_KILL — fitted-lever kill report

Scope: uses ONLY the wagon-registry (wagon-W1…W5) and tariff-oracle (oracle-O1…O5)
acquisition results. A lever counts as **KILLED** only when the value is
independently **sourced-real** (registry-resolved model, or an independent
calculator reproducing the receipt). Corroboration-by-output is **PARTIAL**, not
killed. No value below is fabricated; this computes real money paid to РЖД.

Date: 2026-06-08. Receipts under test:
- ЭТ201459 Исеть(771500)→Наб.Челны(648503), 699 km, 6 ваг, class-1 нерудные, own ПВ = 187 344 ₽ без НДС (31 224 ₽/ваг ×6).
- ЭФ164189 Возрождение(021609)→Гремячая(612709), 2444 km, 15 ваг = 1 067 770 ₽ без НДС (per-wagon tiers 70477 innovative / 73452 classic).

---

## Lever #1 — innovative ×0.9595 per-wagon assignment (ЭФ164189 75т fleet)

**Verdict: REMAINS FITTED.** (Coefficient + eligible-model list now sourced-official; the per-wagon NUMBER→MODEL assignment is NOT.)

What the army sourced-real (W5, oracle-O1…sudact.ru приказ ФАС 894/25, Прил.N1, Табл.6 п.3):
- Coefficient **0,9595** applied to тарифная схема N 8 for own/leased полувагоны — **sourced-official, verbatim**.
- Eligible model registry is **EXACTLY 8 models** (NOT 9): `12-9761-02, 12-9833-01,
  12-9853, 12-9869, 12-196-01, 12-196-02, 12-2143, 12-2159`. **`12-6744` is NOT in
  the current 894/25 text** — the seed file `tr1-innovative-models.json` wrongly
  lists it as a 9th model; it must be removed from the sourced list (it is a real
  ОВК 25-tс gondola, March-2026, that *may* enter a future amendment, but is not
  eligible today).

Why the lever is NOT killed (W1–W4): the 8-digit wagon **number does not encode the
model** (digit-1 род only: 6 = полувагон; digit-5 = собственный — NOT a type/model
indicator). Number→model lives only in АБД ПВ, gated on every free surface
(railwagonlocation login-since-2008; gruzivagon.info JS+captcha+WAF "Kardinal";
vgs-as.in paid export; vagon1520/estiw decode род/control-digit only). The shared
Playwright browser was held by sibling agents the whole window, so the captcha
fallback was never driven. **0/16 ЭФ164189+ЭТ wagon numbers were resolved to a model.**

### Per-wagon number → model → innovative table (BEST OBTAINABLE)

| Wagon # | род (sourced) | check-digit | model | innovative | provenance |
|---|---|---|---|---|---|
| 64437213 | полувагон | valid | null | null | W1/W2 — not resolved (АБД gated) |
| 64917271 | полувагон | valid | null | null | W1/W2 — not resolved |
| 62577135 | полувагон | valid | null | null | W1/W2 — not resolved |
| 60996501 | полувагон | valid | null | null | W1/W2 — not resolved |
| 62590278 | полувагон | valid | null | null | W1/W2 — not resolved |
| 62436548 | полувагон | valid | null | null | W2 — not resolved |
| 60762556 | полувагон | valid | null | null | W2 — not resolved |
| 62435763 | полувагон | valid | null | null | W2 — not resolved |
| 62587464 | полувагон | valid | null | null | W2 — not resolved |
| 62478854 | полувагон | valid | null | null (receipt-classic) | W2 — not resolved; priced 73452 on receipt |
| 53075321 | собственный* | valid | null | false (inferred) | W3 — not resolved; classic number-block |
| 55954051 | собственный* | valid | null | false (inferred) | W3 — not resolved |
| 55311401 | собственный* | valid | null | false (inferred) | W3 — not resolved |
| 55200208 | собственный* | valid | null | false (inferred) | W3 — not resolved |
| 52201696 | собственный* | valid | null | false (inferred) | W3 — not resolved |
| 52270238 / 63256044 / 65165441 / 65877649 / 63255889 / 65599458 (ЭТ fleet) | полувагон | valid | null | null (receipt all-classic, priced 31224 each) | W4 — not resolved |

\* CAUTION (W3 verdict correction): the leading-digit "53/55/52 = classic gondola"
decode is **unsound** — digit-1 = 5 marks *собственный*, not полувагон; type/capacity
for these 5 is genuinely unknown. `innovative=false` here is inferred from receipt
pricing only, NOT registry-sourced. **Do NOT seed the innovative flag from any
number decode** — it confirms 4-axle gondola TYPE at best and cannot distinguish
innovative (12-9761-02 etc.) from classic.

**Status: PARTIAL → coefficient/list sourced-official (lever tightened to 8 models),
but per-wagon model assignment remains FITTED from receipt pricing.**
RETRY PATH: drive an authenticated АБД ПВ / gruzivagon / vagon1520 session via
Playwright (when the browser is free) to read each number's model field, then match
against the 8-model registry. Engine already treats ЭТ fleet + 62478854 as classic
(identical receipt pricing), which is the safe default until resolved.

---

## Lever #2 — 699 km K4 short-haul uplift = 1.0057499686370497 (ЭТ201459)

**Verdict: REMAINS FITTED at the coefficient level; OUTPUT independently CONFIRMED to the ruble.**

Independent calculator reproduces 187 344? **YES.** Four oracle agents (O1, O2, O3, O4)
drove the free gruzivagon.info РЖД calculator end-to-end (reverse-engineered AJAX
`PutTariff`/`GetListTariff`, homegrown image-digit captcha solved by vision — NO login).
For ЭТ201459 (st_start=771500, st_finish=648503, ЕТСНГ 232431.0 «Щебень…», Полувагон,
own, 699 km) the oracle returns **31 224,00 ₽/ваг без НДС → 187 344 ₽ for 6 wagons**,
НДС 6 869,28 (22%), всего 38 093,28 — **matching the квитанция to the kopeck.** O4 also
cross-checked at a *different* input weight (70 t vs O3's 68 t) and got the IDENTICAL
31 224, ruling out copy-paste. This is a third independent reference (квитанция +
engine + oracle) agreeing to the ruble.

But the lever is **NOT killed**, because the oracle exposes only the final
провозная плата — it **never exposes its internal K4 row**. So the fitted
SHORT_HAUL_BOUNDARY_UPLIFT is **corroborated-by-output, not recovered-from-rule**.

Implied / true K4 (from O5, verbatim ТР-1 п.16.6/16.7.1/16.7.2/16.8 + Табл.5 on sudact.ru):
- Table-5 K4 row "6-20 вагонов", пояс 511-1000 km = **0,98** (verbatim).
- **Exact effective K4 required to hit 31 224 = 0,9856349692643086.** This sits
  BETWEEN table 0,98 and 1,00 and is **NOT derivable** from the verbatim rule in any
  of three admissible modes: flat ×0,98 → 31 045 (−179); belt-prorated п.16.7.2 →
  31 247…31 555 (no ruble match at any weight); multi-belt 0,97|0,98 → 30 491…30 791
  (worse). Continuity-guard п.17.2 only forbids a *smaller* increment across a belt
  boundary — it does not promote 0,98 toward 0,98563. `reproducesWithoutFit = false`.
- The engine closes the 179 ₽ gap with the fitted constant 0,98 × 1,00575 = 0,98563.

**Status: PARTIAL — output verified-real to the ruble (kills the "wrong number" risk),
but the K4 coefficient itself stays a fit.** O5 redirects the true residual OFF the K4
rule and ONTO chargeable-weight (H1: real net ~67,6–68,8 t vs N8 row 70 t) or
fine-belt K1 (H2: Табл.2 K1(class-1, 699 km) may ≠ 0,75), which were not closed.
Independence caveat: O1–O4 are four agents hitting the SAME gruzivagon number —
corroborating, not orthogonal; gruzivagon is unofficial (sourced-unofficial), not РЖД ЭТРАН.

Cross-check bonus (O4, ЭФ164189 2444 km): oracle returns 75 307 ₽/ваг (distance EXACT,
2444 km) — it does NOT reproduce the 70 477 ₽ innovative tier because it has **no
wagon-MODEL input**, and 75 307 × 0,9346 = 70 382 ≈ 70 477 (Δ0,13%). This is by-design
divergence that SUPPORTS lever #1's premise (the innovative discount is a real
per-wagon effect a model-blind calculator can't capture), but it is post-hoc
arithmetic, not a sourcing.

---

## 10-LINE VERDICT

1. Lever #1 (innovative ×0.9595 per-wagon): **REMAINS FITTED** — per-wagon NUMBER→MODEL never resolved (АБД ПВ gated; 0/16 numbers resolved).
2. Verified-real model match for every ЭФ164189 75т wagon? **NO** — model=null for all; assignment still inferred from receipt pricing.
3. What IS now sourced-official: coefficient **0,9595** + eligible registry of **EXACTLY 8 models** (verbatim приказ ФАС 894/25, Табл.6 п.3).
4. Seed fix required: remove **12-6744** from `tr1-innovative-models.json` (9→8); it is NOT in the current normative text.
5. Do NOT seed innovative from number decode — digit-1 gives род only (6=полувагон, 5=собственный), never the model.
6. Lever #2 (699 km K4 uplift 1.00575): **REMAINS FITTED at coefficient level.**
7. Independent calculator reproduces 187 344? **YES** — gruzivagon oracle returns 31 224 ₽/ваг × 6 = 187 344 ₽ to the kopeck (O1–O4), even across different input weights.
8. Implied true effective K4 = **0,9856349692643086**; verbatim Табл.5 gives 0,98 and the rule cannot derive 0,98563 in any of three modes (O5, reproducesWithoutFit=false).
9. So lever #2 is **PARTIALLY closed**: output verified-real to the ruble, but the K4 coefficient is corroborated-by-output, not rule-sourced; residual likely lives in chargeable-weight (H1) or fine-belt K1 (H2), not K4.
10. NEITHER lever is fully KILLED. Both need an authenticated/registry source: АБД ПВ wagon-model lookup (#1) and exact wagon tare/net + Табл.2 K1 header (#2) — gruzivagon is unofficial corroboration, not an РЖД-official citation.
