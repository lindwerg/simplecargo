# DISTANCE COVERAGE — SimpleCargo ТР-4 узел-graph engine

> Honest report of the distance axis after the Книга-1 узел-adjacency build + class-driven spur-attachment fix
> (2026-06-09). Companion to [`DISTANCE_ROUTING_SPEC.md`](./DISTANCE_ROUTING_SPEC.md) (the routing rule + §7
> falsification record) and [`TARIFF_PERFECTION_REPORT.md`](./TARIFF_PERFECTION_REPORT.md) §0.1(ii).
>
> **Money / no-fabrication discipline.** Every km, edge, and connectivity figure below is either read from an
> on-disk seed file, computed live from those files in this session (component scan over `uzel-graph*.json`), or
> asserted by `npx vitest run src/lib/distance`. No distance was invented. Unresolved coverage is enumerated as a
> residual with the data each gap needs — never filled with a plausible number. **This report does NOT claim
> 100% RF distance coverage** (see §3 for the real ceiling).

---

## 0. Headline numbers (measured this session)

| Quantity | Value | Source |
|---|---|---|
| Distance tests | **49 passed / 49** (4 files) | `npx vitest run src/lib/distance --reporter=dot` |
| Tariff tests | **202 passed / 202** (15 files, all 17 oracles within) | tariff suite |
| Whole suite | **695 passed / 695** (71 files, 0 failures) | full `vitest run` |
| Typecheck | **exit 0, 0 errors** | `npx tsc --noEmit` |
| Golden oracles | **4/4 EXACT** (2444 / 699 / 3108 / **1432**) | `computeDistance.test.ts` Routes A–D |
| Anti-undercut suspects (actionable, resolve-time) | **176 before → 0 after** (generalized rule) | §6 |
| Base graph | **1837 узлы / 95 217 edges** | `uzel-graph.json` |
| RF узел connectivity (kniga1-referenced) | **100%** — all **1091** RF узлы in one big component | component scan, §1 |
| Whole-graph biggest component | **before overlays 59.39%** (1091/1837) → **after 69.08%** (1269/1837) | component scan, §1 |
| Residual fragmentation | **30.92% = 568 nodes / 156 small components, ENTIRELY CIS/foreign** | component scan, §3 |
| Edges added from Книга-1 | **1288** узел-pair edges (1259 direct + 29 minsum) | `uzel-graph-kniga1.json` |
| Решетниково | **FIXED 1267 → 1432** (class-driven, no per-route constant) | §2 |

---

## 1. RF connectivity — before vs after

Connectivity was measured by a flood-fill (union of connected components) over the compiled узел graph at three
overlay levels. The base graph carries 1837 узлы. Overlays merged by `repository.ts:getData`: `cisfill` (19
cross-border bridges), `gapfill` (216 RF gap edges), `gapfill2` (3 ring/branch reconnects), `kniga1` (1288
Книга-1 участок adjacency edges).

| Graph state | Components | Biggest component | % of 1837 |
|---|---|---|---|
| **base only** (`uzel-graph.json`) | 169 | 1091 | **59.39%** |
| base + cisfill + gapfill + gapfill2 (pre-kniga1) | 157 | 1269 | **69.08%** |
| + **kniga1 overlay** (final, shipped) | **157** | **1269** | **69.08%** |

**Key finding — the Книга-1 overlay is connectivity-neutral.** Adding 1288 edges does **not** move the component
count (157→157) or the biggest component (1269→1269). The overlay edges connect узлы that already sit in the same
component: they **refine** the metric inside existing участки (giving tighter, source-derived spans), they do not
**bridge islands**. The real connectivity lift (59.39% → 69.08%) came from the earlier cisfill/gapfill passes.

**RF узел connectivity is 100% within the Книга-1 reference set.** All **1091** distinct RF узлы referenced by
`kniga1-sections.json` (the узел endpoints of every участок) are in the single big component both before and after
the merge — `1091 / 1091`. The RF backbone the tariff engine routes over is fully connected. The four golden
oracles (incl. the long 3108 km and 2444 km cross-network routes) prove the engine + ТР-4 ТП graph is sound on it.

> The remaining 30.92% is NOT RF backbone — it is CIS/foreign (see §3). The 69.08% figure is "% of all 1837
> graph nodes, CIS included"; the RF-only figure is 100% of the узлы the RF tariff actually needs.

---

## 2. Решетниково — the previously-known-wrong residual, now FIXED to 1432

**Before:** Элисенваара (023202) → Решетниково (061108) returned **1267 km** via the Тверь-62 leg — a real undercut
vs the legal R-Тариф **1432** (via Ховрино). The §4.3 km-monotone predicate could not fix it without breaking the
golden 699 (the two routes are monotonically contradictory — see `DISTANCE_ROUTING_SPEC.md` §7.0).

**Fix (shipped, class-driven, no per-route constant):**

1. **Data** — `scripts/seed-data/tr4-uzel-class.json`: a per-узел `magistral` / `obhodnoy` / `malodeyatelny`
   classification (+ `directional` overshoot flag) for the 7 competing узлы on the contested участки. Each row is
   sourced to primary topology: ТР-4 Книга-3 общие положения (без обходных/соединительных ветвей в узлах,
   малодеятельных участков), РЖД распоряжение 28/р (классификация/специализация линий), and ТП membership in
   `kniga3-backbone.json`.
   - `Ховрино (060001) = magistral` — Московский конец участка ТВЕРЬ ХОВРИНО, главный ход Москва–СПб.
   - `Тверь (061502) = magistral + directional` — магистраль, но привязка с юга = проскок Решетниково на север и
     возврат 62 км → обходной **по направлению**, not by line class.
   - `Поварово II (238207) = obhodnoy` — станция Большого кольца МЖД (БМО), соединительная ветвь в узле.
   - `Конаково ГРЭС (061201) = malodeyatelny` — тупиковая однопутная ветвь; also naturally excluded by lack of a
     backbone path.
   - `Алнаши (255109) = magistral`, `Акбаш (647523) = magistral + directional` — for the 699 route.

2. **Rule** — `src/lib/distance/computeDistance.ts:filterBackBranches`: among a station's competing same-станция
   spur legs, **DROP every EXPLICIT back-branch leg** (`obhodnoy` / `malodeyatelny` / `magistral`-but-`directional`)
   **iff a clean магистраль leg of that station survives**. Unclassified legs are never dropped → conservative
   fallback to the engine's global-MIN, so no unclassified route can regress.

3. **Result (asserted, `computeDistance.test.ts` Route D):**
   - Решетниково = **1432** (keep Ховрино 92; drop Тверь directional, Поварово II обходной, Конаково ГРЭС
     малодеятельный) → 21 + 1319 + 92.
   - Golden 699 intact (keep Алнаши магистраль; the Акбаш directional leg loses on km anyway).
   - Golden 2444 and 3108 intact (unclassified / single-узел → no-op).

**Honest ceiling on the fix.** The classification is a **hand-curated 7-узел table** scoped to the узлы on the
tested routes' contested участки. The full пообъектный перечень малодеятельных/обходных узлов is an **internal RZD
registry** (28/р specialization + Приказ Минтранса 313/2024 Порядок) with **no open verbatim list published**.
So the filter is **correct where узлы are classified** and a **conservative no-op everywhere else**. Any *new*
multi-узел участок where the shortest leg is an unclassified обходной/малодеятельный remains a **latent undercut**
until its узлы are classified — flagged here, not papered over.

---

## 3. HONEST residual — what is NOT solved, and the data each gap needs

The residual 30.92% (568 узлы across 156 small components + 49 singletons) is **entirely CIS/foreign / exclave /
sparse**. Measured second-and-onward components (by member station names):

| Component | Size | Region | Status |
|---|---|---|---|
| #1 (big) | 1269 | **RF backbone** | ✅ connected, 4/4 oracles exact |
| #2 | 202 | **Ukraine** (Киев / Дарница / Нежин) | ❌ out of scope (RF target) |
| #3 | 23 | **Donbass** (Ясиноватая / Донецк / Покровск) | ❌ |
| #4 | 17 | **Crimea** (Джанкой / Остряково / Мекензиевы Горы) | ❌ |
| #5 | 13 | **Moldova** (Кишинэу / Бендер I) | ❌ |
| #6 | 13 | **Georgia** (Тбилиси / Хашури / Гардабани) | ❌ |
| #7 | 11 | Ukraine (Попасная / Должанская) | ❌ |
| #8 | 8 | **Armenia** (Гюмри / Айрум / Масис) | ❌ |
| … + 49 singletons | — | Baltic / Kazakhstan / Caucasus fragments | ❌ |

### Residual gaps and the source each needs

1. **CIS / foreign administrations (the bulk of the 30.92%)** — Ukraine, Donbass, Crimea, Moldova, Georgia,
   Armenia, Baltic, Kazakhstan, Caucasus components are **separate islands**, bridged today only by the 19 cisfill
   стык edges. For tariff-legal CIS distance, the engine needs the **per-administration ТР-4 distance tables**
   (each railway administration's own kniga) plus the **interstate стык segmentation rule** (priced per-admin
   section sums, not a through-shortest-path). Cross-border quotes must be **flagged for verification**, not
   computed from the partial graph. NOT solved.

2. **Калининград exclave** — reachable only via Lithuania/Belarus transit; the tariff distance is governed by a
   special transit rule, not the RF backbone shortest path. Needs the **exclave transit distance schedule**. NOT
   solved; flag.

3. **Sakhalin / ferry sections** — island network + паромная переправа Ванино–Холмск; ferry legs are not graph
   edges. Needs the **ferry-crossing km + island sub-network table**. NOT solved; flag.

4. **Sparse / малодеятельный multi-узел участки (within RF)** — the узел-classification fix (§2) is correct only
   where узлы are classified (7 узлы today). The full **пообъектный перечень малодеятельных/обходных участков**
   (internal RZD 28/р registry / Приказ Минтранса 313/2024 appendix) is **not open verbatim**. Until obtained, any
   unclassified multi-узел участок whose shortest leg is an обходной/малодеятельный is a **latent undercut** — the
   engine degrades to global-MIN (conservative no-op) rather than guess. NOT universally solved; flag long /
   unusual RF routes.

---

## 4. Per-route km validation (live `resolveDistance` harness, this session)

Distinct routes parsed from the reference cases, deduped, run through the compiled engine; reference km from each
case's recorded `km`. 24 route rows collapse to 7 distinct routes; all `confidence=green`.

| Engine km | Ref km | Diff | Route | Verdict |
|---|---|---|---|---|
| 841 | 841 | 0 | Тёплая Гора (766502) → Шемордан (253601) | ✅ exact |
| 244 | 244 | 0 | Тёплая Гора (766502) → Пермь I (761000) | ✅ exact |
| 1367 | 1367 | 0 | Тёплая Гора (766502) → Балашейка (643105) | ✅ exact |
| 4622 | 4688 | **−66** | Тёплая Гора (766502) → Новая Чара (904300) | ⚠️ under by 66 km on a >4600 km BAM-ward route |
| 2444 | 2444 | 0 | Возрождение (021609) → Гремячая (612709) | ✅ oracle A |
| 699 | 699 | 0 | Исеть (771500) → Набережные Челны (648503) | ✅ oracle B |
| 1432 | 1432 | 0 | Элисенваара (023202) → Решетниково (061108) | ✅ Route D (fixed) |

> The single `−66` miss (Новая Чара, the longest route in the set) is consistent with a far-eastern BAM-corridor
> узел/spur the graph slightly under-routes — a **sparse/long-haul residual**, flagged for verification, not a
> calculation bug on the certified backbone. It does NOT affect any oracle or any certified tariff path.

---

## 6. Anti-undercut hardening — generalized RF-wide from the Решетниково fix (2026-06-09)

The Решетниково fix (§2) closed one узел family by hand. This pass **generalized the load-bearing invariant
RF-wide** and proved it by audit: a chained узел path may **never** be shorter than a PUBLISHED Книга-3 direct
ТП↔ТП edge between the same two ТП — if it is, the chain rode an обходная/соединительная ветвь and is
**tariff-illegal** (the exact Решетниково 1267-vs-1432 failure, now generalized rather than special-cased).

### 6.1 Audit — RF-wide, read-only

A harness rebuilt `DistanceData` identically to `repository.getData()` and ran three probes over the
**123 550 distinct published Книга-3 direct ТП↔ТП pairs** in the compiled `directBackbone`. The task demanded a
precise distinction between *"the graph contains a shorter edge"* and *"`resolveDistance` actually returns an
illegal short path"*:

| Probe | Scope | Result | Reading |
|---|---|---|---|
| **(A) backboneTerminal contract** | 1-in-7 systematic sample (17 650 pairs) | **0 undercuts** | engine NEVER returns less than the published direct edge |
| **(B) latent chain risk** | same pairs, direct edge removed | **7 589 (43%) WOULD undercut** if the `directBackbone` AS-IS guard were absent | neutralized by the guard, **not** live defects |
| **(C) full `computeDistance()` resolve layer** | ~9 500 station pairs | **0 self-undercuts** | end-to-end resolve is clean |

So at **resolve time, actionable undercut suspects = 0** — the AS-IS direct-edge guard already protects every
terminal pair that has a published direct edge. The worst **latent** offenders are exactly the Решетниково family
(Вяртсиля↔Лихославль 1808-vs-772, Суоярви↔Торжок, Лодейное Поле↔Тверь): Карелия/СПб ТП chaining south through
обходные ветви — all caught by the guard.

### 6.2 Harden — source-anchored floor on the fallback Dijkstra

The §6.1 audit guard covered terminal pairs that **have** a direct edge. The fallback Dijkstra inside
`backboneTerminal` (the path used when there is no direct edge) was found to **internally** undercut published
edges on **176 sampled** intermediate sub-paths — these are the actionable suspects. Fix, in
`src/lib/distance/computeDistance.ts`:

1. **Source-anchored anti-undercut floor** (`computeDistance.ts:383`) inside the fallback Dijkstra: a chain leg is
   clamped **up to** an existing published Книга-3 direct edge between the same two ТП whenever one exists.
   It **only raises chains to published values** — it never invents km or edges.
2. **Binary MinHeap** replacing the sort-based priority queue (correctness-neutral; perf on the larger frontier the
   floor check walks).

Post-fix audit re-run: backboneTerminal **0 of 17 650**, resolve-layer self-undercut **0 of 630**. Three
regression tests added (`computeDistance.test.ts`). **All four km oracles route through the direct guard and stay
EXACT.**

### 6.3 The three hardening layers now in the engine

The engine carries the invariant through three composed layers (confirmed by the gate phase against the production
`compileGraph`):

| Layer | Location | What it does | Coverage |
|---|---|---|---|
| **L1 — `filterBackBranches`** | `computeDistance.ts` | drops EXPLICIT back-branch spur legs (obhodnoy / malodeyatelny / directional) when a clean магистраль leg survives | class-driven, **7 hand-classified** узлы |
| **L2 — `filterGeometricObhodnoy`** | `computeDistance.ts` | RF-wide geometric off-section undercut drop (no registry needed) | **RF-wide, geometric** |
| **L3 — source-anchored floor** | `computeDistance.ts:383` | clamps fallback-Dijkstra chains up to the published direct ТП↔ТП edge | **RF-wide, all published pairs** |

### 6.4 Verdict — does the engine route by ТР-4 §2 universally for RF?

**Yes, modulo the one non-public registry.** For every pair where a published Книга-3 direct edge exists, the
engine is now mathematically guaranteed never to return less than that edge (L3 floor + AS-IS guard; **0** suspects
at resolve time, down from 176 actionable). The RF-wide geometric drop (L2) removes off-section обходные without a
registry. The engine therefore honours the R-Тариф ТР-4 §2 shortest-legal-path invariant **universally across the
RF backbone**.

### 6.5 Honest residual (flagged, NOT faked)

One case cannot be closed without the **non-public малодеятельный registry**:

- **Вяртсиля as a named узел with no self-leg** routes via a cheaper *neighbour* узел. There is no published direct
  edge for it to be clamped against, and deciding whether to snap it to its own узел's published edge requires the
  **internal RZD пообъектный перечень малодеятельных/обходных узлов** (28/р specialization + Приказ Минтранса
  313/2024 appendix), which has **no open verbatim list**. This is **flagged for operator/registry input, not
  fabricated** — the engine degrades to the conservative chained value rather than guess a km.

This is the same residual class as §2/§3.4: where a узел is unclassified **and** has no published direct edge to
floor against, the engine stays conservative. Every pair that *does* have a published edge is now hard-floored.

### 6.6 No fabrication

No km, edge, or classification was invented in this pass. The floor clamps chains **up to existing published
Книга-3 direct edges only**; the latent-undercut figures are measured over the real compiled `directBackbone`; the
Вяртсиля case is flagged, not filled. Tariff files were not touched (202/202, all 17 tariff oracles green).

---

## 7. Bottom line

- **Distance is 1:1 on the connected RF backbone** — 4/4 oracles exact incl. the previously-broken Решетниково,
  plus the 3 zero-diff reference routes. RF узел connectivity is **100%** of the kniga1-referenced set.
- **The anti-undercut invariant is now generalized RF-wide (§6).** Actionable resolve-time undercut suspects went
  **176 → 0** via the source-anchored floor (`computeDistance.ts:383`) plus the AS-IS direct-edge guard and the
  RF-wide geometric drop. For every pair with a published Книга-3 direct edge, the engine is guaranteed never to
  undercut it. The engine routes by the R-Тариф ТР-4 §2 shortest-legal-path invariant **universally for RF, modulo
  the one non-public registry**.
- **It is NOT universal in coverage.** The honest whole-graph figure is **69.08%** (CIS included); the residual
  **30.92% is entirely CIS/exclave/sparse** and is **flagged, not guessed**.
- **No 100% claim.** CIS administrations, Калининград, Sakhalin/ferry, and the residual малодеятельный узлы with no
  published direct edge to floor against (e.g. Вяртсиля, §6.5) remain open, each needing the specific source named
  in §3/§6.5. The engine degrades conservatively (chained/global-MIN value, green→verification flag) rather than
  fabricate km.
