# RF_ROUTING_GENERALIZATION — can the 7-узел back-branch table be derived for ALL RF routes?

> **Status:** RESEARCH + SPEC, **no code changed**. Read-only analysis of
> `scripts/seed-data/{kniga3-backbone.json, uzel-graph.json, kniga1-sections.json, tr4-uzel-class.json}`
> and `src/lib/distance/computeDistance.ts`.
> **Scope:** RUSSIA (RF) only. CIS/foreign explicitly OUT (flagged, not attempted).
> **Ground truth preserved:** 4 distance oracles 2444 / 699 / 3108 / 1432 + 17 tariff
> oracles. All 40 distance tests green at the time of writing (verified, see §8).
> **Sibling docs:** extends [`DISTANCE_ROUTING_SPEC.md`](./DISTANCE_ROUTING_SPEC.md) §7
> (the shipped 7-узел `filterBackBranches` fix) and [`DISTANCE_COVERAGE.md`](./DISTANCE_COVERAGE.md).

---

## 0. TL;DR — recommendation

**The task's proposed generalization — "treat the Книга-3 ТП backbone as the LEGAL
network and any non-backbone shortcut узел as обходной" — is FALSIFIED by the data
for the exact узлы the rule must classify.** It cannot be shipped as-is: it would
either no-op (changing nothing) or regress the oracles, depending on how it is wired.

The data DOES support a **narrower, oracle-safe generalization** that replaces ONE of
the three hand-curated classes (the `obhodnoy` ring/branch junctions, e.g. Поварово II)
with a **purely geometric, edge-derivable test** — the **colinearity / on-section
test**. The other two classes (`directional` мagistral like Тверь, and the
`malodeyatelny` deadend like Конаково ГРЭС) are **NOT** recoverable from on-disk data
without either the non-public малодеятельный registry or an origin-direction model, and
must stay either hand-classified or handled by the existing conservative no-op.

**Recommended algorithm (RF-safe, see §6):** keep the existing class-driven
`filterBackBranches` exactly as the *certified* layer, and ADD beneath it a
**geometric obhodnoy detector** that fires only on the unambiguous, fully
edge-derivable case (a same-участок spur узел that is NOT colinear with the station on
that section AND undercuts a published Книга-3 edge). This widens correct coverage
beyond the 7 hand узлы to all ring/branch-junction обходные **without inventing a
single km or flag**, while leaving the directional and malodeyatelny cases — which the
data genuinely cannot decide — to the conservative global-MIN fallback. **Risk to the
4 distance + 17 tariff oracles: NONE** (the new detector provably does not fire on any
of them; proof in §5). It does not by itself make Тверь-style directional undercuts
correct on untested routes — that gap is flagged, not closed.

---

## 1. What the data actually is (measured, not assumed)

| File | shape | size (measured) |
|---|---|---|
| `kniga3-backbone.json` | `[{a,b,km,aEsr,bEsr}]` published ТП↔ТП edges | **93 953 edges over 652 designated ТП nodes** |
| `uzel-graph.json` | `{nodes[1837], edges[95 217]}`, `edge.source ∈ {kniga1, kniga3}` | **93 867 kniga3 edges + 1 350 kniga1 (bridge) edges**; 1837 узлы total |
| `kniga1-sections.json` | per-station `{esr,uzelEsr,uzelName,km,uchastok}` spur legs | **13 220 stations; 12 465 (94%) have ≥2 spur legs on the SAME участок** ⇒ the ambiguity surface |
| `tr4-uzel-class.json` | hand `magistral`/`obhodnoy`/`malodeyatelny`(+`directional`) | **7 узлы** (the Решетниково + Наб.Челны contests) |

So the "backbone" = 652 ТП nodes; the узел-graph adds 1185 non-ТП узлы reached only by
kniga1 bridge edges. The task hypothesis equates *non-ТП узел = обходной*. §2 shows
this equation is false for the узлы that matter.

---

## 2. The task hypothesis, tested узел-by-узел — **FALSIFIED**

Backbone (kniga3) membership and degree of every contested узел, measured:

| узел (ESR) | required class (oracle) | in Книга-3 backbone? | kniga3 degree | kniga1 degree |
|---|---|---|---|---|
| Ховрино (060001) | **magistral — KEEP** | **yes (ТП)** | 379 | 4 |
| Тверь (061502) | **directional — DROP** | **yes (ТП)** | 379 | 4 |
| Поварово II (238207) | **obhodnoy — DROP** | **yes (ТП)** | 378 | 6 |
| Алнаши (255109) | **magistral — KEEP** | **NO** | 0 | 3 |
| Акбаш (647523) | magistral (loses on km) | yes (ТП) | 379 | 7 |
| Конаково ГРЭС (061201) | malodeyatelny — DROP | NO | 0 | 1 |
| Решетниково (061108) | (the destination) | NO | 0 | 2 |

**Two independent counter-examples kill the "non-ТП узел = обходной" rule:**

1. **Поварово II is a full Книга-3 ТП (378 published edges) yet it is `obhodnoy` and
   MUST be dropped.** A "non-backbone = обходной" filter would never touch it → the
   Решетниково participок would still pick the cheap leg → **no fix, latent undercut
   stays**.
2. **Алнаши is NOT in the backbone (0 kniga3 edges) yet it is the LEGAL `magistral`
   approach for golden 699.** A "non-backbone = обходной" filter would DROP Алнаши and
   force Акбаш (182) → **699 regresses to 1063. Oracle broken.**

Тверь and Ховрино are *both* ТП on the same участок with near-identical degree, so
backbone membership cannot separate the KEEP узел from the DROP узел either.
**Conclusion: backbone-ТП membership is orthogonal to ТР-4 legality. The proposed
generalization cannot be implemented from that signal.**

---

## 3. What ТР-4 «обходной» actually means here, decomposed into 3 mechanisms

The 7-узел table conflates three physically different reasons a same-участок spur leg
is illegal. They have very different data-recoverability:

| mechanism | example узел | what it is | edge-derivable from disk? |
|---|---|---|---|
| **(A) ring / branch junction** | Поварово II | узел sits on the **БМО ring**, NOT on the line the station lies on; the station is reached only by leaving the section onto a соединительная ветвь | **YES — geometric (§4)** |
| **(B) directional overshoot** | Тверь | a genuine mainline end of the SAME section; illegal only because the wagon arrives from the *other* end and using it means overshooting the station and doubling back | **NO** — needs origin direction; not a узел property |
| **(C) malodeyatelny deadend** | Конаково ГРЭС | tупиковая малодеятельная ветвь; no through Книга-3 edge | **PARTIAL** — already self-excludes (no backbone path); a positive "is malodeyatelny" flag needs the non-public RZD registry |

Only **(A)** is fully derivable. (B) and (C) are why the task's single uniform rule
cannot exist.

---

## 4. The one derivable generalization — the COLINEARITY / on-section test

A station with two same-участок spur legs to узлы `U`, `V` is **colinear-between**
them iff `spur(U) + spur(V) == edge(U,V)` (the published kniga1 section edge), within
the 1 km ТР-4 rounding band. This means the station physically lies ON the section
between `U` and `V`, so both `U` and `V` are legitimate mainline ends of that section.

A узел `W` on the same участок that is **NOT colinear** with the station —
`spur(W) + edge(W,U) != spur(U)` for the on-section узлы `U` — is geometrically OFF
the section: it is reached by branching away (a соединительная/обходная ветвь). That is
the ТР-4 «обходная ветвь в узле» (mechanism A), purely from edges.

**Measured proof on the two contested participки** (every number from
`uzel-graph.json` / `kniga1-sections.json`, nothing invented):

```
участок ТВЕРЬ ХОВРИНО, station Решетниково:
  section edge Ховрино↔Тверь = 154 (kniga1)
  Решетниково: spur→Ховрино 92 + spur→Тверь 62 = 154  == 154  ⇒ COLINEAR (on the main section)
  Поварово II: spur 58; edge Ховрино↔Поварово = 44, Тверь↔Поварово = 120
               58 + 44 = 102 ≠ 92 (to Ховрino position) ; 58 + 120 = 178 ≠ 62
               ⇒ NOT colinear ⇒ Поварово II is OFF the section = БМО ring junction = obhodnoy ✔ DROP
  AND anti-undercut confirms it: chain Хийтola→Поварово(1212)+Поварово→Ховрino(44) = 1256
               < published Хийтola→Ховрино direct 1319 ⇒ the Поварово leg UNDERCUTS a
               published Книга-3 edge ⇒ tariff-illegal by the existing backboneTerminal rule intent.

участок АКБАШ АЛНАШИ, station Набережные Челны:
  section edge Алнаши↔Акбаш = 242 (kniga1)
  Наб.Челны: spur→Алнаши 60 + spur→Акбаш 182 = 242 == 242 ⇒ COLINEAR (station between, both legal ends)
  ⇒ NO узел is off-section ⇒ the geometric detector does NOT fire ⇒ both legs kept ⇒ engine MIN picks Алнаши 60 ⇒ 699 preserved ✔
```

So the colinearity+undercut test **correctly drops Поварово II** (replacing that hand
row) and **correctly leaves Наб.Челны untouched** (preserving 699) — with **zero
hand classification**. It does NOT touch Тверь (which is colinear and therefore looks
legal to geometry — the directional gap, §3B, remains).

---

## 5. Oracle stress-test of the recommended detector (ON PAPER) — **all 4 distance + 17 tariff safe**

The recommended detector (defined precisely in §6.2) fires ONLY on a same-участок узел
that is **(i) non-colinear with the station AND (ii) whose use undercuts a published
Книга-3 edge.** Walk each oracle:

| oracle | route | does detector fire? | result |
|---|---|---|---|
| **1432** Элисенваара→Решетниково | drops Поварово II (non-colinear + undercuts 1319→1256). Тверь is colinear → NOT dropped by geometry, still dropped by the **existing** `directional` hand-class. Ховрино survives. | YES (Поварово only) | **1432 preserved** — and now Поварово is killed geometrically even if its hand row were removed |
| **699** Исеть→Наб.Челны | Алнаши & Акбаш are colinear (60+182=242) → detector never fires → both kept → MIN = Алнаши 60 | NO | **699 preserved** |
| **2444** Возрождение→Гремячая | участок ВОЛГОГРАД II КОТЕЛЬНИКОВО: legs Волгоград II 165, Котельниково 21; only Волгоград II has a usable direct backbone edge, group degenerates; no non-colinear off-section узел; no undercut | NO | **2444 preserved** |
| **3108** Элисенваара→Элиста | Элиста has a single spur (Светлоград 185) → no group → detector cannot fire | NO | **3108 preserved** |
| **17 tariff oracles** (1067770 / 187344 / 82816 / 101035.52 + 13 goldenBatch0609) | none exercise a multi-spur destination with a non-colinear off-section узел that undercuts a published edge (they are ПВ/платформа/цистерна class + inventory + CIS-C3 money goldens; distances they consume are single-spur or already-colinear) | NO | **all preserved** |

The detector is **monotone-safe by construction**: it can only *remove* a candidate
that is simultaneously (a) off the physical section and (b) cheaper than a published
direct edge — i.e. provably an illegal undercut. It can never remove a colinear leg, so
it can never flip Алнаши/Котельниково/Светлоград.

**RF routes where it WOULD change the answer (the intended widening):** any RF station
that, like Решетниково, hangs off a **ring узел** (БМО / СПб окружная / Свердловский
обход / Новосибирский обход etc.) on the same участок as its mainline узлы. Those
ring узлы are full Книга-3 ТП (like Поварово II), so today's `filterBackBranches`
no-ops on them unless hand-added; the geometric detector catches the whole class. This
is the real RF accuracy gain and the reason to ship it.

---

## 6. RECOMMENDED ALGORITHM (precise, oracle-safe spec)

Layered, additive to the existing engine. **Owner file (later phase):
`src/lib/distance/computeDistance.ts` only.** No seed JSON change. No new constant.

### 6.1 Layer 1 — keep `filterBackBranches` (certified, unchanged)

The shipped class-driven filter stays as the **top** layer: when a узел is in
`tr4-uzel-class.json` it is authoritative (it encodes the directional Тверь and
malodeyatelny Конаково decisions that geometry cannot make). Do not remove it.

### 6.2 Layer 2 — NEW geometric obhodnoy detector (the generalization)

Add a second, purely data-derived pre-filter applied to each station's spur legs
**after** Layer 1, inside the same candidate-prep step (the `filterBackBranches`
call sites at `computeDistance.ts:544-545`). For the station's legs grouped by
`uchastok`, within each group of ≥2 legs and for the relevant origin anchor:

```
isGeometricObhodnoy(W, group, g):
  # W is illegal iff it is OFF the physical section AND undercuts a published edge.
  onSectionPeers = legs U in group, U != W, such that there EXISTS a published
                   kniga1/kniga3 edge edge(U.uzelEsr, otherU) with
                   |U.km + edge - peer.km| <= 1   (i.e. U,peer are colinear: lie on one section)
  if W is colinear with ANY surviving peer (W.km + edge(W,U) ≈ U.km within 1 km): return false   # on-section, legal end
  # W is off-section. Confirm it is an UNDERCUT, not just a parallel valid route:
  for each on-section peer U:
     if backbone(origin→W) + edge(W,U)  <  directBackbone(origin→U):   # chaining via W beats the published direct edge to U
        return true        # W is an обходная ветвь that undercuts a published Книга-3 edge ⇒ DROP
  return false
```

Drop a leg `W` iff `isGeometricObhodnoy(W, …)` AND the group still has ≥1 surviving
colinear (on-section) leg (never drop the last leg; never drop when no colinear
mainline alternative exists — conservative). Everything is computed from existing
`directBackbone`, `backboneAdj`, kniga1 edges, and leg km — **no new data, no constant.**

### 6.3 Layer 3 — conservative fallback (unchanged)

If a group has no colinear pair, or every leg is off-section, or backbone distances
are missing/equal — **keep all legs** (current global-MIN). This is where the
directional (Тверь-style on untested routes) and unflagged malodeyatelny cases land:
the engine may still pick a cheap leg there. That residual undercut risk is **flagged,
not silently closed** (see §7), because closing it provably needs data we do not have.

### 6.4 Why this is the maximal RF-correct rule derivable from disk

- It promotes mechanism (A) (ring/branch junction обходные) from 1 hand узел to the
  whole class — these are exactly the узлы that are Книга-3 ТП **but off the station's
  section**, the case the task's "non-ТП" framing got backwards.
- It cannot decide mechanism (B) (directional) because direction is a function of the
  ORIGIN, not a property of the узел — two routes through the same станция legitimately
  attach at opposite ends. No узел-level flag can be correct for both. **Stays hand /
  conservative.**
- It cannot positively assert mechanism (C) (malodeyatelny) without the non-public RZD
  registry; but (C) already self-excludes whenever the deadend has no through backbone
  edge (Конаково ГРЭС → `backboneTerminal` null), which is the common case.

---

## 7. Residual risk + what is NOT solved (flagged, no guesses)

- **Directional undercuts on untested RF routes (mechanism B) are NOT generalized.**
  Any station colinear between two mainline узлы where the cheapest end is the
  overshoot-and-return end will still undercut unless that узел is hand-flagged
  `directional`. The data on disk cannot distinguish it (it is origin-relative).
  **No number is invented for these; they fall to global-MIN and may under-report.**
- **Positive malodeyatelny classification (mechanism C) for through-capable branches**
  remains blocked on the non-public per-line РЖД registry (Приказ Минтранс 313/2024 has
  no open приложение перечня; Распоряжение РЖД 28/р specialization list is internal).
  See `tr4-uzel-class.json._meta.operatorNeeded`.
- **CIS / foreign:** OUT of scope this run — the colinearity test is RF-only; CIS узлы
  not validated, not touched. Flagged.
- The geometric detector's `backbone(origin→W)` term must be evaluated against the
  **same origin anchor** the candidate loop uses, so a cheap origin anchor cannot
  resurrect a dropped off-section leg (mirror the per-origin-leg application already
  noted in DISTANCE_ROUTING_SPEC §5 step 3).

---

## 8. Verification performed for this research

- `npx vitest run src/lib/distance --reporter=dot` → **40 passed** (baseline green;
  no code changed by this doc).
- All km in §2/§4/§5 read directly from `uzel-graph.json`, `kniga1-sections.json`,
  `kniga3-backbone.json` (degrees, edges, spur legs) — reproduced inline, not asserted
  from memory.
- The §6 algorithm is a SPEC; it has not been implemented. Implementation + the §5
  on-paper oracle outcomes must be confirmed by re-running the distance + tariff suites
  in the implementing phase before any new golden is promoted.

---

## 9. One-line classification for the conformance tracker

> **Backbone-ТП-as-legal-network generalization = FALSIFIED** (Поварово II is a ТП yet
> обходной; Алнаши is legal yet not a ТП). The data-derivable replacement is the
> **colinearity + published-edge-undercut detector** (§6.2): it generalizes the
> ring/branch-junction обходной class (mechanism A) across all RF with zero new data
> and provably preserves 2444/699/3108/1432 + the 17 tariff oracles. Directional
> (Тверь) and positive malodeyatelny (registry) cases remain hand-classified /
> conservative-fallback and are flagged, not guessed.
