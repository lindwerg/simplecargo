# uzel-graph-cisfill — cross-border узел↔узел bridge edges

Output file: `uzel-graph-cisfill.json`
Acquired: 2026-06-07. Closes the **cross-administration connectivity gaps** that left
Belarus, Lithuania, Latvia, Estonia, Kaliningrad and Kazakhstan as isolated components in
`uzel-graph.json`.

## The problem this fixes

`uzel-graph.json` (1837 nodes / 95010 edges) had **385 connected components**; the largest was
only 808 nodes (44%). The CIS internal section graph from `kniga3-backbone-cis.json` was already
loaded (all 322 both-ESR edges present), so each administration's *internal* network existed — but
the **border-crossing edges linking paired стык ТП across administrations were absent**, so:

- Belarus (Молодечно cluster, 52 nodes) — isolated
- Lithuania (Шяуляй cluster, 23 nodes) + Кяна fragment (2 nodes) — isolated
- Latvia (Елгава cluster, 29 nodes) — isolated
- Kazakhstan (Кандыагаш/Тобол/Достык cluster, 29 nodes) — isolated
- **Kaliningrad (16 nodes) — fully orphaned** (no land link to RF core)
- Estonia (11 nodes) — isolated

The border ТП on **both** sides already existed as nodes (e.g. `Красное` 171401 in RF core,
`Осиновка (эксп.)` 169100 in the BY cluster); only the connecting edge between each pair was
missing. This file supplies those 19 bridge edges.

## File shape

JSON array:

```json
{"aEsr":"171401","bEsr":"169100","km":0,"a":"Красное","b":"Осиновка (эксп.)",
 "road":"БЧ","corridor":"RF↔БЧ","crossing":"Красное↔Осиновка",
 "layer":"border-styk","border":true,"connector":true,
 "km_source":"styk-colocated","source":"uzel-graph-cisfill"}
```

- `aEsr`/`bEsr` — 6-digit ESR of the paired border ТП (RF side / foreign side).
- `km` — see km policy below.
- `layer` — always `"border-styk"`.
- `border` — always `true`.
- `connector` — `true` when `km==0` (topological connector, not a priced distance).
- `km_source` — provenance of the km value (honest label).

## km policy — NO fabrication

The precise short стык-перегон length between paired border ТП is **not published on any free
machine-readable source** — verified absent across tr4.info Книга-1 tables, legalacts.ru Книга-1,
Wikipedia/alta.ru/rasp.yandex station pages, and the official rw.by/КТЖ methodology (same finding
already recorded in `kniga3-backbone-cis.README.md`). Rather than invent values:

- **`km: 0` + `connector: true`** for stык where no real perегон length was sourceable. This is
  correct under the CIS interstate **segmentation rule** (`kniga3-backbone-cis.README.md` §
  "Cross-border segmentation"): international tariff distance = Σ(tariff distance inside each
  administration), segmented at the border. The paired border ТП represent the **same point on the
  государственная граница**; the priced distance comes entirely from the per-administration section
  sums on either side, so the stык edge must add 0 to avoid double-counting or fabrication.
- **`km: 142`** for `Карталы I эксп ↔ Тобол` — the one crossing with a real, corroborated
  station-to-station railway distance (`km_source: "flagma.kz+tr4 railway 142km"`).

If a production КП needs the exact stык residual for a specific crossing, source it from an
official capture and update that single edge's `km` + `km_source`.

## Bridges added (19 edges)

| Corridor | Crossings | Edges |
|---|---|---|
| RF ↔ Belarus (БЧ)        | Красное↔Осиновка, Рудня↔Заольша, Злынка↔Закопытье, Завережье↔Езерище, Невель I↔Алеща | 5 |
| Belarus (БЧ) ↔ Lithuania (ЛГ) | Беняконе↔Стасилос, Гудогай↔Кяна | 2 |
| Lithuania (ЛГ) ↔ Kaliningrad | Кибартай↔Нестеров, Пагегяй↔Советск | 2 |
| RF ↔ Kazakhstan (КЗХ)    | **Карталы I эксп↔Тобол (142 km, sourced)**, Локоть↔Локоть эксп (Рубцовск) | 2 |
| RF ↔ Latvia (ЛДЗ)        | Посинь↔Зилупе, Пыталово↔Карсава | 2 |
| Belarus (БЧ) ↔ Latvia (ЛДЗ) | Бигосово↔Индра | 1 |
| Lithuania (ЛГ) ↔ Latvia (ЛДЗ) | Йонишкис↔Мейтене, Мажейкяй эксп↔Реньге, Турмантас↔Курцумс | 3 |
| RF ↔ Estonia (ЭВР)       | Ивангород-Нарвский↔Нарва, Печоры-Псковские↔Койдула | 2 |

Crossing pairs verified against parovoz.com/spravka/crossings and egtre.info border-crossing wiki.

## Result

- Components: **385 → 160**. Largest component: **808 → 1260 nodes**.
- Now in the main RF-connected component: Belarus (Молодечно, Брест), Lithuania (Вильнюс,
  Шяуляй), **Kaliningrad (Калининград-Сорт, Багратионовск)**, Kazakhstan (Кандыагаш, Тобол,
  Достык), Latvia (Елгава, Резекне), Estonia (Нарва). Sakhalin (Южно-Сахалинск, Холмск) was
  already connected via the Ванино–Холмск train-ferry edge.
- Validated Kaliningrad route: `Молодечно → Лида → Беняконе↔Стасилос → Вильнюс → Каунас →
  Кибартай↔Нестеров → Калининград-Сортировочный = 565 km`, traversing the correct border ТП with
  stык connectors contributing 0 km.

## Honest coverage caveats

- **Petropavlovsk and Iletsk corridors NOT bridged.** Their RF-side approach stations (Петухово,
  Мамлютка, Маячная, Илецк Второй) are **not present as узлы in `uzel-graph.json`**, so there is no
  узел↔узел segment to connect to the KZ-side ТП (`Петропавловск (эксп.)` 688708, `Илецк I`
  666906) without first adding those intermediate RF stations to the узел graph. KZ is reachable
  via Карталы↔Тобол and Локоть↔Локоть; add Petropavlovsk/Iletsk later by extending the узел node
  set.
- **Internal LG gap `Вильнюс ↔ Науйойи-Вильня`** is genuinely missing from the official tr4 ЛГ
  table (one of the 142 unresolved-ESR/missing internal edges). The Кяна fragment connects via
  `Гудогай↔Кяна`; the Вильнюс-reaching path uses `Беняконе↔Стасилос` (Вильнюс↔Стасилос=50 km is in
  the backbone) instead. Note Стасилос-Беняконе was physically closed Feb-2023 but remains the
  tariff-valid distance path.
- **Estonia↔Latvia (Валга/Валка) not bridged** — no `Валка`/`Лугажи` LV node exists in the graph;
  EE connects to RF directly (Нарва, Койдула). Add the Валга joint station's LV neighbor later.
- Remaining 160 components are deep-peripheral CIS fragments (Central Asia spurs, Caucasus, small
  Ukraine/Crimea clusters) outside the BY/KZ/Baltic/Kaliningrad scope of this task.
