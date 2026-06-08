# Книга 3 backbone (ТП↔ТП tariff distances) — acquisition notes

Output file: `kniga3-backbone.json`
Acquired: 2026-06-07. Source: **tr4.info** (unofficial but faithful digitization of
Тарифное руководство №4, Книга 3 — «Расстояния между транзитными пунктами»).

## What this is

The gating dependency from `docs/planning/TARIFF_CALCULATOR.md` §3.3: the transit-point ↔
transit-point distance matrix (Книга 3). Without it the spur graph is disconnected stars and
no inter-section route computes. This file supplies the backbone edges.

## File shape

`kniga3-backbone.json` is a JSON array of edges:

```json
{"a":"Московский узел","b":"Санкт-Петербургский узел","km":705,"aEsr":"000015","bEsr":"000023"}
```

- `a`, `b`  — transit-point names, Cyrillic, same style as repo CSV `field[4]`
  (hyphenated multi-word names preserved, e.g. `Москва-Сортировочная-Киевская`).
- `km`      — published tariff distance, integer.
- `aEsr`, `bEsr` — 6-digit ESR codes (tr4.info codes ARE the repo's ESR codes — verified
  against `rzd-stations-20231230.csv` field[3]). **Prefer resolving by ESR code, not name** —
  it is authoritative and sidesteps the homonym problem entirely.
- Undirected / symmetric: stored once with `aEsr < bEsr`. Symmetry verified (382/382 rows on an
  independent reverse page matched, 0 mismatches).

## Coverage (be honest)

- **93,953 edges**, **652 transit-point nodes**.
- Matrix density 44.3% of the full clique — this is CORRECT, not a gap: Книга 3 only tabulates
  the curated tariff-legal «кратчайшие расстояния без обходных и соединительных ветвей» between
  TPs, not every pair. Pin to these published values; do NOT re-derive by Dijkstra (would find
  tariff-illegal shorter paths — see design doc §3.1).
- ESR resolution into repo CSVs: **591/652** (403 in `rzd-stations-20231230.csv`,
  188 in `cis-stations-20201230.csv`). The remaining **61** are Ukrainian/Crimean/Donbass
  stations, a few `(эксп.)` expedition variants, and synthetic узел nodes (e.g.
  `Московский узел` 000015, `Санкт-Петербургский узел` 000023) absent from the repo's 2020/2023
  CSVs. These still carry valid ESR codes and Cyrillic names; resolve by name or add узел rows.
- Roads covered: 41 administrations indexed; **non-empty** data for RF roads + Ukraine
  (Юго-Западная, Львовская, Донецкая, Одесская, Южная, Приднепровская) + Крымская.
  EMPTY on tr4.info (0 TPs published): Белорусская, Молдавская, Литовская, Латвийская,
  Эстонская, Казахстанская, Грузинская, Узбекская, Азербайджанская, Южно-Кавказская,
  Кыргызская, Таджикская, Туркменская, ЖД Якутии, РУБК. Those CIS/Baltic/Central-Asia
  backbones are NOT in this file — gap recorded.

## Узел adders (separate from this file)

Design doc §3.1 узел adders (Moscow +54 conditional, SPb +25) are NOT in Книга 3 and not here;
they belong in `hub_fixed_distance`. Note tr4.info DOES expose synthetic `*-узел` nodes
(`Московский узел`, `Санкт-Петербургский узел`, `Московский узел` 000015) with their own
distance rows — useful as узел anchors.

## Parsing recipe (to re-run / extend later)

1. Road index: `GET https://tr4.info/tp/` → 41 links `https://tr4.info/tp/rw/{ROAD_ID}`.
2. Per road: `GET https://tr4.info/tp/rw/{ROAD_ID}` → harvest TP codes+names via
   `href="https://tr4.info/tp/(\d+)"[^>]*>([^<]+)</a>`  (652 distinct codes).
3. Per TP: `GET https://tr4.info/tp/{ESR}` → page title `от {Name} ({ESR})` is the source node;
   the distance table rows match:
   ```
   href="https://tr4.info/tp/(\d+)"[^>]*>([^<]+)</a>\s*</td>\s*<td[^>]*text-center[^>]*>\s*(\d+)\s*</td>
   ```
   (2-column layout → regex catches both columns; ~300–400 rows/page). UTF-8, Cyrillic native.
4. Dedupe symmetric: key `tuple(sorted([srcEsr, dstEsr]))`, keep km (symmetric-equal).
5. ~0.2s delay between requests; full crawl ≈ 6 min, 0 failures observed.

Self-contained scraper used: regex above + `urllib.request` with a `Mozilla/5.0` UA.

## Caveats

- tr4.info is unofficial («точность не гарантируется»). For production КП, spot-verify a sample
  against an official capture (cntd.ru/garant — both paywalled/auth-gated as of 2026-06-07).
- The matrix vintage on tr4.info is not date-stamped; treat as legacy ТР-4 (pre-2026). Distances
  in km are structural and change rarely, but flag for the Layer-C drift watch.
