# SimpleCargo Tariff Calculator — Data Acquisition Report

> Status: data-acquisition summary. Date: 2026-06-07.
> Companion to [TARIFF_CALCULATOR.md](./TARIFF_CALCULATOR.md) (read §2, §3, §4 for the engine design this data feeds).
> Scope: REAL-data acquisition for the free RZD tariff calculator. No numbers fabricated; gaps recorded honestly.
> All output JSON lives in `scripts/seed-data/`. Structural claims below were **independently re-derived from the files** during this report (see "Verification method").

---

## 0. Verification method

Every structural figure in the tables below was re-computed directly from the committed JSON files (not copied from the acquirers' notes), and ESR resolution was re-run against the repo CSVs:

- `kniga3-backbone.json`: loaded 9.4 MB, counted edges/nodes, checked the `aEsr<bEsr` invariant, km range, duplicate-edge count.
- `etsng-classes.json`: counted rows, class distribution, duplicate codes, null-МВН rows.
- `tr1-*.json`: counted rows per sub-table (these are dicts of belt arrays, not flat lists).
- ESR cross-check: re-parsed `rzd-stations-20231230.csv` (col "Код станции") and `cis-stations-20201230.csv` (4th field) and intersected against the 652 backbone nodes.

Independent re-derivation reproduced the acquirers' claims (one 1-row cosmetic discrepancy noted). The deeper distance-value spot-checks against the live primary sources (tr4.info, sudact.ru, consultant.ru) are reproduced from the adversarial auditors' verdicts, which checked 20+1+6 values across multiple railway administrations and found 0 mismatches.

---

## 1. Dataset readiness — one row per dataset

| Dataset | File(s) | Rows obtained | Coverage | Parseable | Auditor: data_is_real? | Key blocker | Flag |
|---|---|---|---|---|---|---|---|
| **Книга 3 — ТП↔ТП backbone distance matrix** (ТР-4) | `kniga3-backbone.json` (+ `.README.md`) | **93,953** undirected edges / **652** ТП nodes | 44.3% matrix density (correct — Книга 3 only tabulates tariff-legal shortest distances, not the full clique). RF: all 41 administrations + Ukraine + Crimea. **Empty for 15 roads: Belarus, Moldova, Baltics, Kazakhstan, Central Asia, Caucasus, Якутия, РУБК.** | Yes (`{a,b,km,aEsr,bEsr}`, `aEsr<bEsr` 100%, km 1–10538, 0 dups, 0 km≤0) | **YES** — 20/20 distance values matched live tr4.info across 4 administrations (Петрозаводск/Самара/Москва-узел/Львов); symmetry independently re-verified | tr4.info is **unofficial** ("точность не гарантируется"), undated (legacy pre-2026); official primaries (cntd.ru, garant) paywalled. CIS/Baltic/Central-Asia backbones absent. | **GREEN** (RF core) / **YELLOW** (CIS gap + provenance) |
| **ТР-1 2026 numeric tariff tables** (Приказ ФАС 894/25) | `tr1-scheme-classifier.json`, `tr1-rate-belts.json`, `tr1-class-coeff.json`, `tr1-empty-run.json`, `tr1-coefficients.json` | **~21,930** total cells (classifier 11; rate-belts 20,955; class-coeff 52; empty-run 889; coefficients 11) | Полувагон + class-1 нерудные + own-wagon path **fully covered** (scheme N8/И1 full weight×distance grids, K1 full taper, empty-run N25, all coefficients with real dates). Specialized/cistern/container schemes **not extracted** (out of priority scope). | Yes (parsed from raw HTML deterministically; markdown conversion misaligned cells, so raw HTML used) | **YES** — 6/6 records matched live sudact.ru (K1 taper, distanceCorr, N8 10t & 70t cells, И1 10t cell, N25 empty-run); order 894/25 confirmed real, Минюст 84708 | ТР-1 uses **numeric scheme codes (N8/N25)** for universal/own-wagon path, not the letter И/В codes the design doc assumed (letters survive only for общий-парк specialized). N8/И1 are 2D weight×distance grids → extra `weightT` field. Belts non-uniform → must SNAP, not interpolate. | **GREEN** (полувагон/нерудные path) / **YELLOW** (specialized schemes + classifier stub) |
| **ЕТСНГ → {class, МВН}** | `etsng-classes.json` | **5,036** positions | ~100% of the railwagonlocation mirror (all 18 pages). Class dist: 1→576, 2→1,319, 3→3,141. 42 null МВН (3 source `-`, rest none published). Exceeds doc's ~2,000 estimate (mirror carries sub-position granularity). | Yes (5,036 rows, 0 dup codes) | **YES** — 6+ records matched mirror + alta.ru + consultant.ru LAW_522347; 6 mandatory core нерудные codes cross-verified against authoritative 2026 source | Mirror МВН is condensed vs the 2026 authoritative triplet form (e.g. `Г/П,ПЛ-46` vs `кр, пв - г/п, пл - 46`) — class identical, per-wagon triplet detail richer in consultant.ru. consultant.ru renders collapsed group rows via WebFetch → full granular authoritative scrape infeasible with available tools. | **GREEN** (class derivation, нерудные path) / **YELLOW** (МВН triplet precision for non-нерудные) |

---

## 2. What the engine can REALLY compute today vs. what is still placeholder

### REAL today (confirmed against primary sources)

- **Distance, RF + Ukraine/Crimea, multi-section routes.** The ТП↔ТП backbone (Книга 3) is real and verified — the single load-bearing gating dependency identified in the design doc (§3.3, §9 risk #1) is **CLOSED for the RF core**. Combined with the spur edges already reconstructable from the repo CSVs `field[4]` (18,065 spur edges, per design doc §3.2), the distance engine can compute real `l1 + L_K + l3` totals for any RF route whose ТП are in the 652-node set. 591/652 nodes resolve into the repo CSVs by 6-digit ESR (403 RZD + 188 CIS, re-verified this run).
- **Tariff for the SimpleCargo core path:** полувагон + class-1 нерудные/щебень + собственный/арендованный вагон (own-wagon = И scheme N8 + порожний N25, no В component). The full chain is real and validated end-to-end (~76,800 ₽/wagon sanity check for ~1650 km / 70 т): base rate belts → K1 class-1 distance taper (max-of-two with Табл.5) → 2026 own-полувагон factors (0.9346/0.9592/0.9774) → нерудные K3=0.77 ×0.909 → порожний ×1.1 → indexation already baked into the ТР-1 base.
- **Cargo class + МВН derivation** for the нерудные path (and class for all 5,036 mirror positions): pure dictionary lookup, real values.
- **Coefficient/indexation stack with real effective dates**, including the corrections that container +5% is **cancelled for 2026** and that the +10% 2026 indexation is **already embedded** in the ТР-1 base tables (re-applying would double-count).

### Still placeholder / not acquired

- **CIS / Baltic / Central-Asia / Caucasus backbone distances** — 15 roads have ZERO transit points in this file. Any cross-border route into Belarus/Kazakhstan/Baltics/etc. cannot compute a real L_K leg.
- **Узел adders** (Moscow +54 conditional / SPb +25) and **§2 особые/кратчайшие расстояния overrides** — by design these belong in `hub_fixed_distance` / `special_distance`, NOT in Книга 3; they were correctly **not** acquired here and remain to be tabled.
- **Книга 1** (участок ordinal + cumulative km) for same/adjacent-section subtraction — not acquired; intra-section pairs fall back to a slightly-long spur+ТП route.
- **Specialized-wagon / cistern / container / transporter tariff schemes** (Табл.7-9 classifier + their rate belts) — only stubbed. The polувагон path is covered; anything beyond it is placeholder.
- **МВН per-wagon triplet precision** for non-нерудные cargo (condensed mirror form only).
- **61 backbone nodes** (UA/Crimea/Donbass + synthetic узел nodes) do not resolve into the 2020/2023 repo CSVs by ESR — need name-based resolution or added `узел` rows.
- **Live tariff cross-check (Layer B)** — no reference tariff captured against gruzivagon/etc.; the ±5% tolerance remains UNVALIDATED against any real delta.

---

## 3. The single most important remaining data gap

**The CIS/Baltic/Central-Asia/Caucasus ТП↔ТП backbone (15 empty railway administrations in Книга 3).**

The RF distance engine is now genuinely buildable; the tariff engine's polувагон/нерудные path is real. The remaining hole that blocks a *whole class of real SimpleCargo routes* (cross-border freight to Belarus, Kazakhstan, the Baltics, etc.) is the absence of any transit-point distances for those 15 administrations. tr4.info publishes none, so the unofficial source that supplied the RF core cannot close this.

(The узел adders and Книга 1 are smaller, well-scoped, and partly derivable; the CIS backbone is a genuine external-data void with no free machine-readable source identified yet.)

## 4. Concrete next action to close it

Source the CIS/Baltic/Central-Asia backbone from an **official per-administration ТР-4** rather than tr4.info:

1. Obtain the official Книга 3 text for the missing administrations via `docs.cntd.ru/document/901918296` (МПС приказ №55) or `base.garant.ru/187381/` — these are paywalled/auth-gated, so this likely needs a one-off licensed/manual export rather than scraping.
2. Failing that, prioritize the specific cross-border ТП pairs SimpleCargo actually quotes (Belarus + Kazakhstan first) and digitize just those rows into the same `{a,b,km,aEsr,bEsr}` shape, pinned verbatim (do NOT Dijkstra-derive them — would find tariff-illegal paths).
3. In parallel, table the узел adders (Moscow +54 conditional same-line exclusion / SPb +25) into `hub_fixed_distance` so the existing RF graph stops under-counting cross-line moves — this is low-effort and immediately improves real RF accuracy.

---

## 5. Honesty notes (confirmed-real vs partial/unverified)

- **Confirmed-real** (cross-checked against live primary sources by adversarial auditors, 0 mismatches): the 20 backbone distance values, the 6 ТР-1 rate/coeff cells, the 6+ ЕТСНГ class/МВН records. All three datasets carry `data_is_real: true` with `accuracy: confirmed`.
- **Partial/unverified provenance** (real values, but source not officially stamped): tr4.info is unofficial and undated — distances are structural and change rarely, but production КП should spot-verify against an official source and keep a Layer-C drift watch. The Минюст amendment dated 13.02.2026 on the ТР-1 source pages was not separately diffed.
- **Cosmetic discrepancy** (does not affect validity): the kniga3 README states 188 CIS-resolved nodes; this run reproduces 188 directly (the acquirer's verdict said 189 — off by 1, negligible). Class distribution, edge/node counts, density (44.3%), and the ESR split (403/188/61 = 652) all reproduce exactly.
- **No fabricated, placeholder, or hallucinated numeric values were found in any of the three datasets.**
