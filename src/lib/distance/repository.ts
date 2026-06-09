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
    source: "cisfill",
  }));
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

let cachedData: DistanceData | null = null;

function getData(): DistanceData {
  if (cachedData) return cachedData;

  const kniga1Base = loadJson<Kniga1Row[]>("kniga1-sections.json");
  // RF station-coverage attach legs (kniga1-transit-attach.json): extra stationLegs
  // for RF stations with no участок leg, derived from the CSV's own «Транзитные пункты»
  // offsets. Appended to stationLegs only — never to the узел graph — so existing
  // routes (and all km oracles) are unaffected. See loadTransitAttach() doc.
  const kniga1 = [...kniga1Base, ...loadTransitAttach()];
  const baseGraph = loadJson<UzelGraph>("uzel-graph.json");

  // Merge cross-border bridge edges (uzel-graph-cisfill.json) into the узел graph
  // so CIS / Baltic / Kaliningrad / Kazakhstan routes connect to the RF core.
  // Each bridge links a paired стык ТП across administrations; km is the published
  // border distance (0 for co-located стык connectors — priced distance comes from
  // the per-administration section sums per the interstate segmentation rule).
  const cisFill = loadCisFill();
  const gapFill = loadGapFill();
  const gapFill2 = loadGapFill2();
  const kniga1Adj = loadKniga1Adjacency();
  const graph: UzelGraph = {
    nodes: baseGraph.nodes,
    edges: [...baseGraph.edges, ...cisFill, ...gapFill, ...gapFill2, ...kniga1Adj],
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

  const compiled = compileGraph(kniga1, graph);

  cachedData = { kniga1, graph, hubs, specials, uzelClass, compiled };
  return cachedData;
}

// ── resolveDistance — public async entry point ────────────────────────────────

export async function resolveDistance(rawInput: DistanceInput): Promise<DistanceResult> {
  const input = distanceInputSchema.parse(rawInput);
  const data = getData();
  return computeDistance(input, data);
}
