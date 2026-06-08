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
import type { DistanceData, HubEntry, Kniga1Row, SpecialOverride, UzelEdge, UzelGraph } from "./computeDistance";
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

// ── Module-level singleton (compiled once on first call) ──────────────────────

let cachedData: DistanceData | null = null;

function getData(): DistanceData {
  if (cachedData) return cachedData;

  const kniga1 = loadJson<Kniga1Row[]>("kniga1-sections.json");
  const baseGraph = loadJson<UzelGraph>("uzel-graph.json");

  // Merge cross-border bridge edges (uzel-graph-cisfill.json) into the узел graph
  // so CIS / Baltic / Kaliningrad / Kazakhstan routes connect to the RF core.
  // Each bridge links a paired стык ТП across administrations; km is the published
  // border distance (0 for co-located стык connectors — priced distance comes from
  // the per-administration section sums per the interstate segmentation rule).
  const cisFill = loadCisFill();
  const gapFill = loadGapFill();
  const gapFill2 = loadGapFill2();
  const graph: UzelGraph = {
    nodes: baseGraph.nodes,
    edges: [...baseGraph.edges, ...cisFill, ...gapFill, ...gapFill2],
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

  const compiled = compileGraph(kniga1, graph);

  cachedData = { kniga1, graph, hubs, specials, compiled };
  return cachedData;
}

// ── resolveDistance — public async entry point ────────────────────────────────

export async function resolveDistance(rawInput: DistanceInput): Promise<DistanceResult> {
  const input = distanceInputSchema.parse(rawInput);
  const data = getData();
  return computeDistance(input, data);
}
