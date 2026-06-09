// ─────────────────────────────────────────────────────────────────────────────
// computeDistance.ts — ТР-4 tariff-distance engine (Книга-1 / Книга-3 узел graph).
//
// PUBLIC SIGNATURE (unchanged for callers):
//   computeDistance(input: DistanceInput, data: DistanceData): DistanceResult
//
// ALGORITHM (matches the engine that hits oracle квитанции to the km):
//   1. Special-distance override (by station ESR pair) wins over everything.
//   2. Same-station → 0 km.
//   3. Shared-узел shortcut: if origin and dest hang off the same bounding узел,
//      the result is |cumA − cumB| (same участок) or cumA + cumB (adjacent участки
//      joined at that узел) — MIN over all shared anchors, no backbone needed.
//   4. Enumerate (origin узел-leg × dest узел-leg) candidates:
//        leg1 + bridgeOrigin + backboneTerminal + bridgeDest + leg3
//      The "bridge" hops a peripheral узел (no kniga3 edges) over kniga1 участок
//      edges to the nearest backbone узел(ы). backboneTerminal returns the
//      PUBLISHED direct kniga3 edge as-is (never undercut by chaining).
//   5. Conditional hub adder (Moscow +54 / SPb +25) when the hub узел is
//      traversed mid-path across different lines.
//   6. Round half-up at 500 m.
// ─────────────────────────────────────────────────────────────────────────────

import type { DistanceInput, DistanceLeg, DistanceResult } from "./schema";

// ── Injected data shapes ──────────────────────────────────────────────────────

/** One участок leg from a station to a bounding узел (from kniga1-sections.json). */
export interface Kniga1Row {
  readonly esr: string;
  readonly name: string;
  readonly uzelEsr: string;
  readonly uzelName: string;
  readonly km: number;
  readonly uchastok: string;
}

/** One узел↔узел edge (from uzel-graph.json). */
export interface UzelEdge {
  readonly aEsr: string;
  readonly bEsr: string;
  readonly km: number;
  readonly uchastok: string;
  readonly source: "kniga1" | "kniga3" | string;
}

/** The узел graph (nodes + edges). */
export interface UzelGraph {
  readonly nodes: ReadonlyArray<{ esr: string; name: string }>;
  readonly edges: ReadonlyArray<UzelEdge>;
}

/**
 * One station that belongs to a particular radial line of a узел.
 * Used to decide the ТР-4 «same radial line» exclusion (entry line == exit line).
 */
export interface HubLineStation {
  readonly name: string;
  readonly esr: string | null;
}

/** Hub fixed-distance adder descriptor. */
export interface HubEntry {
  readonly hub: string;
  readonly km: number;
  readonly esr: string;
  /**
   * Optional line→station membership of the узел (from hub-distances.json `lines`).
   * Keyed by radial-line name; each line lists its constituent station names/ESR.
   * When present, the engine suppresses the +54/+25 km adder if the wagon enters
   * AND exits the узел on the SAME line (ТР-4 same-radial-line exclusion,
   * consultant.ru LAW_63243 / Приказ МПС 15.07.2003 N55). When absent or the line
   * identity for a route cannot be resolved, the engine keeps the additive
   * behavior as a documented fallback (never regressing the км oracles).
   */
  readonly lines?: Readonly<Record<string, ReadonlyArray<HubLineStation>>>;
}

/**
 * Pair-level distance override.
 *
 * `a`/`b` MUST be 6-digit station ESR codes — they are matched directly against
 * `originEsr`/`destEsr` (the engine keys every station by ESR). Earlier the seed
 * stored station-NAME strings here, so the §2 override branch was permanently
 * unreachable (a name never equals a 6-digit ESR). Overrides are now ESR-keyed.
 */
export interface SpecialOverride {
  readonly a: string; // 6-digit ESR of one endpoint
  readonly b: string; // 6-digit ESR of the other endpoint
  readonly km: number;
}

/**
 * All graph data needed by computeDistance.
 * Loaded once from JSON files by the repository (repository.ts).
 */
export interface DistanceData {
  readonly kniga1: ReadonlyArray<Kniga1Row>;
  readonly graph: UzelGraph;
  readonly hubs: ReadonlyArray<HubEntry>;
  readonly specials: ReadonlyArray<SpecialOverride>;
  /** Pre-compiled graph (filled by the repository after first compile). */
  readonly compiled?: CompiledGraph;
}

// ── Compiled graph (internal lookup structures) ───────────────────────────────

interface UzelLeg {
  readonly uzelEsr: string;
  readonly uzelName: string;
  readonly km: number;
  readonly uchastok: string;
}

export interface CompiledGraph {
  readonly stationLegs: Map<string, UzelLeg[]>;
  readonly backboneAdj: Map<string, Array<{ to: string; km: number }>>;
  readonly bridgeAdj: Map<string, Array<{ to: string; km: number }>>;
  readonly backboneNodes: Set<string>;
  readonly directBackbone: Map<string, number>;
  readonly nodeName: Map<string, string>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pushUndirected(
  adj: Map<string, Array<{ to: string; km: number }>>,
  a: string,
  b: string,
  km: number,
): void {
  let listA = adj.get(a);
  if (!listA) { listA = []; adj.set(a, listA); }
  listA.push({ to: b, km });

  let listB = adj.get(b);
  if (!listB) { listB = []; adj.set(b, listB); }
  listB.push({ to: a, km });
}

export function compileGraph(
  kniga1: ReadonlyArray<Kniga1Row>,
  graph: UzelGraph,
): CompiledGraph {
  const stationLegs = new Map<string, UzelLeg[]>();
  for (const r of kniga1) {
    if (!r.uzelEsr || r.km == null) continue;
    let list = stationLegs.get(r.esr);
    if (!list) { list = []; stationLegs.set(r.esr, list); }
    list.push({ uzelEsr: r.uzelEsr, uzelName: r.uzelName, km: r.km, uchastok: r.uchastok });
  }

  const backboneAdj = new Map<string, Array<{ to: string; km: number }>>();
  const bridgeAdj = new Map<string, Array<{ to: string; km: number }>>();
  const backboneNodes = new Set<string>();
  const directBackbone = new Map<string, number>();

  // First pass: identify backbone nodes and direct edges.
  for (const e of graph.edges) {
    if (e.source === "kniga3") {
      backboneNodes.add(e.aEsr);
      backboneNodes.add(e.bEsr);
      const k = pairKey(e.aEsr, e.bEsr);
      const prev = directBackbone.get(k);
      if (prev == null || e.km < prev) directBackbone.set(k, e.km);
    }
  }

  // Second pass: build adjacency.
  for (const e of graph.edges) {
    if (e.source === "kniga3") {
      pushUndirected(backboneAdj, e.aEsr, e.bEsr, e.km);
    } else {
      pushUndirected(bridgeAdj, e.aEsr, e.bEsr, e.km);
    }
  }

  const nodeName = new Map<string, string>();
  for (const n of graph.nodes) nodeName.set(n.esr, n.name);

  return { stationLegs, backboneAdj, bridgeAdj, backboneNodes, directBackbone, nodeName };
}

// ── Last-mile bridging ────────────────────────────────────────────────────────

interface BridgeResult {
  readonly node: string;
  readonly bridgeKm: number;
}

/** Resolve a узел to backbone-reachable узлы (or itself if already backbone). */
function toBackbone(g: CompiledGraph, uzel: string): BridgeResult[] {
  if (g.backboneNodes.has(uzel)) {
    return [{ node: uzel, bridgeKm: 0 }];
  }
  const dist = new Map<string, number>([[uzel, 0]]);
  const pq: Array<[number, string]> = [[0, uzel]];
  const reached = new Map<string, number>();
  while (pq.length) {
    pq.sort((x, y) => x[0] - y[0]);
    const top = pq.shift();
    if (!top) break;
    const [d, u] = top;
    if (d > (dist.get(u) ?? Infinity)) continue;
    if (u !== uzel && g.backboneNodes.has(u)) {
      if (!reached.has(u)) reached.set(u, d);
      continue;
    }
    const neighbors = g.bridgeAdj.get(u);
    if (neighbors) {
      for (const { to, km } of neighbors) {
        const nd = d + km;
        if (nd < (dist.get(to) ?? Infinity)) {
          dist.set(to, nd);
          pq.push([nd, to]);
        }
      }
    }
  }
  const results: BridgeResult[] = [];
  for (const [node, bridgeKm] of reached) {
    results.push({ node, bridgeKm });
  }
  return results;
}

// ── Backbone terminal distance ────────────────────────────────────────────────

interface BackboneResult {
  readonly km: number;
  readonly path: string[];
}

/**
 * Returns the published kniga3 edge AS-IS if it exists; otherwise falls back to
 * Dijkstra over kniga3 edges only. A published direct edge is NEVER undercut.
 */
function backboneTerminal(g: CompiledGraph, a: string, b: string): BackboneResult | null {
  if (a === b) return { km: 0, path: [a] };

  const direct = g.directBackbone.get(pairKey(a, b));
  if (direct != null) {
    return { km: direct, path: [a, b] };
  }

  // Dijkstra over kniga3 edges only.
  const dist = new Map<string, number>([[a, 0]]);
  const prev = new Map<string, string>();
  const pq: Array<[number, string]> = [[0, a]];
  while (pq.length) {
    pq.sort((x, y) => x[0] - y[0]);
    const top = pq.shift();
    if (!top) break;
    const [d, u] = top;
    if (u === b) break;
    if (d > (dist.get(u) ?? Infinity)) continue;
    const neighbors = g.backboneAdj.get(u);
    if (neighbors) {
      for (const { to, km } of neighbors) {
        const nd = d + km;
        if (nd < (dist.get(to) ?? Infinity)) {
          dist.set(to, nd);
          prev.set(to, u);
          pq.push([nd, to]);
        }
      }
    }
  }
  const total = dist.get(b);
  if (total == null) return null;
  const path: string[] = [];
  let x: string | undefined = b;
  while (x) {
    path.unshift(g.nodeName.get(x) ?? x);
    x = prev.get(x);
  }
  return { km: total, path };
}

// ── Shared-узел shortcut (same-участок |Δ| + adjacent-section sum) ─────────────

/**
 * Resolve the distance when both stations hang off the SAME bounding узел, without
 * touching the Книга-3 backbone. Two ТР-4 cases share that узел anchor:
 *
 *   • SAME участок  (o.uchastok === d.uchastok): both stations lie on one section,
 *     so the distance is the cumulative-km difference |o.km − d.km| (M21/§3 shortcut).
 *
 *   • ADJACENT участки (o.uchastok !== d.uchastok, same o.uzelEsr): the two sections
 *     meet AT the узел, so the path is station→узел→station = o.km + d.km (M3). There
 *     is no backbone hop to subtract — the узел IS the join point.
 *
 * Both cases can be reachable through several shared anchors on loop/multi-anchor
 * участки; we therefore evaluate EVERY (o,d) anchor pair that shares a узел and
 * return the MINIMUM km (M4 — previously this returned the FIRST match, making the
 * result order-dependent on the kniga1 leg ordering).
 *
 * Returns null when origin and dest share no bounding узел (→ backbone enumeration).
 */
function sharedUzelDistance(
  oLegs: UzelLeg[],
  dLegs: UzelLeg[],
): { km: number; uzel: string } | null {
  let bestKm = Infinity;
  let bestUzel = "";
  for (const o of oLegs) {
    for (const d of dLegs) {
      if (o.uzelEsr !== d.uzelEsr) continue;
      // Same участок → |Δcum|; adjacent участки joined at the узел → sum of legs.
      const km =
        o.uchastok && o.uchastok === d.uchastok
          ? Math.abs(o.km - d.km)
          : o.km + d.km;
      if (km < bestKm) {
        bestKm = km;
        bestUzel = `${o.uzelName}(${o.uzelEsr})`;
      }
    }
  }
  if (!isFinite(bestKm)) return null;
  return { km: bestKm, uzel: bestUzel };
}

// ── Узел same-radial-line exclusion (ТР-4) ────────────────────────────────────

/**
 * Resolve a station/узел (by ESR and/or display name) to the узел radial line it
 * belongs to, using the hub's `lines` membership map. Returns the line name, or
 * `null` when the station is not a known member of any line of this узел (→ the
 * caller treats the line identity as unknown and keeps the additive fallback).
 *
 * ТР-4 / Приказ МПС 15.07.2003 N55 (consultant.ru LAW_63243): the +54/+25 км
 * внутриузловое расстояние is NOT added when the wagon enters and leaves the узел
 * on the SAME radial line.
 */
function resolveHubLine(
  hub: HubEntry,
  esr: string | null,
  name: string | null,
): string | null {
  if (!hub.lines) return null;
  for (const [line, stations] of Object.entries(hub.lines)) {
    for (const st of stations) {
      if (esr && st.esr && st.esr === esr) return line;
      if (name && st.name === name) return line;
    }
  }
  return null;
}

/**
 * Decide whether the узел adder must be SUPPRESSED for a route whose backbone
 * path traverses the hub `H` in its interior. We look at the path node immediately
 * before the hub (entry side) and immediately after it (exit side); if BOTH resolve
 * to the SAME line of the узел, the adder is excluded (same-radial-line rule).
 *
 * When either side's line cannot be resolved, we return `false` (do NOT suppress)
 * — the documented additive fallback that keeps the км oracles exact.
 */
function isSameRadialLine(
  hub: HubEntry,
  pathNames: ReadonlyArray<string>,
  hubName: string,
): boolean {
  if (!hub.lines) return false;
  const idx = pathNames.indexOf(hubName);
  if (idx <= 0 || idx >= pathNames.length - 1) return false;
  const entryName = pathNames[idx - 1];
  const exitName = pathNames[idx + 1];
  const entryLine = resolveHubLine(hub, null, entryName);
  const exitLine = resolveHubLine(hub, null, exitName);
  if (entryLine == null || exitLine == null) return false;
  return entryLine === exitLine;
}

// ── ТР-4 rounding ─────────────────────────────────────────────────────────────

function roundKm(km: number): number {
  return Math.floor(km + 0.5);
}

// ── Public core ───────────────────────────────────────────────────────────────

function red(warning: string): DistanceResult {
  return { km: null, legs: [], confidence: "red", warnings: [warning] };
}

/**
 * computeDistance — ТР-4 узел-graph engine.
 *
 * `data.compiled` must be a pre-compiled graph (call `compileGraph` once and cache).
 */
export function computeDistance(input: DistanceInput, data: DistanceData): DistanceResult {
  const { originEsr, destEsr } = input;
  const warnings: string[] = [];

  if (!data.compiled) {
    return red("graph not compiled — call compileGraph() before computeDistance()");
  }
  const g = data.compiled;

  // 1) Same station.
  if (originEsr === destEsr) {
    return {
      km: 0,
      legs: [{ kind: "direct", fromEsr: originEsr, toEsr: destEsr, km: 0 }],
      confidence: "green",
      warnings,
    };
  }

  // 2) Special ESR-pair override.
  for (const s of data.specials) {
    const match =
      (s.a === originEsr && s.b === destEsr) ||
      (s.a === destEsr && s.b === originEsr);
    if (match) {
      return {
        km: roundKm(s.km),
        legs: [{ kind: "special", fromEsr: originEsr, toEsr: destEsr, km: s.km }],
        confidence: "green",
        warnings,
      };
    }
  }

  const oLegs = g.stationLegs.get(originEsr);
  const dLegs = g.stationLegs.get(destEsr);

  if (!oLegs || oLegs.length === 0) {
    return red(`no kniga1 leg for origin station ${originEsr}`);
  }
  if (!dLegs || dLegs.length === 0) {
    return red(`no kniga1 leg for dest station ${destEsr}`);
  }

  // 3) Shared-узел shortcut (same участок |Δ| OR adjacent участки joined at узел).
  const same = sharedUzelDistance(oLegs, dLegs);
  if (same != null) {
    const leg: DistanceLeg = { kind: "backbone", fromEsr: originEsr, toEsr: destEsr, km: same.km };
    return { km: roundKm(same.km), legs: [leg], confidence: "green", warnings };
  }

  // 4) Enumerate candidates.
  let bestKm = Infinity;
  let bestLegs: DistanceLeg[] = [];
  let anyTried = false;

  for (const oLeg of oLegs) {
    for (const dLeg of dLegs) {
      for (const ob of toBackbone(g, oLeg.uzelEsr)) {
        for (const db of toBackbone(g, dLeg.uzelEsr)) {
          anyTried = true;
          const bk = backboneTerminal(g, ob.node, db.node);
          if (!bk) continue;

          // Hub adder: check if a hub узел is in the interior of the backbone path.
          // ТР-4 same-radial-line exclusion: the +54/+25 км adder is NOT applied
          // when the wagon enters AND leaves the узел on the same radial line.
          // We inspect the path node before/after the hub; if both belong to the
          // same line of that узел (per hub.lines) the adder is suppressed. When the
          // line identity is unknown for a route, we keep the additive fallback so
          // the calibrated км oracles never regress.
          let adder = 0;
          const inner = bk.path.slice(1, -1);
          for (const h of data.hubs) {
            const hName = g.nodeName.get(h.esr);
            if (hName && inner.includes(hName)) {
              if (isSameRadialLine(h, bk.path, hName)) continue; // same-line → no adder
              adder += h.km;
            }
          }

          const raw = oLeg.km + ob.bridgeKm + bk.km + db.bridgeKm + dLeg.km + adder;
          if (raw < bestKm) {
            bestKm = raw;
            const legs: DistanceLeg[] = [
              { kind: "spur-origin", fromEsr: originEsr, toEsr: oLeg.uzelEsr, km: oLeg.km },
              { kind: "backbone", fromEsr: oLeg.uzelEsr, toEsr: dLeg.uzelEsr, km: bk.km },
              { kind: "spur-dest", fromEsr: dLeg.uzelEsr, toEsr: destEsr, km: dLeg.km },
            ];
            if (adder > 0) {
              legs.push({ kind: "hub-adder", fromEsr: null, toEsr: null, km: adder });
            }
            bestLegs = legs;
          }
        }
      }
    }
  }

  if (!isFinite(bestKm)) {
    const why = anyTried
      ? `backbone edge missing between узлы of ${originEsr} and ${destEsr} (Книга 3 partial)`
      : `no узел candidates for ${originEsr} → ${destEsr}`;
    return red(why);
  }

  return { km: roundKm(bestKm), legs: bestLegs, confidence: "green", warnings };
}
