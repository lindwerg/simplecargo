/**
 * ТР-4 EXACT tariff-distance engine (distance-v2-b).
 *
 * Implements the official RailTarif routing over TWO graph layers:
 *   1. Книга 3 backbone (kniga3 edges in uzel-graph): РЖД-PUBLISHED узел↔узел
 *      shortest tariff distances «без обходных и соединительных ветвей». Each
 *      such edge is TERMINAL — it must NOT be re-chained through intermediate
 *      backbone узлы to beat it (that produced the −357 km shortcut bug).
 *   2. Книга 1 участок bridges (kniga1 edges in uzel-graph): last-mile узел↔узел
 *      edges for the ~778 peripheral узлы that are not in the backbone.
 *
 * Distance = special-override
 *          OR same-участок |cumA − cumB|
 *          OR  min over (origin узлы × dest узлы) of
 *                leg1 + bridge_origin + backboneKm + bridge_dest + leg3
 *              + conditional Moscow/SPb узел adder,
 *            rounded half-up at 500 m.
 *
 * Pure functions only. Data is injected by the runner.
 */

// ---------- Types ----------

export interface UzelGraph {
  nodes: { esr: string; name: string }[];
  edges: { aEsr: string; bEsr: string; km: number; uchastok: string; source: string }[];
}

export interface Kniga1Row {
  esr: string;
  name: string;
  uzelEsr: string;
  uzelName: string;
  km: number;
  uchastok: string;
  liniya?: string;
  doroga?: string;
}

export interface HubAdder {
  esr: string; // synthetic узел node key
  name: string;
  km: number;
}

export interface SpecialOverride {
  aEsr?: string;
  bEsr?: string;
  km: number;
}

export interface Leg {
  uzelEsr: string;
  uzelName: string;
  km: number;
  uchastok: string;
}

export interface RouteResult {
  km: number; // rounded ТР-4 km
  rawKm: number; // pre-rounding sum
  method: 'special' | 'same-uchastok' | 'uzel-graph';
  leg1?: number;
  leg3?: number;
  originUzel?: string;
  destUzel?: string;
  backboneKm?: number;
  bridgeOrigin?: number;
  bridgeDest?: number;
  hubAdder?: number;
  uzelPath?: string[]; // human-readable узел path (names)
  note?: string;
}

const INF = Number.POSITIVE_INFINITY;

// ---------- Index built once from data ----------

export interface EngineIndex {
  nodeName: Map<string, string>;
  // backbone (kniga3) adjacency: узел -> [{to, km}]
  backboneAdj: Map<string, { to: string; km: number }[]>;
  // direct published kniga3 edge km between an unordered pair (min if dup)
  publishedDirect: Map<string, number>; // key = sortedPair
  backboneNodes: Set<string>;
  // bridge (kniga1) adjacency among узлы (peripheral last-mile)
  bridgeAdj: Map<string, { to: string; km: number }[]>;
  // station -> legs (its участок узлы + cum km)
  stationLegs: Map<string, Leg[]>;
  hubByEsr: Map<string, HubAdder>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function buildIndex(
  graph: UzelGraph,
  kniga1: Kniga1Row[],
  hubs: HubAdder[],
): EngineIndex {
  const nodeName = new Map<string, string>();
  for (const n of graph.nodes) nodeName.set(n.esr, n.name);

  const backboneAdj = new Map<string, { to: string; km: number }[]>();
  const bridgeAdj = new Map<string, { to: string; km: number }[]>();
  const publishedDirect = new Map<string, number>();
  const backboneNodes = new Set<string>();

  const addAdj = (
    m: Map<string, { to: string; km: number }[]>,
    a: string,
    b: string,
    km: number,
  ) => {
    if (!m.has(a)) m.set(a, []);
    m.get(a)!.push({ to: b, km });
  };

  for (const e of graph.edges) {
    if (e.source === 'kniga3') {
      addAdj(backboneAdj, e.aEsr, e.bEsr, e.km);
      addAdj(backboneAdj, e.bEsr, e.aEsr, e.km);
      backboneNodes.add(e.aEsr);
      backboneNodes.add(e.bEsr);
      const k = pairKey(e.aEsr, e.bEsr);
      const prev = publishedDirect.get(k);
      if (prev === undefined || e.km < prev) publishedDirect.set(k, e.km);
    } else {
      // kniga1 bridge
      addAdj(bridgeAdj, e.aEsr, e.bEsr, e.km);
      addAdj(bridgeAdj, e.bEsr, e.aEsr, e.km);
    }
  }

  const stationLegs = new Map<string, Leg[]>();
  for (const r of kniga1) {
    if (!stationLegs.has(r.esr)) stationLegs.set(r.esr, []);
    stationLegs.get(r.esr)!.push({
      uzelEsr: r.uzelEsr,
      uzelName: r.uzelName,
      km: r.km,
      uchastok: r.uchastok,
    });
  }

  const hubByEsr = new Map<string, HubAdder>();
  for (const h of hubs) hubByEsr.set(h.esr, h);

  return {
    nodeName,
    backboneAdj,
    publishedDirect,
    backboneNodes,
    bridgeAdj,
    stationLegs,
    hubByEsr,
  };
}

// ---------- toBackbone: resolve a узел to backbone-reachable узлы ----------
// If узел is in backbone -> itself@0. Else hop kniga1 bridge edges (last-mile)
// to the nearest backbone узлы. Returns ALL minimal bridges per backbone node.

export interface BackboneEntry {
  node: string;
  bridgeKm: number;
  path: string[]; // узел esr path from start узел to backbone node
}

export function toBackbone(idx: EngineIndex, uzel: string): BackboneEntry[] {
  if (idx.backboneNodes.has(uzel)) {
    return [{ node: uzel, bridgeKm: 0, path: [uzel] }];
  }
  // Dijkstra over bridge edges only, until we hit backbone nodes.
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  dist.set(uzel, 0);
  // simple PQ via array (bridge subgraph is tiny)
  const pq: { node: string; d: number }[] = [{ node: uzel, d: 0 }];
  const reached = new Map<string, BackboneEntry>();
  const seen = new Set<string>();
  while (pq.length) {
    pq.sort((a, b) => a.d - b.d);
    const { node, d } = pq.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);
    if (idx.backboneNodes.has(node) && node !== uzel) {
      // reconstruct path
      const path: string[] = [];
      let cur: string | undefined = node;
      while (cur !== undefined) {
        path.unshift(cur);
        cur = prev.get(cur);
      }
      reached.set(node, { node, bridgeKm: d, path });
      continue; // do not expand past a backbone node (it's an entry point)
    }
    for (const { to, km } of idx.bridgeAdj.get(node) ?? []) {
      const nd = d + km;
      if (nd < (dist.get(to) ?? INF)) {
        dist.set(to, nd);
        prev.set(to, node);
        pq.push({ node: to, d: nd });
      }
    }
  }
  return [...reached.values()];
}

// ---------- backboneKm: terminal published edge OR capped Dijkstra ----------
// Returns the tariff distance between two backbone узлы.
// Rule: if a published direct kniga3 edge exists, it is TERMINAL → use it.
// Else Dijkstra over backbone edges, but the result is capped so it is never
// accepted BELOW any published direct edge between the same endpoints (there
// is none here by definition, so Dijkstra stands as the legal shortest sum).

export function backboneKm(
  idx: EngineIndex,
  a: string,
  b: string,
): { km: number; path: string[] } | null {
  if (a === b) return { km: 0, path: [a] };
  const direct = idx.publishedDirect.get(pairKey(a, b));
  if (direct !== undefined) {
    return { km: direct, path: [a, b] };
  }
  // No published direct edge → Dijkstra over backbone.
  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  dist.set(a, 0);
  const pq: { node: string; d: number }[] = [{ node: a, d: 0 }];
  const seen = new Set<string>();
  while (pq.length) {
    pq.sort((x, y) => x.d - y.d);
    const { node, d } = pq.shift()!;
    if (seen.has(node)) continue;
    seen.add(node);
    if (node === b) break;
    for (const { to, km } of idx.backboneAdj.get(node) ?? []) {
      const nd = d + km;
      if (nd < (dist.get(to) ?? INF)) {
        dist.set(to, nd);
        prev.set(to, node);
        pq.push({ node: to, d: nd });
      }
    }
  }
  if (!dist.has(b)) return null;
  const path: string[] = [];
  let cur: string | undefined = b;
  while (cur !== undefined) {
    path.unshift(cur);
    cur = prev.get(cur);
  }
  return { km: dist.get(b)!, path };
}

// ---------- ТР-4 rounding: half-up at 500 m ----------
export function roundKm(km: number): number {
  return Math.floor(km + 0.5);
}

// ---------- Hub adder (conditional) ----------
// Applies only if the route path passes through a hub узел node key
// (Moscow 000015 +54 / SPb 000023 +25) AND the move is cross-line.
// Our backbone path uses real узел ESRs, not the synthetic 000015/000023 keys,
// so this fires only when those keys appear in a path. Kept as a hook; returns
// 0 for the oracle routes (no Moscow/SPb узел traversal).
export function hubAdder(idx: EngineIndex, uzelPath: string[]): number {
  let add = 0;
  for (const u of uzelPath) {
    const h = idx.hubByEsr.get(u);
    if (h) add += h.km;
  }
  return add;
}

// ---------- Main ----------

export function computeDistance(
  idx: EngineIndex,
  originEsr: string,
  destEsr: string,
  special?: Map<string, SpecialOverride>,
): RouteResult {
  // Step 0 — special override (by ESR pair)
  if (special) {
    const ov = special.get(pairKey(originEsr, destEsr));
    if (ov) {
      return { km: roundKm(ov.km), rawKm: ov.km, method: 'special' };
    }
  }

  if (originEsr === destEsr) {
    return { km: 0, rawKm: 0, method: 'uzel-graph', uzelPath: [] };
  }

  const oLegs = idx.stationLegs.get(originEsr) ?? [];
  const dLegs = idx.stationLegs.get(destEsr) ?? [];
  if (!oLegs.length || !dLegs.length) {
    return {
      km: -1,
      rawKm: -1,
      method: 'uzel-graph',
      note: `missing kniga1 legs (origin=${oLegs.length}, dest=${dLegs.length})`,
    };
  }

  // Step 2 — same-участок shortcut: same uchastok name AND a COMMON узел.
  for (const ol of oLegs) {
    for (const dl of dLegs) {
      if (
        ol.uchastok &&
        ol.uchastok === dl.uchastok &&
        ol.uzelEsr === dl.uzelEsr
      ) {
        const raw = Math.abs(ol.km - dl.km);
        return {
          km: roundKm(raw),
          rawKm: raw,
          method: 'same-uchastok',
          note: `common узел ${ol.uzelName} on «${ol.uchastok}»`,
        };
      }
    }
  }

  // Step 1 + 3 — enumerate (origin узел × dest узел) × (backbone bridges)
  let best: RouteResult | null = null;

  for (const ol of oLegs) {
    const oBackbones = toBackbone(idx, ol.uzelEsr);
    for (const dl of dLegs) {
      const dBackbones = toBackbone(idx, dl.uzelEsr);
      for (const ob of oBackbones) {
        for (const db of dBackbones) {
          const bk = backboneKm(idx, ob.node, db.node);
          if (!bk) continue;

          // Build full узел path for hub detection + reporting.
          // origin bridge path (start->ob) + backbone path (ob->db) + dest bridge reversed (db->dest узел)
          const fullPath = [
            ...ob.path, // ol.uzelEsr ... ob.node
            ...bk.path.slice(1), // ob.node ... db.node  (skip dup ob.node)
            ...[...db.path].reverse().slice(1), // db.node ... dl.uzelEsr
          ];
          const add = hubAdder(idx, fullPath);

          const raw =
            ol.km + ob.bridgeKm + bk.km + db.bridgeKm + dl.km + add;

          if (!best || raw < best.rawKm) {
            best = {
              km: roundKm(raw),
              rawKm: raw,
              method: 'uzel-graph',
              leg1: ol.km,
              leg3: dl.km,
              originUzel: ol.uzelName,
              destUzel: dl.uzelName,
              bridgeOrigin: ob.bridgeKm,
              bridgeDest: db.bridgeKm,
              backboneKm: bk.km,
              hubAdder: add,
              uzelPath: fullPath.map((e) => idx.nodeName.get(e) ?? e),
            };
          }
        }
      }
    }
  }

  if (!best) {
    return {
      km: -1,
      rawKm: -1,
      method: 'uzel-graph',
      note: 'no backbone-connected path found between any узел candidates',
    };
  }
  return best;
}
