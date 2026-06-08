# TARIFF_WIRING_SPEC — surgical wiring of acquired datasets into the engine

Audience: main developer. Goal: wire each VERIFIED-REAL acquired dataset into the ТР-1 2026 /
ТР-4 engine **without moving the four golden numbers**:

| Golden | Route | Expected |
|--------|-------|----------|
| G1 | ЭФ164189 Возрождение(021609)→Гремячая(612709) 2444 km × 15 ваг | **1 067 770 ₽** без НДС |
| G2 | ЭТ201459 Исеть(771500)→Наб.Челны(648503) 699 km × 6 ваг | **187 344 ₽** (31 224 ₽/ваг) |
| D1 | distance 021609→612709 | **2444 km** |
| D2 | distance 771500→648503 | **699 km** |

Golden-safety harness for **every** step below is the same:

```bash
npm test -- goldenN8 goldenUniversalOracle goldenUniversal
# all green ⇒ 1067770 / 187344 / 2444 / 699 intact
```

Golden tests live in `src/lib/tariff/goldenN8.test.ts`,
`goldenUniversalOracle.test.ts`, `goldenUniversal.test.ts`. Run them after each item; if any
golden moves, the wiring touched a hot path — revert and isolate.

---

## Architecture recap (where things load today)

- **Tariff I/O**: `src/lib/tariff/repository.ts` — `computeTariff()` loads rate/scheme/K1/K3/K4/
  innovative/ETSNG via `seedLoader.ts` singletons + DB coefficients/indexations, hands plain arrays
  to the PURE core `computeTariffPure` (`computeTariff.ts`). **No DB needed for rate tables.**
- **Distance I/O**: `src/lib/distance/repository.ts` — `getData()` compiles a module-singleton graph
  from `kniga1-sections.json` + `uzel-graph.json` (+ `cisfill`/`gapfill`/`gapfill2` edges) + `hub-distances.json`
  + `special-distances.json`. Pattern to mirror: `loadCisFill()` / `loadGapFill()` / `loadGapFill2()`
  (tolerant `try/catch → []`, normalize raw row → `UzelEdge`).
- **Scope guard**: `src/lib/tariff/quoteService.ts:99–113` refuses out-of-contour quotes
  (`isForeignEsr` → international, ownership≠own, type≠полувагон, class≠1).
- **Hub/узел support is ALREADY in the core**: `computeDistance.ts` has `HubEntry.lines`,
  `resolveHubLine()`, and the +54/+25 same-radial-line exclusion (lines 55–74, 299–344, 433).
  **The only gap is plumbing**: `repository.ts:134` maps hubs but **DROPS `lines`** (and `kmPassengerBaggage`).

---

## Item-by-item wiring

### W1 — узел `lines` plumb (Moscow +54 / SPb +25 same-line exclusion) — READY-TO-WIRE ⭐ highest value

**Status**: sourced-official (`acq-uzel-msk`, `acq-uzel-spb`, `acq-uzel-other` all VERIFIED-REAL).
The engine logic exists and is dormant **only because the loader strips `lines`**.

**The bug**: `src/lib/distance/repository.ts:134-138` does
```ts
const hubs = (hubFile.hubs ?? []).map((h) => ({ hub: h.hub, km: h.km, esr: h.esr }));
```
→ `lines` (and the `kmPassengerBaggage` field) never reach `compileGraph`, so `resolveHubLine`
always returns `null` and the adder is applied unconditionally.

**Files to load**: `hub-distances.json` already carries `lines` for 2 hubs (`grep -c '"lines"'` = 2).
The richer, ESR-resolved membership is in `acq-uzel-msk.json` (41/46 ESR) and `acq-uzel-spb.json`
(8 lines + внутриузловые). Recommended: **merge the two acq files into `hub-distances.json`'s two hub
entries** (Москва esr `000015` km 54; СПб esr `000023` km 25) as a one-time data edit — keeps a single
hub source — OR add a `loadUzelLines()` overlay loader keyed by hub `esr`.

**Loader change** (minimal, no new file): in `repository.ts:134`, stop dropping `lines`:
```ts
const hubs: HubEntry[] = (hubFile.hubs ?? []).map((h) => ({
  hub: h.hub, km: h.km, esr: h.esr,
  lines: h.lines,                       // ← plumb the membership map (HubEntry.lines, optional)
}));
```
`HubEntry.lines` type already exists (`computeDistance.ts:74`). Shape:
`{ [lineName]: Array<{ name: string; esr: string | null }> }`.

**Data shape of acq-uzel-msk.json**: `{ hub, esr:"000015", km:54, kmPassengerBaggage:20, lines:{<line>:[{name,esr}]} }`.
`acq-uzel-other.json` confirms the enumeration is **closed at exactly 2 узлы** — do NOT add hub entries for
Екатеринбург/Новосибирск/Челябинск; they are ordinary Книга-3 ТП.

**Golden-safety**: G1/G2 routes (Возрождение→Гремячая, Исеть→Наб.Челны) do **not** traverse Moscow/SPb,
so plumbing `lines` must leave 2444/699/1067770/187344 untouched. Run the harness — if D1/D2 shift,
a non-узел route is wrongly hitting the adder. Add a NEW regression: a Moscow same-line route must
**lose** the +54 vs a cross-line route gaining it (assert both directions).

**Caveat**: Пискаревка (SPb) and a few homonyms appear on two lines — `resolveHubLine` returns first
match; treat ambiguous-line as "cross-line" (keep adder) to stay conservative.

---

### W2 — innovative model registry correction: 9 → 8 models (remove 12-6744) — READY-TO-WIRE

**Status**: sourced-official (`acq-wagon-W5`). Official приказ ФАС 894/25 Прил.1 Табл.6 п.3 lists
**exactly 8** gondola models; the seed `tr1-innovative-models.json` wrongly includes a 9th, **12-6744**
(lines 8, 12, 16, 93 of that file), with a now-falsified "byte-verified 9 models" claim.

**File to edit**: `scripts/seed-data/tr1-innovative-models.json` — remove the `12-6744` entry from
the model array and fix `verbatimP3` + the two provenance strings to read 8 models. The 8 valid:
`12-9761-02, 12-9833-01, 12-9853, 12-9869, 12-196-01, 12-196-02, 12-2143, 12-2159`.

**Loader**: none — `loadInnovativeModelsFromSeed()` already reads this file; it just gets one fewer row.

**Golden-safety**: ⚠️ This is a HOT path for G1. The G1 receipt assigns innovative ×0.9595 to 9 of the
75т wagons **by fitted per-wagon flag, not by model** (lever 1 still FITTED — W1–W4 could not resolve
number→model for free). The golden test (`goldenN8.test.ts:53,87`) drives the innovative flag from the
**receipt's per-wagon `tariffRub`**, NOT from this registry. So removing 12-6744 must NOT change G1 —
**confirm** `goldenN8` stays green. If G1 moves, the engine is (wrongly) matching wagons against the
registry list; that coupling must be severed before this edit ships.

---

### W3 — Belarus spur layer (RF→BY station-level routing) — READY-TO-WIRE (data) / scope-gated (pricing)

**Status**: sourced-official (`acq-by-spurs` 407 records / 675 station→ТП edges, 100% resolved;
`acq-by-connect` 93.1% reach the БЧ backbone). Backbone already present:
`kniga3-backbone-cis.priority.json` (БЧ rw.by 01.08.2010); cross-border styki in `uzel-graph-cisfill.json`.

**Files to load**: `acq-by-spurs.json` (station→ТП spur edges) as **kniga1-style legs**, not узел edges —
each row is `{ esr, isTp, spurs:[{name, esr, km}] }`. These feed the same "station→bounding-ТП leg"
structure `kniga1-sections.json` uses. Add a tolerant overlay loader **mirroring `loadGapFill`**:
```ts
function loadBySpurs(): UzelEdge[] { /* try/catch → []; map spur {esr→ТП esr, km, uchastok:"by-spur"} */ }
```
and append into the `graph.edges` merge at `repository.ts:127-130` (same line as cisFill/gapFill).
Dedup caveat from acq report: 2 ESRs (159404, 150778) appear twice — dedupe by `esr` on load; skip the
6 zero-km self-loops (`km===0 && spur.esr===row.esr`).

**quoteService scope-guard change**: BY is currently REFUSED — `isForeignEsr` returns true for any CIS
CSV ESR, and `quoteService.ts:104-106` pushes "международная перевозка". Wiring the spur layer makes BY
**routable for DISTANCE** but **NOT priced** — per-administration segmentation + БЧ rates are a different
regime. **Keep the international scope guard as-is**; the win is that distance now resolves and is shown
(distanceLegs populated) while price stays manual. Do NOT remove the international refusal.

**Golden-safety**: BY edges are additive to the graph and touch no RF-internal route. G1/G2 are RF↔RF →
unaffected. Run harness; additionally assert a known RF↔RF distance unrelated to BY is unchanged (graph
edge-count growth must not create a shorter spurious RF path — it won't, since BY ESRs are foreign nodes).

---

### W4 — Kazakhstan КТЖ station→crossing distances — READY-TO-WIRE (data) / scope-gated (pricing)

**Status**: sourced-official (`acq-kz-B` 7224 station→crossing edges from OSJD КТЖ PDF 08.04.2019, 94%
ESR-resolved; `acq-kz-A` 1401 station→ТП repo-CSV rows). Validated to the km against tr4.info
(Кандыагаш→Илецк I=289).

**Files to load**: `acq-kz-B.json` (richer: 425 stations × 17 crossings) preferred over `acq-kz-A.json`.
Add `loadKzCrossings(): UzelEdge[]` mirroring `loadCisFill` — map each `{stationEsr, crossingEsr, km}`
to a `UzelEdge` with `uchastok:"kz-crossing"`, append at `repository.ts:127-130`. Skip the ~6% rows with
`stationEsr === null` (2019-vintage name gaps) and the null Актау-Паром column.

**quoteService scope-guard**: identical to W3 — KZ stays `out-of-scope` for PRICING (KZ is foreign ESR →
international refusal stands), but the cross-border leg distance now resolves. **No guard change.** Closes
distance gap 3 only.

**Golden-safety**: KZ nodes are foreign; no RF-internal path changes. Harness must stay green; assert one
RF route distance unchanged for safety.

---

### W5 — 699 km K4 oracle confirmation — NO WIRING (verification artifact, lever stays fitted)

**Status**: `acq-oracle-O1..O5` VERIFIED-REAL. The free gruzivagon oracle reproduces **31 224 ₽/ваг at
699 km to the ruble** (4 independent agents). `acq-oracle-O5` confirms verbatim ТР-1 п.16.7 K4 text
**cannot** reproduce 31224 at any legitimate weight — the fit's true residual lives in chargeable-mass (H1)
or fine-belt K1 (H2), **not** K4.

**Action**: **No engine change.** The fitted `SHORT_HAUL_BOUNDARY_UPLIFT` (1.0057499686…) in
`computeTariffN8.ts` is corroborated-by-output, not rule-sourced. Record in `RTARIFF_VALIDATION_CASES.md`
that an independent oracle confirms G2. Do NOT touch the constant — changing it breaks G2.

---

### W6 — wagon NUMBER→MODEL registry (lever 1 kill) — STILL-BLOCKED

**Status**: `acq-wagon-W1..W4` all **found=no / blocked**. Every free number→model surface (АБД ПВ,
gruzivagon, vagon1520, vgs-as) is login/captcha/paid-gated. The 8-digit number encodes only род (digit1:
5/6=полувагон) — NOT the model. Files written honestly with `model=null, resolved=false`.

**Action**: **Do NOT wire.** Do NOT seed an innovative flag from the digit-decode (it proves gondola TYPE
only, never innovative-vs-classic). The per-wagon ×0.9595 assignment in G1 stays FITTED from the receipt.
Retry path: authenticated АБД ПВ / Playwright past captcha → match against the W2-corrected 8-model registry.

---

### W7 — cistern N19-24 ruble validation — STILL-BLOCKED

**Status**: `acq-spec-cistern` **blocked**. No free ungated calculator yields a per-tonne cistern quote
(NGE.RU subscriber-only; others captcha/paid). Own-cistern is **per-tonne** schemes N19-N24 (vs полувагон
per-wagon N8); rate-belts NOT seeded. **Do NOT wire** a cistern price; scope guard already refuses
type≠полувагон (`quoteService.ts:109`). Needs operator R-Тариф / NGE login.

---

### W8 — container scheme + 2026 +5% indexation — STILL-BLOCKED (data-flip ready, no ruble validation)

**Status**: `acq-spec-container` **partial / sourced-unofficial**. The 2026 +5% container indexation
(×1.05, excl. термические) is **IN FORCE** and CONTRADICTS the current seed
(`tr1-special-rules.json` `appliesFor2026:false`; `tr1-coefficients.json` `skipSeed:true`). Flipping
`appliesFor2026=true` is well-supported, BUT **no pure-ТР ruble container reference** was obtained, so
schemes 85-94 can't be validated to the kopeck. Scope guard refuses type≠полувагон anyway. **Defer**:
flip the flag only alongside a billing-grade container reference quote; do not ship unvalidated.

---

## READY vs BLOCKED summary

| Item | Dataset | State | Touches golden hot path? |
|------|---------|-------|--------------------------|
| W1 | узел lines (msk/spb/other) | **READY** | No (G1/G2 not in узел) |
| W2 | innovative 9→8 (drop 12-6744) | **READY** | G1 — verify flag is receipt-driven, not registry |
| W3 | BY spurs | **READY (dist)** | No |
| W4 | KZ crossings | **READY (dist)** | No |
| W5 | 699 K4 oracle | verify-only, no wire | — (must NOT change const) |
| W6 | wagon→model | **BLOCKED** (auth/captcha) | — |
| W7 | cistern N19-24 | **BLOCKED** (paid) | — |
| W8 | container +5% | **BLOCKED** (no ruble ref) | — |

---

## Prioritized 12-line wiring checklist

1. `repository.ts:134` — stop dropping `lines` (add `lines: h.lines`) → activates dormant +54/+25 exclusion. [W1]
2. Merge `acq-uzel-msk.json` + `acq-uzel-spb.json` membership into `hub-distances.json` (2 hubs, ESR-resolved). [W1]
3. `npm test -- goldenN8 goldenUniversalOracle` — confirm 2444/699/1067770/187344 unchanged after W1.
4. Add Moscow same-line-vs-cross-line regression test (adder suppressed iff entry-line==exit-line).
5. `tr1-innovative-models.json` — remove `12-6744`, fix verbatimP3 + provenance to 8 models. [W2]
6. Re-run `goldenN8` — G1 must stay 1 067 770 (innovative flag is receipt-driven, NOT registry-matched). [W2]
7. Add `loadBySpurs()` in `distance/repository.ts` (mirror `loadGapFill`), append edges at line 127-130; dedupe 159404/150778, skip km=0 self-loops. [W3]
8. Add `loadKzCrossings()` (mirror `loadCisFill`) from `acq-kz-B.json`, skip null-ESR rows, append edges. [W4]
9. Verify BY/KZ: `isForeignEsr` international refusal in `quoteService.ts:104` stays — distance resolves, price stays manual. [W3/W4]
10. `npm test` full — assert one RF↔RF distance unchanged (no spurious shorter foreign path); all goldens green.
11. Record W5 oracle confirmation (31224@699) in `RTARIFF_VALIDATION_CASES.md`; do NOT touch SHORT_HAUL_BOUNDARY_UPLIFT.
12. Leave W6/W7/W8 BLOCKED; gate behind operator АБД ПВ / R-Тариф access before any cistern/container/per-wagon-model wiring.
