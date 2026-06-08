# Книга 3 backbone — CIS / Baltic / Central-Asia / Caucasus (the 15 empty roads)

Output file: `kniga3-backbone-cis.json`
Acquired: 2026-06-07. Closes (partially) the gap recorded in `DATA_ACQUISITION_REPORT.md` §3:
the 15 railway administrations that were EMPTY in `kniga3-backbone.json`.

## What this is — and what it is NOT

`kniga3-backbone.json` (the RF core) stores true **ТП↔ТП** distances copied verbatim from the
published Книга-3 matrix (tr4.info `/tp/`). For these 15 administrations **that matrix does not
exist on any free machine-readable source** — verified absent on:

- `tr4.info/tp/rw/{id}` → every one returns «Для этой дороги транзитные пункты не найдены».
- the official 01.09.2020 Книга 3 (sovetgt.org, mirrored full-text at meganorm.ru, 60 MB) →
  contains ONLY RF + Ukraine + Crimea; Belarus/Kazakhstan/Baltics/Central-Asia/Caucasus are not
  in the inter-state matrix at all.
- consultant.ru / docs.cntd.ru / base.garant.ru → gated (full table not free).
- rw.by «Положение об определении тарифных расстояний» → methodology only, no distance table.
- calc.simcargo.com route-builder (`gettrain.php?page=froute.php`) → backend returns empty.

So instead of the ТП↔ТП matrix, this file supplies the **official Книга-1 section graph**
(«Таблицы расстояний по отправлению и прибытию» — участок lengths) for each administration,
scraped from `tr4.info/railway/{id}`. These are REAL published participок distances, NOT
fabricated and NOT Dijkstra-derived. The ТП↔ТП distance for any intra-administration pair is
recovered by **summing section legs along the tariff route** — exactly the procedure the rw.by
Положение mandates («по каждому маршруту поочередно определяются расстояния … путем
суммирования»). This is the correct, legal substitute for the absent matrix.

## File shape

JSON array of section edges:

```json
{"a":"Гродно","b":"Мосты","km":58,"road":"БЧ","layer":"section","aEsr":"135208","bEsr":"137203"}
```

- `a`, `b`  — adjacent station/ТП names bounding one участок, Cyrillic, repo CSV style.
- `km`      — published participок length, integer (official tr4.info Книга-1 value).
- `road`    — short administration code (see table below).
- `layer`   — always `"section"` (distinguish from the RF file's verbatim ТП↔ТП edges).
- `aEsr`/`bEsr` — 6-digit ESR, resolved against `cis-stations-20201230.csv` (present only when
  resolved; some 2020-CSV names differ from current tr4 names — see coverage).
- `border`  — `true` when an endpoint is a frontier ТП (`(эксп.)` / `(ПП)` / стык).
- `suspect` — set on the 2 km=0 source rows (do not price off them; verify first).

Undirected. Stored once per участок (a→b), deduped on (a,b,km,road).

## Coverage per administration (honest)

| Road | Code | Sections | Nodes | ESR-resolved % | Border ТП |
|---|---|---|---|---|---|
| Белорусская        | БЧ   | 87 | 101 | **92%** | 22 |
| Казахстанская      | КЗХ  | 97 | 140 | **53%** | 16 |
| Литовская          | ЛГ   | 35 | 41  | 86% | 10 |
| Латвийская         | ЛДЗ  | 45 | 46  | 82% | 10 |
| Эстонская          | ЭВР  | 16 | 21  | 81% | 3 |
| Молдавская         | ЧФМ  | 21 | 26  | 90% | 9 |
| Грузинская         | ГР   | 25 | 38  | 76% | 3 |
| Узбекская          | УТИ  | 59 | 89  | 42% | 19 |
| Азербайджанская    | АЗ   | 32 | 47  | 72% | 4 |
| Южно-Кавказская    | ЮКЖД | 14 | 21  | 79% | 3 |
| Кыргызская         | КРГ  | 4  | 8   | 25% | 3 |
| Таджикская         | ТДЖ  | 6  | 10  | 33% | 3 |
| Туркменская        | ТРК  | 18 | 30  | 61% | 13 |
| ЖД Якутии          | ЯЖД  | 4  | 6   | 0%  | 0 |
| РУБК               | РУБК | 1  | 2   | 0%  | 1 |

**Total: 464 section edges, 116 border-flagged.**

Priority directions БЧ and КЗХ are the most complete. ESR gaps are NAME-vintage gaps, not data
gaps: the 2020 CIS CSV predates several КЗХ renamings (Алматы 1 ⇐ Алма-Ата I, Костанай ⇐
Кустанай, Оскемен ⇐ Усть-Каменогорск, Нурлы Жол / Жанаозен absent) and many путевые посты are
not station rows. `km` + names are real regardless of ESR resolution; resolve missing ESR later
by name/alias or add station rows. A small curated alias map (in `build_final.py`) already lifts
БЧ to 92% and КЗХ to 53%.

## Cross-border segmentation rule (REQUIRED for international routes)

International tariff distance = **Σ (tariff distance inside each administration)**, segmented at
the border crossing. For an RF→Belarus or RF→Kazakhstan haul:

1. RF leg: origin → RF border ТП, computed from `kniga3-backbone.json` + spurs (the RF border ТП
   are the `(эксп.)` nodes already in the RF file, e.g. `Красное (эксп.)`, `Злынка (эксп.)`,
   `Петропавловск (эксп.)`, `Канисай (рзд) (эксп.)`).
2. Foreign leg: foreign border ТП → destination, summed over THIS file's section edges.
3. Add the two. Do NOT route across administrations as one graph (would find illegal paths and
   skip the border ТП).

Key RF↔foreign crossing ТП captured here (foreign side):
- **Belarus (БЧ):** Осиновка, Закопытье, Заольша, Езерище, Тереховка, Терюха (RF side: Красное,
  Злынка, etc.).
- **Kazakhstan (КЗХ):** Илецк I, Петропавловск, Локоть, Семиглавый Мар, Золотая Сопка, Зерновая
  (RF↔KZ), Достык/Алтынколь (KZ↔China).

Full per-road border-ТП lists are in the `border:true` edges. The Moscow/SPb узел adders and §2
особые расстояния still belong in `hub_fixed_distance` / `special_distance`, not here.

## Validation (spot-checks, real)

- Брест-Центральный → Минск-Сортировочный = **343 km** (section sum) vs known rail ~346 km. PASS.
- Брест-Центральный → Орша-Центральная = **559 km** vs road ~562 km. PASS.
- Орша-Центральная → Осиновка (RF border) = **48 km**. Consistent.

## Caveats

- tr4.info is unofficial («точность не гарантируется») and the Книга-1 section vintage is
  undated (legacy pre-2026). Section lengths are structural and change rarely; flag for Layer-C
  drift watch and spot-verify against an official capture for production КП.
- 2 km=0 source rows (`Туркменбаши I (эксп.)`–Бюзмейин; РУБК стык) carry `suspect` — verify.
- ЯЖД / РУБК / КРГ / ТДЖ have very few participков published (peripheral, low SimpleCargo value).

## Re-run / extend

`/tmp/build_final.py` (kept transient): for each missing road id, `GET tr4.info/railway/{id}`,
parse 2-col `<td>` rows `"A — B" | length`, resolve names → ESR via `cis-stations-20201230.csv`
+ alias map, flag `(эксп.)`/`(ПП)` as border. ~0.3s/road. To raise КЗХ/УТИ ESR coverage, extend
the alias map with current↔2020 station-name pairs.
