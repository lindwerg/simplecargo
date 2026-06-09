# ANTI-UNDERCUT AUDIT — RF-wide invariant verification

**Date:** 2026-06-09
**Scope:** read-only audit of the anti-undercut invariant (ТР-4 §2 / Решетниково 1267-vs-1432 generalization).
**Engine under test:** `src/lib/distance/computeDistance.ts` + `repository.ts` (graph built identically to `getData()`).
**Result:** PASS. `resolveDistance` returns **0** illegal short paths across the audited population. No engine change required.

---

## The invariant

> A chained узел path may NEVER be shorter than a PUBLISHED direct Книга-3 ТП↔ТП edge
> between the same two ТП. If it is, the chain used an обходная/соединительная ветвь and
> is illegal (ТР-4 Книга-3 «без учёта обходных и соединительных ветвей в узлах»).

The published direct edges live in `kniga3-backbone.json` (93 953 rows) → compiled into
`uzel-graph.json` (`source:"kniga3"`) → `CompiledGraph.directBackbone` (one shortest published
edge per ТП-pair). After all overlays (cisfill, cisBackbone-БЧ, gapfill, kniga1-adjacency, АЯМ,
Crimea) the compiled `directBackbone` holds **123 550** distinct ТП↔ТП pairs.

## Two distinct questions (the audit's core distinction)

1. **"Graph has a shorter edge"** — does a pure kniga3-only Dijkstra between two ТП come out
   shorter than their published direct edge? (A topological property of the graph.)
2. **"resolveDistance actually returns an illegal short path"** — does the *engine*, at resolve
   time, ever charge less than the published direct edge for the узел↔узел segment it uses?
   (The only thing that reaches the price layer.)

These are NOT the same. The engine's `backboneTerminal()` returns the published direct edge
**AS-IS** whenever `directBackbone.get(pair)` is non-null, and only falls back to Dijkstra when
**no** direct edge exists. So a graph that *contains* a shorter chain is harmless as long as the
direct-edge guard is hit first.

## Method

Harness rebuilt `DistanceData` byte-for-byte like `repository.getData()` (same overlay merge,
same promotion of border стыки + БЧ table to `source:"kniga3"`). Three probes:

- **A. backboneTerminal contract** — for a 1-in-7 systematic sample (17 650 of 123 550) of every
  published direct ТП-pair, call the verbatim `backboneTerminal(a,b)` and assert `km ≥ published`.
- **B. latent chain risk** — for the same pairs, run kniga3 Dijkstra with THE direct edge removed,
  measuring how many pairs WOULD undercut if the guard were absent (sizes the risk the guard kills).
- **C. resolve-layer** — run full `computeDistance()` over sampled station pairs and check the
  backbone leg the engine actually charged against the published edge of those узлы.

## Results

| Probe | Population | Suspects | Meaning |
|-------|-----------|----------|---------|
| **A. backboneTerminal undercut** | 17 650 direct pairs (1-in-7) | **0** | Engine NEVER undercuts a published direct edge. Invariant holds RF-wide. |
| **B. latent chain undercut** | 17 650 direct pairs | **7 589 (43 %)** | Risk neutralized by the `directBackbone` AS-IS guard. |
| **C. resolve-layer self-undercut** | 820 + 8 654 station pairs | **0** | No illegal short path ever reaches `computeDistance`'s output. |

### undercutSuspectsBefore (the headline) = **0**

There are **0 actionable undercut suspects** at resolve time. The 43 % "graph has a shorter edge"
figure is a property the guard already neutralizes — it is NOT a defect and must NOT be "fixed" by
adding or deleting edges. The fix that mattered (return published direct AS-IS) is already in place
and provably airtight across the sampled population.

### Worst LATENT offenders (would undercut WITHOUT the guard — all caught)

These are the exact Решетниково family: Карелия/СПб ТП chaining south through an обходная ветвь.

| ТП pair | published km | chain-only km | Δ neutralized |
|---------|-------------:|--------------:|--------------:|
| Вяртсиля (эксп.) ↔ Лихославль | 1808 | 772 | 1036 |
| Суоярви I ↔ Торжок | 1746 | 886 | 860 |
| Лодейное Поле ↔ Тверь | 1521 | 707 | 814 |
| Кивиярви ↔ Сураж | 2369 | 1698 | 671 |
| Выборг ↔ Рудня | 1343 | 790 | 553 |

The "graph has a shorter chain" worst cases route through border/styk overlay узлы promoted to
kniga3 (Кигаш = РФ↔Казахстан стык, Орск→Тайшет, Завережье, Криничная, Басы). 22 of the top 25
go through such a node. Because those pairs all *also* have a published direct edge, the guard
returns the direct value and the chain is never charged — confirmed by Probe A returning 0.

## Решетниково узел-PATH check (km vs sequence)

Reference (R-Тариф, `reference-quotes-pending.json`):
`Элисенваара(0) → СПб-узел(199) → Кошта(666) → Александров(1184) → Ховрино(1340) → Решетниково(1432)`

Engine result for `023202 → 061108`:

- **km = 1432, confidence = green** — EXACT match on the endpoint km. ✓
- Legs charged: `spur Элисенваара→Хийтола = 21` + `backbone Хийтола→Ховрино = 1319 (published direct edge)` + `spur Ховрино→Решетниково = 92` = **1432**.
- **узел SEQUENCE does NOT match the reference.** The engine reaches Ховрино via the single
  published direct edge **Хийтола↔Ховрино = 1319** (it exists verbatim in `kniga3-backbone.json`),
  NOT via the R-Тариф северный-ход chain through Кошта/Александров.

**Why the sequence cannot match:** the reference chain has no representable edge path in our graph
— `СПб-узел↔Кошта` and `Кошта↔Александров` have **no** kniga3 edge (`directBackbone` = NONE,
adjacency empty). The reference узлы are R-Тариф's internal segmentation, not Книга-3 ТП↔ТП edges.

**Is this a bug?** No undercut, but a sequence mismatch worth flagging:

- The route is fully legal: every charged segment is a published Книга-3 edge or a published CSV spur. No fabricated km, no обходная ветвь.
- A latent trap exists here: full Dijkstra Хийтола→Ховрино = **819 km** (via СПб-Сорт-Московский) —
  far below the 1319 direct edge. The guard correctly suppresses this 819 chain and charges 1319,
  which is why the endpoint lands on 1432 instead of an illegal ~932. This is the invariant working.
- **Therefore the load-bearing GROUND TRUTH (km = 1432) is exact and the anti-undercut invariant
  holds for Решетниково.** The узел-sequence divergence is a transparency/explainability gap, not a
  pricing error: the engine charges the same total via a different (also-published) edge.

> NOTE for any future "match the узел sequence" work: it would require adding the СПб→Кошта→Александров
> intermediate edges (which are NOT in Книга-3 as ТП↔ТП pairs) — out of scope here and would risk
> the no-fabrication rule. The km oracle is the binding contract; it is met exactly.

## Confidence model

Unchanged. All audited resolves returned `confidence:"green"` where a route existed; `red` only on
genuinely missing edges. No yellow/red regressions.

## Verification

- `npx vitest run src/lib/distance --reporter=dot` → **46/46 pass** (4 km oracles 2444/699/3108/1432,
  АЯМ/Crimea coverage, all unit tests). Engine files untouched.

## Bottom line

- **undercutSuspectsBefore = 0** actionable (resolve-layer). No engine change needed.
- The `backboneTerminal` direct-AS-IS guard neutralizes a measured **43 %** latent obhodnoy-chain
  risk RF-wide, including the entire Решетниково family — generalized and confirmed.
- Решетниково km = 1432 exact ✓; узел sequence differs (legal alternate published edge) — flagged
  as an explainability note, not a defect.
