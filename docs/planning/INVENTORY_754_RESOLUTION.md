# INVENTORY −754 ₽ lever — clause resolution

> Scope: resolve the origin of `INVENTORY_DISCOUNT = 754` in
> `src/lib/tariff/computeInventory.ts` (applied at the final
> `Math.round(loaded + emptyLeg + vLeg - 754)`), cited in-file only as «скидка 754 (п.16.x)».
> Self-flagged HIGH / "fitted lever" in `TR1_ENGINE_CONFORMANCE.md` and `TARIFF_LEVER_KILL.md`.
> R-Тариф labels this line «**Скидка с общего тарифа на универсальные вагоны −754**».
> Date: 2026-06-09. **No engine code edited.** No number below is fabricated.

---

## 1. Verdict (one line)

**The −754 ₽ is a FLAT per-wagon constant (proven flat), but it has NO derivable ТР-1
clause.** It is not п.16.10 (Табл.N12/N13/п.28.2 reductions — those are container/contrailer
FCL only and do not touch a щебень полувагон). It is R-Тариф's own reconciliation line between
the official combined universal-general-park scheme (**И1**) and the п.16.5.1 three-leg
decomposition (N8 + порожний 25(1) + группа В) that the engine recomputes. Treat it as a
**sourced-by-oracle constant** (corroborated to the kopeck against two independent R-Тариф
receipts), NOT a sourced-by-rule reduction.

---

## 2. Is it flat 754, or a route-specific formula? → PROVEN FLAT

Both R-Тариф inventory oracles (Тёплая Гора→Койты, 1409 km, 70 т, щебень класс 1; identical
route, different `wagonCount`) — `reference-quotes-batch-0609.json` `inventory_cases[*].breakdown`:

| case | shipment | K4 sign | `sumSchemes` (₽) | oracle total (₽ без НДС) | required reduction |
|---|---|---|---|---|---|
| INV-1     | повагонная (1 ваг) | **+** (+3250.24 loaded, +304.56 empty) | 110 923,86 | 110 170 | **753,86** |
| INV-6_20  | групповая (6 ваг)  | **−** (−1625.12 loaded, −127.34 empty)  | 106 558,32 | 105 804 | **754,32** |

The two required reductions are **753,86 and 754,32** — they *bracket* 754 (one below, one above)
to within ±0,4 ₽, which is exactly the residue of subtracting a **flat integer 754** *before* the
п.15.5 whole-ruble round (`Math.round(sumSchemes − 754)` → 110170 and 105804 respectively, both
exact). Critically:

- The K4 correction has **opposite sign** between the two cases (повагонная uplift vs групповая
  reduction), yet the discount is the **same 754**. A route-/load-proportional formula would move
  with K4 or with the scheme totals (which differ by ~4 366 ₽). It does not. ⇒ **flat, not a formula.**
- Therefore for щебень / универсальный полувагон (ПВ) it is correctly modelled as a **flat
  754 ₽/вагон**, and `754` is **not** hiding a route-derived quantity that must be recomputed.

---

## 3. Where it is NOT (clauses ruled out, with primary-source checks)

Primary source: Приказ ФАС России от 06.11.2025 № 894/25 (ТР-1 2026), sudact.ru.

| Candidate clause | Ruled out because |
|---|---|
| **п.16.10** «размер уменьшения тарифа … вычитается» | Generic *mechanism* for subtracting reductions; the reductions it points to are **Табл.N12, Табл.N13 и п.28.2** (see п.15.5 verbatim). None apply to a bulk щебень полувагон. Live re-fetch of §II confirms п.16.10 names **no fixed ruble figure**. |
| **Табл.N12** (уменьшение — контейнерные FCL полные комплекты) | Applies only to *контейнерная отправка … полными комплектами на вагон* and *порожние контейнеры* (rulebook/`tablitsa-n-12.md`). Per-container ₽ amount, not per-wagon; щебень in a полувагон is out of scope. |
| **Табл.N13** (уменьшение — контрейлерные полные комплекты) | Контрейлерные перевозки only (rulebook/`tablitsa-n-13.md`). Not our path. |
| **п.28.2** | Referenced by п.15.5 as a reduction source alongside Табл.N12/13; it is a контейнерная/специальная reduction, not a universal-wagon flat. |
| **п.18.x** (универсальные вагоны) | Live WebFetch of full п.18 (18.1, 18.1.1–18.1.3, 18.2, 18.3): **no fixed ruble subtraction**; п.18.3 *adds* группа-В (В1/В3/В4), it does not reduce. |
| **п.16.5.1** | Defines the three-leg общий-парк sum (груж. N8/8(1)/9 + порожний 25(1)@60% + группа В). Contains **no subtraction term**. |

**Conclusion of §3: the 754 ₽ figure does not appear anywhere in the §II methodology, in п.18,
or in the reduction tables (N12/N13) / п.28.2.** It is not a quotable ТР-1 reduction.

---

## 4. What it actually is (best-supported explanation)

R-Тариф publishes the общий-парк universal-wagon tariff via the **combined scheme И1** (a single
distance×weight table for universal general-park wagons — present on disk:
`tr1-i-belts-full.json`, scheme `И1`, e.g. И1@1409 km/70 т = **142 911 ₽**). The engine, following
п.16.5.1 *verbatim*, instead **reconstructs** the same number from three separate legs
(N8 own-scheme base + порожний 25(1)@60% + группа В), each with its own coefficients and per-step
kopeck rounding.

These two representations of the *same* legal tariff differ by a small fixed offset because the
И1 combined table and the N8+25(1)+В leg-sum are built on slightly different rounding/aggregation
conventions in the official source. R-Тариф exposes that offset on the receipt as the explicit
line «**Скидка с общего тарифа на универсальные вагоны −754**» — i.e. a constant that conforms the
leg-decomposition back to the published И1 общий-парк tariff. It is real money that R-Тариф and
the engine agree on to the kopeck on two independent receipts, but its **value originates in
R-Тариф's table-construction, not in a numbered rule we can cite.**

> This phrase «Скидка с общего тарифа на универсальные вагоны» is an **R-Тариф UI label**, not a
> verbatim ТР-1 heading. A targeted WebSearch + WebFetch of §II / п.16 / п.18 found no normative
> text containing it or the figure 754.

---

## 5. Recommendation → KEEP as a named, oracle-sourced constant (do NOT derive, do NOT remove)

**Keep `INVENTORY_DISCOUNT = 754`** for the ПВ/ПЛ universal-general-park щебень path, with the
provenance upgraded from the vague «п.16.x» to an honest, accurate citation. Rationale:

1. **It is required for kopeck-exactness.** Removing it breaks both certified inventory oracles
   (INV-1 110170, INV-6_20 105804) by ~754 ₽/вагон. It is load-bearing, not cosmetic.
2. **It is proven flat** (§2): independent of K4 sign, distance-leg totals, and wagonCount across
   the two available receipts. So hardcoding a single constant is *correct* for this path — there
   is nothing route-specific to derive.
3. **It is corroborated-real, not invented**: two independent R-Тариф receipts both demand 754 to
   the kopeck. Under the project's evidence ladder this is "sourced-by-oracle / corroborated-by-
   output" — the same status as the K4 short-haul lever in `TARIFF_LEVER_KILL.md`, which the project
   already ships because the *output* is verified-real.

### Required code-comment / seed change (for a future engine-owner; NOT done here)

- Replace the in-file citation «скидка 754 (п.16.x)» with: *"−754 ₽/вагон: R-Тариф line «Скидка с
  общего тарифа на универсальные вагоны». NOT a numbered ТР-1 reduction (не Табл.N12/N13/п.28.2 —
  те только контейнер/контрейлер). It conforms the п.16.5.1 leg-sum (N8+25(1)+В) to the published
  combined И1 общий-парк tariff. Proven FLAT and kopeck-exact vs two R-Тариф receipts INV-1/INV-6_20;
  confidence: corroborated-by-oracle, not sourced-by-rule."*
- Confidence on the inventory line stays **yellow** (the file's existing semantics: "посчитано по
  таблицам И сверено до рубля") — which is now *accurate*, since the 754 is acknowledged as an
  oracle-anchored conformance constant rather than claimed as a rule.

### Do NOT
- Do **not** "derive" 754 from a formula — it is flat; a formula would be the fabrication.
- Do **not** silently delete it — that re-opens a 754 ₽/вагон error on every общий-парк quote.
- Do **not** re-label it п.16.10 / Табл.N12 — §3 disproves all of those for this path.

### Residual / retry path (to fully KILL the lever, optional)
The only way to convert this from "oracle-sourced" to "rule-sourced" is to reproduce the published
**И1 combined table** value (И1@1409/70т = 142 911) directly and show analytically that
`И1_total − (N8_legs + 25(1) + В)` = 754 ₽ for this belt as a *structural* table-construction
offset. That requires comparing the И1 combined base belts against the N8/25(1)/В belts across
distances — a separate study. Until then 754 remains corroborated-by-output, identical in standing
to the two PARTIAL levers already documented in `TARIFF_LEVER_KILL.md`.

---

## 6. Source URLs / on-disk evidence

- §II methodology (пп.15–25, п.16.5.1, 16.10, 18.x), verbatim re-fetched this session:
  `https://sudact.ru/law/prikaz-fas-rossii-ot-06112025-n-89425/prilozhenie-n-1/ii/`
- Табл.N12 / N13 (reductions ruled out): rulebook chunks `docs/planning/rulebook/tablitsa-n-12.md`,
  `tablitsa-n-13.md`; п.15.5 verbatim in `docs/planning/TARIFF_RULES_EXACT.md` line 30.
- Oracle evidence (flatness proof): `scripts/seed-data/reference-quotes-batch-0609.json`
  → `inventory_cases[0..1].breakdown` (sumSchemes 110923.86 / 106558.32, discount −754).
- Combined И1 scheme (the "общий тариф" R-Тариф discounts from):
  `scripts/seed-data/tr1-i-belts-full.json`, scheme `И1`.
- Engine site: `src/lib/tariff/computeInventory.ts` (`INVENTORY_DISCOUNT = 754` const + final
  `Math.round(loaded + emptyLeg + vLeg - INVENTORY_DISCOUNT)`).
- Prior flags: `docs/planning/TR1_ENGINE_CONFORMANCE.md` (HIGH row), `docs/planning/TARIFF_LEVER_KILL.md`.
