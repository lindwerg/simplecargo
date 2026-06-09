# SKOROSTNYE_RULE — exclusion of скоростные / высокоскоростные линии from FREIGHT tariff routing

> **Status:** rule SHIPPED + verified. The exclusion is implemented and wired on
> `main` (see §6 below). The rule is **oracle-safe but does NOT yet reach 801 in-graph**
> — the anchor stays as backup. Honest residual in §7.
> **Goal:** derive the «в обход … скоростных линий» exclusion VERBATIM from the
> primary source so the general routing rule reproduces the operator-verified
> Красный Сокол (022207) → Бологое-Московское (050009) = **801 km**, and the
> temporary anchor in `special-distances.json` becomes redundant (kept as backup).
> **Owner file to edit (later phase):** `src/lib/distance/computeDistance.ts` /
> `repository.ts` only. New data lives in NEW seed file(s).
> **Ground truth that must stay EXACT:** 2444 (021609→612709), 699 (771500→648503),
> 3108 (023202→528706), 1432 (023202→061108), АЯМ/Crimea coverage, all 17 tariff oracles.

---

## 1. The governing rule (verbatim primary source)

### 1.1 ТР-1 2026 §I п.4 (Приказ ФАС России от 06.11.2025 № 894/25)

On disk: [`rulebook/prilozhenie-n-1-i.md`](./rulebook/prilozhenie-n-1-i.md) **line 30**.
Зарегистрирован в Минюсте России 22.12.2025 № 84708; с изм. от 13.02.2026; в силе с 2026-01-01 (заменил Прейскурант 10-01).

> **«4.** Тарифы на перевозку грузов по инфраструктуре РЖД рассчитываются за
> расстояние, определяемое в соответствии с **Тарифным руководством N 4**,
> утвержденным Протоколом тридцать первого заседания Совета по железнодорожному
> транспорту государств - участников Содружества от 15 февраля 2002 г.,
> **Порядком определения кратчайшего расстояния** … утвержденным приказом
> **Минтранса России от 12 сентября 2024 г. N 313** … от железнодорожной станции
> отправления РЖД … до железнодорожной станции назначения РЖД … **в обход
> малодеятельных участков и скоростных линий для всех грузов**, в зависимости от
> вида сообщения и со следующими особенностями: …»

> **«4.7.** В общее расстояние перевозки не включается протяжение путей (ветвей)
> необщего пользования … а также путей (ветвей) РЖД, не имеющих на своем
> протяжении железнодорожных станций, открытых для производства грузовых
> (коммерческих) операций.» (line 51)

**Load-bearing phrase:** `в обход малодеятельных участков и скоростных линий для
всех грузов`. This is a single conjunction: the SAME п.4 clause that mandates the
малодеятельные-bypass (already implemented) ALSO mandates the **скоростные-линии**
bypass. They are not two rules — they are one «в обход X и Y» rule, and the engine
currently honours only X.

### 1.2 ТР-4 Книга 3 «общие положения» (the distance table the п.4 rule reads from)

Cited verbatim in the engine header (`computeDistance.ts` line 83) and in
`special-distances.json` `_meta.purpose`:

> «… Книга 3 itself is already the **'кратчайшее расстояние без обходных и
> соединительных ветвей в узлах'** table …»

i.e. ТР-4 defines tariff distance as the shortest path over the designated ТП
network **«без учёта обходных и соединительных ветвей в узлах, малодеятельных
участков, скоростных линий»**. The обходные/соединительные-ветвей part is the
anti-undercut/spur-attachment rule already shipped; the **скоростные-линии** part
is the gap this rule closes.

### 1.3 Порядок определения кратчайшего расстояния (Приказ Минтранса № 313)

[`special-distances.json`](../../scripts/seed-data/special-distances.json)
`_meta.authoritative_sources`:

- **MINTRANS_313_2024** — Приказ Минтранса России от 12.09.2024 № 313
  «Об установлении Порядка определения кратчайшего расстояния …» (Минюст 17.10.2024 № 79807).
  CURRENT / in force as of 2026; supersedes № 245.
- **MINTRANS_245_2009** — Приказ Минтранса России от 21.12.2009 № 245 (предшественник).

**Reading:** № 313 is the operative «Порядок определения кратчайшего расстояния»
referenced by п.4; together with ТР-4 Книга 3 it is the legal basis that the
shortest path must be computed **excluding** скоростные/высокоскоростные линии.
The orders are RULE-BASED (section include/exclude), not a flat (a,b,km) matrix —
so the скоростные-линии exclusion is implemented as an **edge classification +
exclusion**, exactly like the existing узел classification, NOT as a km table.

---

## 2. Source URLs (every classification + km traces to these)

| Source | What it establishes | URL |
|---|---|---|
| ТР-1 2026 §I п.4 (Приказ ФАС 894/25) | «в обход малодеятельных участков и скоростных линий» — the verbatim freight-routing exclusion | sudact / cntd / pravo.gov.ru — on disk `rulebook/prilozhenie-n-1-i.md` line 30 |
| Приказ Минтранса № 313 (12.09.2024) — Порядок определения кратчайшего расстояния | the operative «кратчайшее расстояние» order п.4 points to | https://www.consultant.ru/document/cons_doc_LAW_488446/2bfad742e63dbc62cd7b59cc8c26919fa06053b8/ · https://base.garant.ru/410566678/ · http://publication.pravo.gov.ru/document/0001202410180001 |
| Приказ Минтранса № 245 (21.12.2009) — предшественник | confirms regime is rule-based, not a km matrix | (in `special-distances.json` `_meta`) |
| ТР-4 Книга 3 «общие положения» | «кратчайшее расстояние без обходных и соединительных ветвей в узлах» (and малодеят./скоростн.) | cited in engine header + `special-distances.json` `_meta.purpose` |
| Москва–СПб = скоростная линия (Сапсан); freight diverted, distance 660→1110 km via Волхов/Череповец/Вологда/Ярославль or Дно/Новосокольники | public primary confirmation that this specific line carries скоростное движение and freight is routed AROUND it | https://ru.wikipedia.org/wiki/Железнодорожная_линия_Санкт-Петербург_—_Москва · https://www.vedomosti.ru/business/articles/2019/10/13/813563-gruzi-vernutsya-sapsanami |

**No-fabrication note:** which edge is скоростная and any bypass km must come from a
listed public source. The single high-speed line proven here is **Москва–СПб (главный
ход Октябрьской ж.д., Сапсан)**. Any further line added to the exclusion list MUST
cite its own РЖД/Минтранс primary source before it ships.

---

## 3. The target route, traced to the km (operator-payment-verified)

From [`scripts/seed-data/reference-ksb-801.json`](../../scripts/seed-data/reference-ksb-801.json)
and the anchor in `special-distances.json` `overrides[0]`:

- **Route:** Красный Сокол (022207) → Бологое-Московское (050009).
- **Legal freight distance:** **801 km** — verified to the kopeck by operator payment:
  16 ваг ПВ, класс 1 (нерудные), групповая = 34906 ₽/ваг × 16 = 558 496 ₽; × 1.22 НДС = **681 365.12 ₽** = факт.
- **Engine WITHOUT the rule:** **539 km** via the backbone leg
  `Хийтола (022404) → Окуловка (053703) → Бологое (050009)`, which **runs along the
  Москва–СПб скоростная линия (Сапсан)** through Окуловка (053703) and Бологое.
- **Why 539 is tariff-illegal:** п.4 «в обход … скоростных линий» forbids pricing a
  freight route over a high-speed line. The legal freight ход is diverted (Волховский
  ход / Дно–Новосокольники), giving ≈ **801 km** — consistent with the public
  660→1110 km freight-diversion fact for this exact line.

Current state: the anchor `{a:022207, b:050009, km:801}` forces 801. **Keep it**
(backup). The general rule must independently produce 801 with the anchor disabled.

---

## 4. How it maps to the engine

The engine already models the «обходные/соединительные/малодеятельные» half of the
ТР-4 exclusion via per-узел classification (`tr4-uzel-class.json` → `UzelClass`,
classes `magistral`/`obhodnoy`/`malodeyatelny`) consumed in `computeDistance.ts`.
The скоростные-линии half is the missing twin and maps the same way, but at the
**edge** level rather than the узел level:

1. **New seed data (Acquire owns):** a `skorostnye-lines` seed listing the EDGES
   (узел-pair backbone edges in `kniga3-backbone/full.json`) that lie on a public
   скоростная/высокоскоростная линия. **First entry: Москва–СПб главный ход**,
   including the `022404 (Хийтola) ↔ 053703 (Окуловка)` backbone edge and the
   053703↔050009 (Окуловка↔Бологое) edge that the 539 path uses. Each edge MUST
   carry its primary-source citation. Do NOT invent edges; only mark EXISTING graph
   edges as скоростная.

2. **Engine rule (Harden owns, `computeDistance.ts` / `repository.ts`):** freight
   tariff routing must NOT traverse a скоростная-line edge — exactly as it already
   refuses обходные/малодеятельные legs. Implement by excluding those edges from the
   backbone relaxation (or assigning them ∞ for freight), forcing the search onto the
   legal Волховский/Дно obход already present in the graph.

3. **Strand check (CRITICAL, must FLAG honestly):** if removing the high-speed edges
   leaves NO in-graph bypass between the узлы (no Волхов/Дно path actually present in
   `kniga3-backbone/full.json`), the route is **stranded** — in that case **do NOT
   fabricate a bypass edge**: report it and keep the 801 anchor as the answer. The
   801 must come from EXISTING edges or it stays anchor-only.

4. **Narrow gating (must not regress):** the exclusion must be gated so it cannot
   move any of 2444 / 699 / 3108 / 1432, the АЯМ/Crimea coverage, or any of the 17
   tariff oracles. Verify with `npx vitest run src/lib/distance --reporter=dot` and
   the bologoeByRuleKm probe (anchor temporarily disabled, target 801) BEFORE
   shipping. If any oracle moves, gate the exclusion more narrowly (e.g. only the
   Москва–СПб edge set) and FLAG — never ship a regression.

---

## 5. Summary for the engine

- Legal basis to exclude скоростные линии from FREIGHT tariff routing:
  **ТР-1 2026 §I п.4** «в обход малодеятельных участков и **скоростных линий** для
  всех грузов» (Приказ ФАС 894/25) → reads ТР-4 Книга 3 «без обходных и
  соединительных ветвей в узлах» + **Порядок определения кратчайшего расстояния
  (Приказ Минтранса № 313)**.
- Detour distance is determined the same way as for малодеятельные: it is the
  shortest in-graph path that does NOT use a скоростная-line edge (the published
  freight обход). It is **not** a separately-tabulated km — the orders are rule-based.
- The one high-speed line proven by public primary source here: **Москва–СПб
  (Сапсан, главный ход Октябрьской ж.д.)**; freight diverted via Волхов/Череповец/
  Вологда/Ярославль or Дно–Новосокольники (660→1110 km). This is the line whose
  exclusion turns the buggy 539 into the legal 801.

---

## 6. RESULT — what shipped (verified on `main`)

The exclusion is implemented exactly as the малодеятельные/обходные mechanism, but at
the **edge** level. Wiring chain:

`scripts/seed-data/tr4-skorostnye-edges.json` `.edges`
→ `loadSkorostnye()` (`repository.ts:353`)
→ `compileGraph(..., skorostnye)` builds `CompiledGraph.skorostnyeEdges` (a `pairKey` Set, `computeDistance.ts:234`)
→ `backboneTerminal` (`computeDistance.ts:394`):
  (a) the **direct-AS-IS guard** refuses to return a скоростная edge (`:404`), and
  (b) the **kniga3 Dijkstra** skips скоростные edges during relaxation (`:423`),
forcing freight onto the legal обход.

### 6.1 Edges now excluded (genuinely sourced)

The 5 consecutive **Москва–СПб главный ход (Сапсан, скоростное движение)** узел↔узел
edges, each cited to ТР-4 Книга 3 «Общие положения» (verbatim «…малодеятельных участков,
**скоростных линий**…», Приказ МПС 15.07.2003 N55) + ru.wikipedia Сапсан / Октябрьская ж.д.
HS classification:

| Edge | Узлы | km | Сегмент |
|------|------|----|---------|
| 060001↔061502 | Москва-Ховрино ↔ Тверь | 154 | главный ход |
| 061502↔050009 | Тверь ↔ Бологое-Московское | 164 | главный ход |
| 050009↔053703 | Бологое ↔ Окуловка | 584 | до 250 км/ч на Окуловка–Мстинский мост |
| 053703↔042003 | Окуловка ↔ Чудово-Московское | 131 | главный ход |
| 042003↔000023 | Чудово ↔ СПб узел | 132 | главный ход |

### 6.2 NO-FABRICATION GUARD (load-bearing)

`loadSkorostnye()` **deliberately SKIPS** the `binding_shortcut:true` edge
**Хийтola(022404)↔Окуловка(053703)=429**. That edge is the one the 539 route actually
rides (direct-AS-IS), but it is **NOT itself a designated скоростная линия** — it is a
published kniga3 ТП↔ТП edge from the Карельский-перешеек узел into the HS-line узел.
Marking it скоростная to defeat 539 would be inventing a line classification with no
primary source. Per the no-fabrication mandate, it stays in the data flagged but is NOT
fed to the engine.

---

## 7. VERIFICATION — does the rule produce 801? (anchor temporarily disabled)

Pinned in `src/lib/distance/aymCrimeaCoverage.test.ts` (by-RULE harness, `specials:[]`,
exclusion ON):

- **`bologoeByRuleKm` = 539** (NOT 801). `baseline` (exclusion OFF) = 539; `byRule`
  (exclusion ON) = 539 — the exclusion changes nothing for this route.
- **Why the rule alone fails:** the 539 = КС→Хийтola spur 40 + the published
  Хийтola(022404)↔Окуловка(053703)=429 edge + Окуловка→Бологое dest-spur 70. The engine
  returns the 429 verbatim via the direct-AS-IS guard. Banning the 5 sourced HS main-line
  edges does nothing because the 539 path does not ride them; even dropping the 429 edge
  re-routes Хийтola→Ручьи→Окуловка≈429 (anti-undercut floor). The nearest **legal in-graph
  alternative is 851 via Дно** (then 927 via Сонково) — there is **NO ~801 corridor** in the
  current 652-ТП graph.
- **Verdict:** the general скоростные-линии rule is correctly implemented and oracle-safe,
  but **cannot reach 801 with the узлы/edges we currently have.** The temporary verified
  anchor (`special-distances.json` `022207/050009=801`) **MUST STAY**. No bypass edge was
  invented.

### 7.1 Does it generalize to other Москва–СПб-line routes?

Yes, mechanically: any freight route whose shortest in-graph path would otherwise ride one
of the 5 excluded главный-ход edges is now forced onto the обход. But the КС→Бологое case
proves the **limit**: when the undercut rides a *non-HS* published edge that merely
*touches* the corridor (Хийтola↔Окуловка), the edge-exclusion cannot catch it without
fabricating a classification. Routes that genuinely traverse the главный ход узел-to-узел
(e.g. Тверь→Окуловка) are diverted correctly; routes that *enter* the corridor via a side
узел edge are not.

### 7.2 Honest residual

1. **Missing 801 corridor edges.** To retire the anchor the graph needs the real
   Хийтola→СПб→(Дно/Новосокольники)→Бологое legal freight corridor edges that sum to 801.
   They are absent from `kniga3-full.json` and must be acquired from a primary source
   (ТР-4 Книга 1/3 section legs) before the anchor can go. Until then: anchor + rule.
2. **Other скоростные/ВСМ segments not yet sourced.** Only Москва–СПб (Сапсан) is sourced.
   The forthcoming ВСМ Москва–СПб, and any other скоростное движение (e.g.
   Москва–Нижний Новгород «Стриж/Ласточка» segments), are NOT yet in
   `tr4-skorostnye-edges.json` — each needs its own РЖД/Минтранс citation before exclusion.
3. **The Хийтola↔Окуловка undercut remains live** for КС→Бологое by the rule alone; it is
   the documented reason the anchor stays.
