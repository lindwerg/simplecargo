// ─────────────────────────────────────────────────────────────────────────────
// repository.ts — I/O layer for the ТР-4 узел-graph engine.
//
// Loads kniga1-sections.json + uzel-graph.json + hub-distances.json +
// special-distances.json from the seed-data directory, compiles the graph once
// (module-level singleton), and exposes `resolveDistance(input)`.
//
// No DB access. All lookups are in-memory after the first call.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computeDistance, compileGraph } from "./computeDistance";
import type {
  DistanceData,
  HubEntry,
  Kniga1Row,
  SkorostnayaEdge,
  SpecialOverride,
  UzelClass,
  UzelEdge,
  UzelGraph,
} from "./computeDistance";
import { distanceInputSchema, type DistanceInput, type DistanceResult } from "./schema";

// ── Seed-data path ────────────────────────────────────────────────────────────

const SEED_DATA = resolve(process.cwd(), "scripts/seed-data");

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED_DATA, name), "utf8")) as T;
}

/** Raw row shape of uzel-graph-cisfill.json (cross-border bridge edges). */
interface CisFillRow {
  readonly aEsr: string;
  readonly bEsr: string;
  readonly km: number;
  readonly crossing?: string;
  readonly corridor?: string;
}

/**
 * Loads the cross-border bridge edges and normalizes them to UzelEdge.
 * Missing/empty file is tolerated (returns []) so the engine still works
 * before the fill is acquired.
 *
 * The border стык edges are emitted with source="kniga3" so they join the two
 * administrations' BACKBONE узлы directly: `backboneTerminal`'s Dijkstra walks
 * kniga3 edges only, and once a foreign-administration backbone (e.g. the БЧ
 * ТП↔ТП table, loadByBackbone) is wired both styk endpoints are themselves
 * backbone узлы — a bridge-source styk would never be crossed by the backbone
 * walk (`toBackbone` returns each endpoint immediately), so cross-border routes
 * stayed red. The стык km is the published border distance (0 for co-located
 * connectors; the priced distance is the per-administration section sums per the
 * ТР-4 interstate segmentation rule). compileGraph keeps the SHORTEST edge per
 * pair, so promoting these to kniga3 can only ADD reachability and never undercut
 * a published RF edge — the 4 km oracles stay exact (verified in the test).
 */
function loadCisFill(): UzelEdge[] {
  let rows: CisFillRow[];
  try {
    rows = loadJson<CisFillRow[]>("uzel-graph-cisfill.json");
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    aEsr: r.aEsr,
    bEsr: r.bEsr,
    km: r.km,
    uchastok: r.crossing ?? r.corridor ?? "border-styk",
    source: "kniga3",
  }));
}

/** Raw row shape of kniga3-backbone-cis.priority.json (foreign-administration ТП↔ТП). */
interface CisBackboneRow {
  readonly aEsr?: string;
  readonly bEsr?: string;
  readonly km?: number;
  readonly admin?: string;
  readonly source?: string;
}

/**
 * Loads the foreign-administration ТП↔ТП backbone (kniga3-backbone-cis.priority.json)
 * as kniga3-source узел edges. This is the official БЧ (Belarus) tariff-distance table
 * (rw.by «Положение об определении тарифных расстояний», ТАБЛИЦА ТАРИФНЫХ РАССТОЯНИЙ
 * действующих с 01.08.2010 — full ТП↔ТП oracle, confidence sourced-official): 29 696
 * verbatim ТП-pair km over 245 ТП. Wired so БЧ stations (cis-spurs.acquired.json legs)
 * resolve+compute against RF via the border стык (loadCisFill). Every km is copied
 * verbatim from the published table — none invented. compileGraph keeps the shortest
 * edge per pair, so this is additive over the partial БЧ slice already in uzel-graph.json
 * and cannot move any RF route. Missing/empty file is tolerated.
 */
function loadCisBackbone(): UzelEdge[] {
  let rows: CisBackboneRow[];
  try {
    rows = loadJson<CisBackboneRow[]>("kniga3-backbone-cis.priority.json");
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: UzelEdge[] = [];
  for (const r of rows) {
    if (!r.aEsr || !r.bEsr || r.km == null) continue;
    out.push({
      aEsr: r.aEsr,
      bEsr: r.bEsr,
      km: r.km,
      uchastok: `cis-backbone-${r.admin ?? "BY"}`,
      source: "kniga3",
    });
  }
  return out;
}

/** Raw row shape of kniga3-full.json (complete ТР-4 Книга-3 ТП↔ТП adjacency). */
interface Kniga3FullRow {
  readonly aEsr?: string;
  readonly bEsr?: string;
  readonly km?: number;
  readonly source?: string;
}

/**
 * Loads the COMPLETE ТР-4 Книга-3 ТП↔ТП adjacency (kniga3-full.json) as kniga3-source
 * узел edges. This is the merge of the existing kniga3-backbone.json with every
 * kniga3-edges-batch-*.json acquired from the published tr4.info per-ТП adjacency pages
 * (/tp/<esr>, cited per edge in the batch source field). Every km is copied verbatim from
 * a fetched primary source — none invented/interpolated. Where a batch page published a
 * shorter ТП↔ТП distance than the backbone for the same pair, compileGraph keeps the
 * SHORTEST edge, so the merged set is purely additive precision over the backbone and
 * cannot move any RF route upward — the 4 km + 17 tariff + АЯМ/Crimea oracles stay exact
 * (verified in the test). Missing/empty file is tolerated (returns []). Mirrors
 * loadCisBackbone: same shape, same source tag, appended to the узел-graph edges.
 */
function loadKniga3Full(): UzelEdge[] {
  let rows: Kniga3FullRow[];
  try {
    rows = loadJson<Kniga3FullRow[]>("kniga3-full.json");
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: UzelEdge[] = [];
  for (const r of rows) {
    if (!r.aEsr || !r.bEsr || r.km == null) continue;
    out.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, uchastok: "kniga3-full", source: "kniga3" });
  }
  return out;
}

/** Raw row shape of uzel-graph-gapfill.json (RF connectivity gap-bridge edges). */
interface GapFillRow {
  readonly aEsr: string;
  readonly bEsr: string;
  readonly km: number;
  readonly uchastok?: string;
  readonly source?: string;
}

/**
 * Loads the RF gap-fill edges (missing kniga3 connections, sourced from kniga1 участок
 * boundaries) and normalizes them to UzelEdge. Missing/empty file is tolerated.
 */
function loadGapFill(): UzelEdge[] {
  let rows: GapFillRow[];
  try {
    rows = loadJson<GapFillRow[]>("uzel-graph-gapfill.json");
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    aEsr: r.aEsr,
    bEsr: r.bEsr,
    km: r.km,
    uchastok: r.uchastok ?? "gapfill",
    source: r.source ?? "gapfill",
  }));
}

/**
 * Loads the second-pass RF gap-fill edges (uzel-graph-gapfill2.json) that reconnect
 * the remaining RF island components (МК МЖД Moscow ring, Тула-Лихвинская, Теткино
 * border branch) to the big component. Missing/empty file is tolerated.
 */
function loadGapFill2(): UzelEdge[] {
  let rows: GapFillRow[];
  try {
    rows = loadJson<GapFillRow[]>("uzel-graph-gapfill2.json");
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    aEsr: r.aEsr,
    bEsr: r.bEsr,
    km: r.km,
    uchastok: r.uchastok ?? "gapfill2",
    source: r.source ?? "gapfill2",
  }));
}

/** Raw row shape of uzel-graph-kniga1.json (full kniga1 участок узел-adjacency). */
interface Kniga1AdjRow {
  readonly aEsr: string;
  readonly bEsr: string;
  readonly km: number;
  readonly uchastok?: string;
  readonly source?: string;
}

/**
 * Loads the full Книга-1 узел-adjacency overlay (uzel-graph-kniga1.json). Every edge
 * is one участок узел-pair whose length is derived directly from kniga1-sections km
 * values: the authoritative узел-as-station endpoint km when present, else the minimum
 * (km_toA + km_toB) over the stations recording both bounding узлы. No invented km.
 * Each pair is deduped to its shortest (most direct) span. compileGraph keeps the
 * shortest edge per pair, so these are harmless where the base graph already has the
 * pair and additive where it does not. Missing/empty file is tolerated.
 */
function loadKniga1Adjacency(): UzelEdge[] {
  let rows: Kniga1AdjRow[];
  try {
    rows = loadJson<Kniga1AdjRow[]>("uzel-graph-kniga1.json");
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => ({
    aEsr: r.aEsr,
    bEsr: r.bEsr,
    km: r.km,
    uchastok: r.uchastok ?? "kniga1-uzeladj",
    source: r.source ?? "kniga1-uzeladj",
  }));
}

/** Raw row shape of kniga1-transit-attach.json (RF station-coverage attach legs). */
interface TransitAttachRow {
  readonly esr: string;
  readonly name: string;
  readonly uzelEsr: string;
  readonly uzelName: string;
  readonly km: number;
  readonly uchastok?: string;
  readonly source?: string;
}

/**
 * Loads the RF station-coverage attach legs (kniga1-transit-attach.json). These are
 * Книга-1 legs for RF stations that have NO участок leg in kniga1-sections.json,
 * derived ONLY from the station CSV's own published «Транзитные пункты» offsets:
 *   • SELF-ТП  — a station that IS a Книга-3 backbone узел gets a 0-km self-leg.
 *   • TRANSIT  — a station's published "Name-km" nearest-ТП offsets become attach legs.
 * They are appended to `kniga1` as extra `stationLegs` (NOT узел-graph edges), so they
 * add resolution for the new station ONLY and cannot move any existing route — the
 * 4 distance + 17 tariff oracles are unaffected. No invented km/ESR (every km is the
 * CSV's own offset; SELF-ТП km is 0 by definition). Missing/empty file is tolerated.
 */
function loadTransitAttach(): Kniga1Row[] {
  let rows: TransitAttachRow[];
  try {
    rows = loadJson<TransitAttachRow[]>("kniga1-transit-attach.json");
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && r.esr && r.uzelEsr && r.km != null)
    .map((r) => ({
      esr: r.esr,
      name: r.name,
      uzelEsr: r.uzelEsr,
      uzelName: r.uzelName,
      km: r.km,
      uchastok: r.uchastok ?? "transit-attach",
    }));
}

/** Raw shape of cis-spurs.acquired.json (consolidated Belarus station→ТП spur layer). */
interface CisSpursFile {
  readonly stations?: ReadonlyArray<{
    readonly stationEsr: string;
    readonly stationName: string;
    readonly spurs?: ReadonlyArray<{ readonly tpEsr: string | null; readonly km: number; readonly tpName: string }>;
  }>;
}

/**
 * Loads the consolidated Belarus (БЧ) station→ТП spur layer (cis-spurs.acquired.json)
 * as additive stationLegs. Each spur is one published «Транзитные пункты» offset from the
 * БЧ station register (cis-stations-20201230.csv field[4]): станция → ближайший ТП at the
 * CSV's own km — never invented. Mirrors loadTransitAttach: appended to `kniga1` as extra
 * stationLegs ONLY (never узел-graph edges), so it adds resolution for the 345 БЧ stations
 * and cannot move any existing RF route (the 4 km oracles are unaffected — verified). Legs
 * whose ТП target ESR is null are skipped (never fabricated). The ТП узлы these attach to
 * are the БЧ backbone узлы wired by loadCisBackbone(); RF reachability is via the border
 * стык (loadCisFill). Missing/empty file is tolerated.
 */
function loadCisSpurs(): Kniga1Row[] {
  let file: CisSpursFile;
  try {
    file = loadJson<CisSpursFile>("cis-spurs.acquired.json");
  } catch {
    return [];
  }
  const out: Kniga1Row[] = [];
  for (const s of file.stations ?? []) {
    if (!s || !s.stationEsr) continue;
    for (const sp of s.spurs ?? []) {
      if (!sp || !sp.tpEsr || sp.km == null) continue;
      out.push({
        esr: s.stationEsr,
        name: s.stationName,
        uzelEsr: sp.tpEsr,
        uzelName: sp.tpName,
        km: sp.km,
        uchastok: `BY-TRANSIT ${s.stationName}`,
      });
    }
  }
  return out;
}

/** Raw row shape of tr4-skorostnye-edges.json `.edges` (high-speed-line узел-pair edges). */
interface SkorostnayaEdgeRow {
  readonly aEsr?: string;
  readonly bEsr?: string;
  readonly binding_shortcut?: boolean;
}

/**
 * Loads the скоростные/высокоскоростные-линии edge exclusion list
 * (tr4-skorostnye-edges.json `.edges`). Each entry is a узел-pair edge of OUR graph
 * that lies on a public высокоскоростная/скоростная линия (ТР-1 2026 §I п.4 «в обход …
 * скоростных линий»; ТР-4 Книга-3 «… скоростных линий …»). Returned as узел-pair keys
 * that computeDistance excludes from the backbone freight walk.
 *
 * NO-FABRICATION GUARD: an edge flagged `binding_shortcut` is the published kniga3
 * ТП↔ТП undercut edge (Хийтola↔Окуловка=429) that is NOT itself a designated скоростная
 * линия — the seed file's own `caution` field marks it "UNVERIFIED as a physically-
 * traversed HS segment". We SKIP such edges here: excluding it would be classifying a
 * non-HS published edge as HS (fabrication), and the analysis (analyze-skorostnye.mjs)
 * confirms banning it changes nothing (the route re-routes Хийтola→Ручьи→Окуловка=429
 * or strands to 851 via Дно, never 801). Only genuinely-sourced HS edges are excluded.
 * Missing/empty file is tolerated (returns [] → the exclusion is a no-op).
 */
function loadSkorostnye(): SkorostnayaEdge[] {
  let file: { edges?: SkorostnayaEdgeRow[] };
  try {
    file = loadJson<{ edges?: SkorostnayaEdgeRow[] }>("tr4-skorostnye-edges.json");
  } catch {
    return [];
  }
  const rows = Array.isArray(file.edges) ? file.edges : [];
  const out: SkorostnayaEdge[] = [];
  for (const r of rows) {
    if (!r.aEsr || !r.bEsr) continue;
    if (r.binding_shortcut) continue; // not itself a designated HS line — never fabricate
    out.push({ aEsr: r.aEsr, bEsr: r.bEsr });
  }
  return out;
}

/** Raw shape of one узел entry in tr4-uzel-class.json (under `uzly`). */
interface Tr4UzelClassEntry {
  readonly class: string;
  readonly directional?: string;
}

/** Raw file shape of tr4-uzel-class.json. */
interface Tr4UzelClassFile {
  readonly uzly?: Readonly<Record<string, Tr4UzelClassEntry>>;
}

/**
 * Loads the ТР-4 узел classification (tr4-uzel-class.json) into an esr→UzelClass map.
 * Drives the same-участок spur-attachment filter in computeDistance (ТР-1 §I п.4 /
 * ТР-4 Книга-3 общие положения). Missing/empty file is tolerated (returns an empty
 * map) so the filter degrades to the conservative no-op fallback. No invented km.
 */
function loadUzelClass(): Map<string, UzelClass> {
  const map = new Map<string, UzelClass>();
  let file: Tr4UzelClassFile;
  try {
    file = loadJson<Tr4UzelClassFile>("tr4-uzel-class.json");
  } catch {
    return map;
  }
  const uzly = file.uzly ?? {};
  for (const [esr, entry] of Object.entries(uzly)) {
    if (!entry || typeof entry.class !== "string") continue;
    map.set(esr, {
      class: entry.class,
      ...(entry.directional ? { directional: entry.directional } : {}),
    });
  }
  return map;
}

// ── Module-level singleton (compiled once on first call) ──────────────────────

/** Raw edge shape of kniga3-aym.json / kniga-crimea.json tpEdges ({a,b,km,aEsr,bEsr}). */
interface NamedEdgeRow {
  readonly aEsr?: string;
  readonly bEsr?: string;
  readonly km?: number;
}

/**
 * Loads the ЖД Якутии (АЯМ) corridor ТП↔ТП legs (kniga3-aym.json `.edges`) as kniga3-source
 * узел edges. Every km is verbatim from the station CSV's published «Транзитные пункты» offsets
 * (see the file's _meta; ТР-4/tr4.info has no ЖДЯ rows). compileGraph keeps the shortest edge
 * per pair, so this is additive — it connects the АЯМ corridor (Тында gateway → Нижний Бестях)
 * to the RF backbone and cannot move any existing RF route. Missing/empty file tolerated.
 */
function loadAym(): UzelEdge[] {
  let file: { edges?: NamedEdgeRow[] };
  try {
    file = loadJson<{ edges?: NamedEdgeRow[] }>("kniga3-aym.json");
  } catch {
    return [];
  }
  const rows = Array.isArray(file.edges) ? file.edges : [];
  const out: UzelEdge[] = [];
  for (const r of rows) {
    if (!r.aEsr || !r.bEsr || r.km == null) continue;
    out.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, uchastok: "aym", source: "kniga3" });
  }
  return out;
}

/**
 * Loads Crimea (ФГУП КЖД, road 85) ТП↔ТП backbone edges (kniga-crimea.json `.tpEdges`) as
 * kniga3-source узел edges. Verbatim from the station CSV offsets + tr4.info road 85. Crimea is
 * a connected sub-network (annexed corridor via the Крымский мост / Джанкой) — additive, cannot
 * move any existing route. Distance resolves once wired; stays OUT of priced RF scope.
 */
function loadCrimeaEdges(): UzelEdge[] {
  let file: { tpEdges?: NamedEdgeRow[] };
  try {
    file = loadJson<{ tpEdges?: NamedEdgeRow[] }>("kniga-crimea.json");
  } catch {
    return [];
  }
  const rows = Array.isArray(file.tpEdges) ? file.tpEdges : [];
  const out: UzelEdge[] = [];
  for (const r of rows) {
    if (!r.aEsr || !r.bEsr || r.km == null) continue;
    out.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, uchastok: "crimea", source: "kniga3" });
  }
  return out;
}

/** Loads Crimea station→ТП attach legs (kniga-crimea.json `.stationLegs`) as additive stationLegs. */
function loadCrimeaLegs(): Kniga1Row[] {
  let file: { stationLegs?: TransitAttachRow[] };
  try {
    file = loadJson<{ stationLegs?: TransitAttachRow[] }>("kniga-crimea.json");
  } catch {
    return [];
  }
  const rows = Array.isArray(file.stationLegs) ? file.stationLegs : [];
  return rows
    .filter((r) => r && r.esr && r.uzelEsr && r.km != null)
    .map((r) => ({
      esr: r.esr,
      name: r.name,
      uzelEsr: r.uzelEsr,
      uzelName: r.uzelName,
      km: r.km,
      uchastok: r.uchastok ?? "crimea-attach",
    }));
}

let cachedData: DistanceData | null = null;

function getData(): DistanceData {
  if (cachedData) return cachedData;

  const kniga1Base = loadJson<Kniga1Row[]>("kniga1-sections.json");
  // RF station-coverage attach legs (kniga1-transit-attach.json): extra stationLegs
  // for RF stations with no участок leg, derived from the CSV's own «Транзитные пункты»
  // offsets. Appended to stationLegs only — never to the узел graph — so existing
  // routes (and all km oracles) are unaffected. See loadTransitAttach() doc.
  // loadCisSpurs(): consolidated Belarus (БЧ) station→ТП spur legs — additive stationLegs
  // for 345 БЧ stations, derived from the БЧ station register's own «Транзитные пункты»
  // offsets. Like loadTransitAttach, appended to stationLegs only, never to the узел graph.
  const kniga1 = [...kniga1Base, ...loadTransitAttach(), ...loadCisSpurs(), ...loadCrimeaLegs()];
  const baseGraph = loadJson<UzelGraph>("uzel-graph.json");

  // Merge cross-border bridge edges (uzel-graph-cisfill.json) into the узел graph
  // so CIS / Baltic / Kaliningrad / Kazakhstan routes connect to the RF core.
  // Each bridge links a paired стык ТП across administrations; km is the published
  // border distance (0 for co-located стык connectors — priced distance comes from
  // the per-administration section sums per the interstate segmentation rule).
  const cisFill = loadCisFill();
  const cisBackbone = loadCisBackbone();
  const kniga3Full = loadKniga3Full();
  const gapFill = loadGapFill();
  const gapFill2 = loadGapFill2();
  const kniga1Adj = loadKniga1Adjacency();
  const graph: UzelGraph = {
    nodes: baseGraph.nodes,
    edges: [
      ...baseGraph.edges,
      ...cisFill,
      ...cisBackbone,
      ...kniga3Full,
      ...gapFill,
      ...gapFill2,
      ...kniga1Adj,
      ...loadAym(),
      ...loadCrimeaEdges(),
    ],
  };

  // hub-distances.json shape: { hubs: [{ hub, km, esr, lines? }] }
  // `lines` (radial-line → member stations) drives the ТР-4 same-radial-line exclusion:
  // computeDistance suppresses the +54/+25 km adder when a wagon enters AND exits the узел on
  // the same line. The membership is curated in hub-distances.json (Москва 11 / СПб 9 lines);
  // earlier this loader DROPPED `lines`, leaving the exclusion permanently dormant.
  const hubFile = loadJson<{ hubs: HubEntry[] }>("hub-distances.json");
  const hubs: HubEntry[] = (hubFile.hubs ?? []).map((h) => ({
    hub: h.hub,
    km: h.km,
    esr: h.esr,
    ...(h.lines ? { lines: h.lines } : {}),
  }));

  // special-distances.json shape: { overrides: [{ a, b, km }] }
  const specialFile = loadJson<{ overrides: SpecialOverride[] }>("special-distances.json");
  const specials: SpecialOverride[] = (specialFile.overrides ?? []).map((s) => ({
    a: s.a,
    b: s.b,
    km: s.km,
  }));

  const uzelClass = loadUzelClass();

  // Скоростные-линии edge exclusion (ТР-1 2026 §I п.4 «в обход … скоростных линий»):
  // узел-pair edges on a public высокоскоростная/скоростная линия that freight must
  // bypass. compileGraph records them as a pairKey set; backboneTerminal skips them.
  const skorostnye = loadSkorostnye();

  const compiled = compileGraph(kniga1, graph, skorostnye);

  cachedData = { kniga1, graph, hubs, specials, uzelClass, compiled };
  return cachedData;
}

// ── resolveDistance — public async entry point ────────────────────────────────

export async function resolveDistance(rawInput: DistanceInput): Promise<DistanceResult> {
  const input = distanceInputSchema.parse(rawInput);
  const data = getData();
  return computeDistance(input, data);
}
