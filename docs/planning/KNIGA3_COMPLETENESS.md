# Книга-3 (ТР-4 Книга 3) — Completeness Acquisition Report

**Goal.** Assemble the COMPLETE ТР-4 Книга 3 — the network of transit points (ТП) with
their published ТП↔ТП distances — by acquiring every ТП and every published adjacency
edge from primary sources, and wire the full matrix into the distance engine without
moving any ground-truth oracle.

**Honest verdict: PARTIAL COVERAGE, FULLY VALIDATED, NON-DISRUPTIVE.**
The acquisition pass discovered **zero additional ТП and zero additional ТП↔ТП pairs**
beyond the existing backbone. tr4.info's per-ТП adjacency pages re-expose exactly the same
652-ТП / 93,953-pair network the backbone already held. The merge is therefore not a no-op
only in that it revised **20 km values downward** (verbatim shorter distances published on
tr4.info per-ТП pages), which `compileGraph` now keeps as additive precision. Do **not**
read this as "Книга-3 is complete" — it means tr4.info exposed no ТП beyond the 652 we had,
and the remaining gap (below) is real.

---

## 1. Counts — before / after

| Metric | Before (backbone) | After (full merge) | Δ |
|--------|-------------------|--------------------|---|
| ТП (nodes in ТП↔ТП edge set) | 652 | 652 | **0** |
| ТП↔ТП pairs (undirected, deduped) | 93,953 | 93,953 | **0** |
| Edges sourced from tr4.info | 0 | 20 | +20 (revised km, not new pairs) |
| Edges sourced from kniga3-backbone | 93,953 | 93,933 | −20 (superseded by shorter tr4.info km) |

- `kniga3-tp-index.json`: 652 ТП, **all** flagged `inBackboneAlready: true`, **0** flagged
  unfetchable/empty-tbody in the final index.
- 11 acquire batches (`kniga3-edges-batch-0…10.json`): 165,188 raw directed/duplicated
  edge rows → collapse to the **same 93,953 undirected pairs** already in the backbone
  (verified: NEW pairs from batches = 0).
- Of the 93,953 pairs, **42** had a tr4.info km differing from the backbone km; for **20**
  of those the tr4.info per-ТП page published a strictly **shorter** verbatim distance.
  `compileGraph` keeps the shortest edge per pair, so exactly those 20 now carry
  `source: "kniga3"` from tr4.info.

**Merge proof.** Re-running the merge (backbone ∪ 11 batches, normalized aEsr<bEsr,
shortest-km-per-pair) reproduces `kniga3-full.json` with **0 mismatches**; all 93,953 rows
are normalized (no aEsr≥bEsr); final source split = 93,933 `kniga3-backbone` + 20 `tr4.info`.

---

## 2. Connectivity — before / after

Measured on the **standalone** kniga3 ТП↔ТП edge set (not the live engine graph):

| | Before | After |
|--|--------|-------|
| Largest connected component | 383 / 652 nodes | 383 / 652 nodes |
| % connected | 58.74% | 58.74% (**unchanged**) |

Topology is identical — the merge only revised 20 km values, so no node joined or left the
giant component. The 58.74% figure is the connectivity of the **ТП↔ТП layer in isolation**;
the remaining 269 ТП are not islands in production — in `repository.ts` these edges are
unioned with the full узел graph (baseGraph + `cisFill` + `cisBackbone` + `gapFill` +
`gapFill2` + `kniga1Adj` + АЯМ + Crimea), where RF reachability is far higher. The standalone
58.74% is reported only to characterize the Книга-3 layer honestly, not to imply 41% of
routes are unroutable.

---

## 3. Unfetchable ТП

In the final acquisition, **0** of 652 ТП are flagged unfetchable in the index. The two ТП
called out in the method as risky — **021609 Возрождение** and **612709 Гремячая** — have an
**empty `<tbody>`** on their tr4.info `/tp/<esr>` page (no published neighbor rows). They were
correctly **NOT guessed**: their adjacency comes from the backbone, and the engine routes
**021609 → 612709 = 2444 km EXACT** (ground-truth oracle, see §5) through backbone edges, not
through any fabricated tr4.info neighbor. This is the intended "honest partial coverage"
behavior: an empty-tbody page contributes no edges rather than inventing them.

No ТП page that *did* render was dropped; every km in every batch is copied verbatim from a
fetched `https://tr4.info/tp/<esr6>` page (cited per edge in the batch `source` field).

---

## 4. Wiring

`src/lib/distance/repository.ts`:

- New loader `loadKniga3Full()` (mirrors `loadCisBackbone()`): reads `kniga3-full.json`,
  emits узел edges `{aEsr, bEsr, km, uchastok:"kniga3-full", source:"kniga3"}`, tolerates a
  missing/empty/non-array file (returns `[]`).
- Appended to the узел graph edge list alongside `cisFill`, `cisBackbone`, `gapFill`,
  `gapFill2`, `kniga1Adj`, АЯМ, Crimea. Because the matrix is **additive** and
  `compileGraph` keeps the shortest edge per pair, the merge can only ADD legal precision —
  it cannot push any RF route upward.

---

## 5. Validation — ground-truth oracles (all EXACT)

Asserted in `src/lib/distance/computeDistance.test.ts` and
`src/lib/distance/aymCrimeaCoverage.test.ts`, all passing:

| Oracle | Route | km | Result |
|--------|-------|----|--------|
| GT-A | 021609 Возрождение → 612709 Гремячая | 2444 | **EXACT** |
| GT-B | 771500 Исеть → 648503 Наб. Челны | 699 | **EXACT** |
| GT-C | 023202 Элисенваара → 528706 Элиста | 3108 | **EXACT** |
| GT-D | 023202 Элисенваара → 061108 Решетниково | 1432 | **EXACT** (Ховрино, not Тверь-62) |
| АЯМ | 913403 → 910000 | — | **COVERED / PASS** |
| Crimea | 856200 → 856107 | — | **COVERED / PASS** |

**Test suite:** `src/lib/distance` 49/49 pass; full `src/lib` 690/690 pass (includes the 17
tariff oracles + golden R-Тариф / universal / N8 / batch-0609 golden suites). `tsc --noEmit`
exits 0.

**Non-disruption proof.** The 20 improved edges sit only on ТП 642102 / 640003, which lie on
no reference route — so every reference quote is byte-identical on backbone-only vs full-merge.

---

## 6. Per-route validation (reference quotes)

`scripts/seed-data/reference-quotes-rtariff.json` (10 cases): cases 1–9 all **d=0 EXACT**
(841 / 244 / 1367 etc.). Cases 9–10 (Тёплая Гора 766502 → Новая Чара 904300): ref **4688**,
ours **4622**, **d=−66** — this is **PRE-EXISTING** (identical on the backbone-only baseline;
NOT introduced by this merge).

`reference-quotes-batch-0609.json`: INV-1 and INV-6_20 are the same 766502 pair carrying the
same pre-existing −66; all other batch-0609 invoices match.

---

## 7. Красный Сокол → Бологое (the 801 question)

**Result: UNCHANGED — still 539 km, NOT 801.** The full matrix did **not** fix it, and was
never expected to: this is an **engine routing-rule** problem, not a missing-ТП-edge problem.

Per `CALIBRATION_REPORT.md` §4.4, a naïve Dijkstra over the merged graph **chains** published
Книга-3 + Книга-1 edges through Окуловка / Бологое / Ховрино / Раненбург — an illegal
«обходная/соединительная ветвь» (high-speed / connecting branch) that undercuts the published
direct distance. Книга-3 numbers are pairwise-precomputed and overlap on shared trunk, so
chaining double-discounts. Adding more ТР-4 ТП edges cannot help (and the acquisition added
**zero** new ТП/pairs anyway). The fix is a **published-direct-edge / high-speed-line
exclusion rule** ("never accept a chained shortcut below any published direct edge between the
same endpoints"), which is engine logic, out of scope for this data-acquisition pass.

---

## 8. Remaining gap (honest)

1. **No ТП beyond the 652.** tr4.info exposed exactly the backbone's 652 ТП — the canonical
   ТР-4 Книга 3 ТП list is widely cited as ~660+ transit points; any ТП not present on
   tr4.info's `/tp/rw/<id>` railway-list pages is **not** in this universe. Source coverage,
   not parsing, is the bound here.
2. **2 empty-tbody ТП (021609, 612709)** publish no adjacency on tr4.info; their edges come
   only from the backbone. No alternative primary source (docs.cntd.ru / garant / consultant /
   cssrzd.ru / web.archive.org) was found that publishes their ТП↔ТП rows verbatim.
3. **269/652 ТП outside the standalone Книга-3 giant component** — these are reachable in the
   live engine via kniga1/gapfill/cis bridges, but the **pure published ТП↔ТП adjacency** for
   them is sparse. Where a region's ТП↔ТП km is simply not published on any reachable source,
   that is left as honest absence — no edge was interpolated.
4. **Бологое 539 vs 801** — needs the high-speed-line exclusion rule (engine), not more data.

**Bottom line.** The "full matrix" is assembled, verified, additive, and non-disruptive — but
it is the **same 652/93,953 network** the backbone already covered. Coverage is partial because
the primary sources expose no further ТП, not because of acquisition failure. No km was ever
invented or interpolated; every edge cites a fetched primary source.
