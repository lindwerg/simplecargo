# DISTANCE_ROUTING_SPEC — §2 ТР-4 spur-attachment fix (Решетниково bug)

> **Status:** engineering spec, no code changed. Closes one row of
> [`TR1_ENGINE_CONFORMANCE.md`](./TR1_ENGINE_CONFORMANCE.md).
> **Owner file to edit (later phase):** `src/lib/distance/computeDistance.ts` only.
> **Ground truth:** `scripts/seed-data/reference-quotes-pending.json` case n=12
> (Элисенваара 023202 → Решетниково 061108 = **1432 km**, R-Тариф v19.59).
> **Must not regress:** 2444 (Возрождение 021609→Гремячая 612709), 699
> (Исеть 771500→Набережные Челны 648503), 3108 (Элисенваара 023202→Элиста 528706);
> plus goldenN8/goldenProdPath/goldenRtariff/goldenBatch0609 (those are tariff-money
> goldens, unaffected — they do not exercise multi-spur destinations).

---

## 1. The governing rule (verbatim primary source)

ТР-1 2026 §I **п.4** (Приказ ФАС 894/25, [`rulebook/prilozhenie-n-1-i.md`](./rulebook/prilozhenie-n-1-i.md) line 30):

> «Тарифы … рассчитываются за расстояние, определяемое в соответствии с Тарифным
> руководством N 4 …, Порядком определения кратчайшего расстояния … (Приказ
> Минтранса России от 12 сентября 2024 г. N 313) … **в обход малодеятельных
> участков и скоростных линий** …»

п.4.7 (line 51): tariff distance excludes пути/ветви необщего пользования.

**Plain reading for the engine:** distance is the shortest **station-to-station**
path that runs along the designated mainline, **bypassing малодеятельные
(low-traffic) branches**. A cheaper number obtained by routing onto a
малодеятельная ветка is **tariff-illegal** — it undercuts the published quote.
The Решетниково bug is exactly such an illegal undercut (1267 vs legal 1432).

---

## 2. The bug, traced to the km

The destination station **Решетниково (061108)** is itself a узел, and it ALSO
hangs off four bounding узлы in `kniga1-sections.json` (all on the Московская/Мгинская
line, дорога Октябрьская):

| dest-spur узел | spur km | участок | published direct edge `022404→узел` (kniga3) | total = 21 (origin spur) + direct + spur |
|---|---|---|---|---|
| Тверь (061502) | 62 | ТВЕРЬ ХОВРИНО | 1184 | **1267 ← engine picks this (global MIN)** |
| Поварово II (238207) | 58 | ТВЕРЬ ХОВРИНО | 1212 | 1291 |
| **Ховрино (060001)** | **92** | **ТВЕРЬ ХОВРИНО** | **1319** | **1432 ← R-Тариф legal answer** |
| Конаково ГРЭС (061201) | 36 | РЕШЕТНИКОВО КОНАКОВО ГРЭС | (no direct edge) | n/a |

(`origin spur` 21 = Элисенваара 023202 → узел Хийтola 022404, from kniga1.)

**Verification to the km against R-Тариф `routeNodes`:**
- R-Тариф node Ховрино = **1340**. Engine: origin spur 21 + direct(022404→Ховрino) 1319 = **1340**. Exact.
- R-Тариф final Решетниково = **1432** = 1340 + Ховрino→Решетниково spur **92**. Exact.
- Александров→Ховрino backbone edge = 156 (kniga3); R-Тариф 1184 (Александров) + 156 = 1340. Consistent.

**Diagnosis:** the engine already holds every correct edge. The bug is **NOT** a
missing узел edge, **NOT** a mis-weighted edge, and **NOT** the anti-undercut
`backboneTerminal` (that protects published *backbone* edges and is working). The
bug is in the **candidate-enumeration / spur-selection** step
(`computeDistance.ts` lines 450–491): it minimizes the total over **all** dest-spur
узлы, so it grabs the cheap **Тверь (62)** spur. Тверь, Ховрino and Поварово II are
all on the **same участок «ТВЕРЬ ХОВРИНО»**, and Решетниково physically sits on it.
Approaching from the north down the Северный ход, the wagon reaches Решетниково via
**Ховрino** (the Москва end the backbone arrives at, 1340). Attaching via **Тверь**
means running the through-route *past* Решетниково up to Тверь and then doubling
back 62 km down a малодеятельная branch — the обходной undercut п.4 forbids.

---

## 3. Why this does not affect the three golden distances

The golden destinations either have a single spur (Элиста → Светлоград, 1 leg) or
their cheapest spur **is** the legal one (Гремячая → Волгоград II 165 chosen,
Набережные Челны → Алнаши 60 chosen). The current global-MIN happens to be legal
there because the two legs sit at the two ends of one участок and the through-route
genuinely arrives at the chosen end. Решетниково is the first case where the
**cheapest same-участок leg is the WRONG (back-branch) end**. Any fix MUST therefore
be *direction-aware*, never a blanket "pick the longest spur" (that would flip
Гремячая 165→21 and Набережные Челны 60→182, breaking both).

---

## 4. The fix — same-участок back-branch exclusion (spur-attachment fix)

**Classification:** this is a **spur-attachment fix**, localized to the candidate
loop. It is *not* an anti-undercut threshold change and *not* a graph-data change.

### 4.1 Rule

When two or more dest-spur узлы of the same destination station **lie on the same
участок** (identical `Kniga1Row.uchastok`), they are the **opposite ends of one
section that the station sits between**. The wagon must attach at the end that the
through-route **actually reaches** — i.e. the узел that is the *terminus* of the
arriving backbone path — and must NOT attach at the far end via a doubling-back
spur. Operationally: among same-участок competing spur узлы, the legal attachment
is the узел `U` for which `backbone(originUzel → U)` is the path that does **not**
pass through any other competing узел `V` of that same участок on its way in.

Equivalently and more simply (this is the implementable test that reproduces 1432):

> For a destination station whose spur узлы share a участок, the spur km of узел `U`
> must be added to the backbone distance to `U` **only if `U` is the узел on that
> участок nearest to the station along that участок in the direction of travel**.
> When the through-route's last backbone hop into the участок lands on узел `V`, and
> another competing узел `U` on the same участок is reached only by continuing *past*
> the station to `V'` and back, exclude the `U`-attachment candidate.

### 4.2 Minimal, regression-safe formulation actually recommended

A full direction model is overkill and risks regressions. The narrowest rule that
(a) yields 1432, (b) keeps 2444/699/3108, and (c) is decidable from on-disk data:

> **Same-участок dominance test.** Group the destination's spur legs by
> `uchastok`. Within each group of ≥2 legs, a leg via узел `U` (spur `sU`,
> backbone `bU`) is **dominated** (and must be DROPPED from the candidate set) by
> another leg via узел `V` (spur `sV`, backbone `bV`) on the *same участок* iff
> `V` lies **between** `originUzel` and `U` on the through path — detected as
> `bV + (km of the V↔U backbone edge) ≈ bU` (within the 1 km rounding band) AND
> `sV > sU` is **false** … » — see §4.3 for the exact predicate.

Because Тверь, Ховрino, Поварово II are colinear on «ТВЕРЬ ХОВРИНО», the published
edges encode the order: `022404→Тверь 1184`, `Тверь→Ховрino 154`, `1184+154 = 1338 ≈
1319? ` — note the small slack; the cleaner discriminator below avoids edge-chaining.

### 4.3 Recommended implementable predicate (cleanest, data-proven)

The single discriminator that is exact in the data and needs no edge-chaining:

> **«Through-узел» attachment.** For a station with multiple spur legs on one
> участок, the station's *true* привязка is the узел whose
> `backbone(originUzel → узел) + spur` route reaches the station **without the узел
> being an interior node of a longer same-участок leg's path**. Implement as:
> among same-участок legs, **discard any leg whose узел `U` has a strictly larger
> spur-узел `W` on the same участок such that `backbone(origin→U) < backbone(origin→W)`
> and `spur(U) < spur(W)`** — i.e. the cheap-backbone *and* cheap-spur узел is the
> near (Москва-side) приближение and is the обходной back-branch; keep the узел
> whose larger spur corresponds to the larger backbone (the genuine arrival end).

Check against the data:
- «ТВЕРЬ ХОВРИНО»: Тверь (b1184, s62), Поварово II (b1212, s58), **Ховрino (b1319, s92)**.
  Ховрino has the largest backbone AND the largest spur ⇒ it is the genuine far
  arrival узел; Тверь and Поварово II are nearer-backbone *and* smaller-spur ⇒
  obходные back-branches on the same участок ⇒ **dropped**. Survivor = Ховрino ⇒
  **21 + 1319 + 92 = 1432.** ✔
- «ВОЛГОГРАД II КОТЕЛЬНИКОВО» (Гремячая): only **Волгоград II** has a usable direct
  backbone edge (Котельниково's is absent), so the group degenerates to one
  candidate ⇒ 2444 unchanged. ✔
- «АКБАШ АЛНАШИ» (Набережные Челны): Алнаши (255109) is reached by chained backbone
  (no direct edge), Акбаш by a longer route; the legal Алнаши(60) survives because
  the dominance test only fires when **both** backbone and spur of the competitor
  are larger — here the chosen Алнаши leg is not dominated. Engine output stays 699. ✔
- Элиста: single spur, test never fires ⇒ 3108 unchanged. ✔

> **Pin the predicate to п.4 «в обход малодеятельных участков».** The dropped legs
> (Тверь-62, Поварово II-58) are precisely the малодеятельные back-branches; the
> survivor (Ховрino-92) is the through-mainline attachment. This is the legal
> intent, not a numeric hack.

---

## 5. Specific code change recommended

**File:** `src/lib/distance/computeDistance.ts` (this phase's sole owner).
**Where:** the candidate loop, lines 450–491 (the `for (oLeg) for (dLeg) …` block),
plus a small pre-filter helper. **Do not touch** `backboneTerminal` (it is correct),
`sharedUzelDistance`, the hub adder, or the graph/seed JSON.

1. **Add a same-участок dominance pre-filter on the destination legs** (mirror it for
   origin legs for symmetry, though only the dest side is exercised here). Before the
   enumeration, for the dest station's `dLegs`:
   - Group `dLegs` by `uchastok`.
   - For each group with ≥2 legs, compute for each leg `bU =
     backboneTerminal(g, originAnchor, dLeg.uzelEsr)?.km` (use the cheapest origin
     anchor as the reference, or compute per origin-leg inside the loop). Drop leg
     `U` iff there exists another leg `W` in the same group with
     `bW > bU` **and** `dLeg_W.km > dLeg_U.km` (the survivor is the узел that is both
     farther along the backbone and farther out on the spur = the genuine arrival
     end; the smaller/cheaper colinear узлы are обходные back-branches).
   - Keep all legs whose `uchastok` group has a single leg, and any leg not dominated.

2. **Run the existing enumeration over the filtered dest legs.** No change to the
   `leg1 + bridgeOrigin + backboneTerminal + bridgeDest + leg3` arithmetic, rounding,
   or hub adder.

3. **Edge cases to honor:**
   - If a leg's `backboneTerminal` is `null` (no path, e.g. Конаково ГРЭС), it is
     naturally excluded — keep that behavior.
   - The filter must be *conservative*: when backbone distances are equal or the
     spur ordering is ambiguous, keep both legs (fall back to current MIN) so no
     calibrated km regresses. Only an unambiguous "smaller-backbone AND smaller-spur
     on the same участок" pair triggers a drop.
   - Apply the filter **per (origin-leg) reference** if origin has multiple anchors,
     so a cheap origin anchor cannot resurrect a dropped dest back-branch.

### 5.1 Pseudocode (drop-in shape, not final code)

```text
function filterBackBranches(legs, gForBackbone, originUzel):
    byUchastok = group legs by leg.uchastok
    survivors = []
    for group in byUchastok:
        if group.length == 1: survivors.push(group[0]); continue
        for U in group:
            bU = backboneTerminal(g, originUzel, U.uzelEsr)?.km   // may be null
            dominated = exists W in group, W != U where
                bW != null && bU != null &&
                bW > bU && W.km > U.km                            // W is the true arrival end
            if not dominated: survivors.push(U)
    return survivors
```

Then in the main loop, iterate over `filterBackBranches(dLegs, g, oLeg.uzelEsr)`
instead of raw `dLegs` (and symmetrically for `oLegs` if desired).

### 5.2 Acceptance gate

- `npx vitest run src/lib/distance --reporter=dot` stays green (2444/699/3108 etc.).
- New assertion: `computeDistance(023202 → 061108) === 1432` (promote
  reference-quotes-pending case n=12 into a golden ONLY after this passes — the
  pending file's own `_meta` warns not to add it to golden until the engine emits 1432).
- `npx tsc --noEmit --pretty false` clean.
- Spot-re-run goldenBatch0609 / goldenRtariff money goldens to confirm no distance
  drift bleeds into tariff totals.

---

## 6. One-line classification for the conformance tracker

> **Решетниково undercut = spur-attachment bug.** All узел edges present and
> correctly weighted; `backboneTerminal` anti-undercut is correct. Fix = a
> same-участок back-branch dominance filter on destination (and origin) spur legs in
> the candidate loop of `computeDistance.ts`, enforcing п.4 «в обход малодеятельных
> участков». Yields 1432 (Ховрino-92) while preserving 2444/699/3108.

---

## 7. IMPLEMENTATION OUTCOME (2026-06-09) — §4.3 predicate FALSIFIED, status PARTIAL

The §4.3 «through-узел» predicate (drop leg `U` when a same-участок leg `W` has
**both** larger backbone AND larger spur) was implemented and run against the live
engine. It produces the right answer for Решетниково in isolation but is **provably
wrong in general** — it breaks golden Route B (Исеть 771500 → Набережные Челны
648503 = 699). Measured узел-distances (origin spur included):

| route | participок | competing узлы (dist-to-узел, spur) → total | legal answer |
|---|---|---|---|
| Решетниково | ТВЕРЬ ХОВРИНО | Тверь (1205, 62)→1267 · Поварово II (1233, 58)→1291 · **Ховрино (1340, 92)→1432** | **1432 = the EXPENSIVE/FAR узел** |
| Набережные Челны | АКБАШ АЛНАШИ | **Алнаши (639, 60)→699** · Акбаш (881, 182)→1063 | **699 = the CHEAP/NEAR узел** |

The two cases are **monotonically contradictory**: in Решетниково the legal узел has
larger backbone AND larger spur; in Наб.Челны the legal узел has smaller backbone AND
smaller spur. The §4.3 rule "keep the узел with larger backbone+spur" drops the legal
Алнаши(60) and forces Акбаш(182), giving 1063 instead of 699. (It also mis-fired on
Решетниково itself: dropping Тверь+Поварово II left the cheaper Конаково ГРЭС leg —
which bridges through the dest node out to Поварово II — winning at 1363, not 1432.)
**No spur/backbone km-monotone predicate can satisfy both routes simultaneously.**

**The true discriminator is магистраль-vs-малодеятельная узел membership**, NOT km
arithmetic. R-Тариф routes Решетниково via Ховрино because the Тверь leg is a
малодеятельная back-branch (п.4 forbids it); it routes Наб.Челны via Алнаши because
Алнаши is the genuine mainline approach. The seed data carries `liniya:
"МАЛОДЕЯТЕЛЬНЫЕ УЧАСТКИ"` on ~1003 rows and a few `(малодеятельный участок)` участok
suffixes, but the Решетниково/Наб.Челны competing узлы all sit on ordinary линии
(«МОСКОВСКАЯ И МГИНСКАЯ ЛИНИИ» / «Горьковской ж.д.») with **no per-узел
магистраль/branch flag** at the granularity needed to mark Тверь-62 as малодеятельная
while leaving Ховрino-92 as mainline. The graph also holds no direct backbone edge
chaining Тверь↔Ховрino↔Поварово II (they are reached only by separate published
022404→узел edges), so colinear ordering cannot be recovered from edges either.

**OBSTACLE (blocking, sourced):** reaching 1432 without breaking 699 requires a узел-
level «магистральный / малодеятельный обходной» classification that is **not present
in `kniga1-sections.json` / `uzel-graph.json`**. Per the money-contract and the task's
hard constraint ("do NOT hack a special-case constant for one route"), no fabricated
flag or per-route override was committed. `computeDistance.ts` was restored to HEAD;
all 36 distance tests green; Решетниково remains 1267 pending the source below.

**SOURCE-TO-OBTAIN (operator):** a per-узел (or per-kniga1-row) malodeyatelny / mainline
designation for the «ТВЕРЬ ХОВРИНО» and «АКБАШ АЛНАШИ» sections, traceable to ТР-4
(Приказ Минтранса 313/2024) приложение участков малодеятельных, or the R-Тариф узел
attribute that marks Тверь-62 as the обходной leg. With that flag the filter becomes:
*drop a same-участок spur leg whose узел is малодеятельный-обходной when a mainline
узел of the same участок is reachable* — which yields 1432 (Ховрino) AND keeps 699
(Алнаши is mainline, not dropped). Until then the §4.3 km-only predicate must NOT ship.
