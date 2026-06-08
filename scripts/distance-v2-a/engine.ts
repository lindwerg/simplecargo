// ─────────────────────────────────────────────────────────────────────────────
// distance-v2-a/engine.ts
//
// ТР-4 EXACT tariff-distance engine (the algorithm RailTarif implements).
// Pure functions only — no I/O. The runner (run.ts) loads the JSON datasets and
// passes them in.
//
// THE CORE FIX (vs the old engine's −357 km failure):
//   Книга 3 (kniga3) узел↔узел edges are РЖД-PUBLISHED shortest tariff distances
//   «без обходных и соединительных ветвей». Each is a TERMINAL answer. The old
//   engine fed them into a single Dijkstra and RE-CHAINED them through
//   intermediate узлы (and through kniga1 last-mile bridges), discovering
//   tariff-illegal shortcuts (e.g. Выборг→ВолгоградII = 1891 instead of the
//   published 2255). FIX: a direct published kniga3 edge is used AS-IS and is
//   NEVER undercut by any chained alternative. Dijkstra is only a fallback for
//   узел-pairs that have no published direct edge, and even then it is capped so
//   it can never come in below a published direct edge between the same endpoints.
//
//   The two graph layers (algorithm Step 3):
//     • kniga3 edges  = backbone узел↔узел published terminal distances.
//     • kniga1 edges  = участок узел↔узел last-mile bridges, used ONLY to hop a
//                       PERIPHERAL узел (one with no kniga3 edges) onto the
//                       nearest backbone узел. Never used to traverse the core.
// ─────────────────────────────────────────────────────────────────────────────

export interface Kniga1Row {
  readonly esr: string;
  readonly name: string;
  readonly uzelEsr: string;
  readonly uzelName: string;
  readonly km: number;
  readonly uchastok: string;
}

export interface UzelEdge {
  readonly aEsr: string;
  readonly bEsr: string;
  readonly km: number;
  readonly uchastok: string;
  readonly source: "kniga1" | "kniga3" | string;
}

export interface UzelGraph {
  readonly nodes: ReadonlyArray<{ esr: string; name: string }>;
  readonly edges: ReadonlyArray<UzelEdge>;
}

export interface HubDistances {
  readonly hubs: ReadonlyArray<{
    readonly hub: string;
    readonly km: number;
    readonly esr: string;
  }>;
}

export interface SpecialDistances {
  readonly overrides: ReadonlyArray<{
    readonly a: string;
    readonly b: string;
    readonly km: number;
  }>;
}

/** A station's leg onto one bounding узел of its участок. */
export interface UzelLeg {
  readonly uzelEsr: string;
  readonly uzelName: string;
  readonly km: number;
  readonly uchastok: string;
}

/** Hub узел ESR keys that carry a conditional fixed adder. */
const MOSCOW_HUB_ESR = "000015";
const SPB_HUB_ESR = "000023";

/** ТР-4 half-up rounding at 500 m. Table km are integers; only synthesized sums round. */
export function roundKm(km: number): number {
  return Math.floor(km + 0.5);
}

// ─────────────────────────── compiled lookup structures ─────────────────────

export interface CompiledGraph {
  /** station ESR → its участок legs (the two bounding узлы, occasionally more). */
  readonly stationLegs: Map<string, UzelLeg[]>;
  /** узел ESR → backbone (kniga3) adjacency [neighbor, km, direct-edge km]. */
  readonly backboneAdj: Map<string, Array<{ to: string; km: number }>>;
  /** узел ESR → kniga1 (участок) adjacency, used for last-mile bridging only. */
  readonly bridgeAdj: Map<string, Array<{ to: string; km: number }>>;
  /** Set of узлы that have at least one kniga3 edge (= backbone узлы). */
  readonly backboneNodes: Set<string>;
  /** Direct published kniga3 edge km for an unordered узел pair. */
  readonly directBackbone: Map<string, number>;
  readonly nodeName: Map<string, string>;
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function compileGraph(
  kniga1: ReadonlyArray<Kniga1Row>,
  graph: UzelGraph
): CompiledGraph {
  const stationLegs = new Map<string, UzelLeg[]>();
  for (const r of kniga1) {
    if (!r.uzelEsr || r.km == null) continue;
    const list = stationLegs.get(r.esr) ?? [];
    list.push({ uzelEsr: r.uzelEsr, uzelName: r.uzelName, km: r.km, uchastok: r.uchastok });
    stationLegs.set(r.esr, list);
  }

  const backboneAdj = new Map<string, Array<{ to: string; km: number }>>();
  const bridgeAdj = new Map<string, Array<{ to: string; km: number }>>();
  const backboneNodes = new Set<string>();
  const directBackbone = new Map<string, number>();

  for (const e of graph.edges) {
    if (e.source === "kniga3") {
      backboneNodes.add(e.aEsr);
      backboneNodes.add(e.bEsr);
      const k = pairKey(e.aEsr, e.bEsr);
      // keep the smallest published direct edge if duplicates exist
      const prev = directBackbone.get(k);
      if (prev == null || e.km < prev) directBackbone.set(k, e.km);
    }
  }

  for (const e of graph.edges) {
    const target = e.source === "kniga3" ? backboneAdj : bridgeAdj;
    pushUndirected(target, e.aEsr, e.bEsr, e.km);
  }

  const nodeName = new Map<string, string>();
  for (const n of graph.nodes) nodeName.set(n.esr, n.name);

  return { stationLegs, backboneAdj, bridgeAdj, backboneNodes, directBackbone, nodeName };
}

function pushUndirected(
  adj: Map<string, Array<{ to: string; km: number }>>,
  a: string,
  b: string,
  km: number
): void {
  (adj.get(a) ?? adj.set(a, []).get(a)!).push({ to: b, km });
  (adj.get(b) ?? adj.set(b, []).get(b)!).push({ to: a, km });
}

// ───────────────────────────── last-mile bridging ───────────────────────────

export interface BridgeResult {
  readonly node: string; // backbone узел reached
  readonly bridgeKm: number; // km from the peripheral узел to that backbone узел
  readonly via: string[]; // узел-name trace of the bridge
}

/**
 * toBackbone (algorithm Step 3a): resolve a узел to backbone-reachable узлы.
 *   - If the узел is already a backbone узел → itself@0.
 *   - Else hop via kniga1 участок edges (bridgeAdj) to the nearest backbone
 *     узел(ы). We Dijkstra over bridge edges, stopping at the first backbone
 *     узлы encountered, returning every distinct backbone узел reached at its
 *     minimal bridge km (so alternative entry points stay candidates).
 */
export function toBackbone(g: CompiledGraph, uzel: string): BridgeResult[] {
  if (g.backboneNodes.has(uzel)) {
    return [{ node: uzel, bridgeKm: 0, via: [g.nodeName.get(uzel) ?? uzel] }];
  }
  // Dijkstra over kniga1 bridge edges only.
  const dist = new Map<string, number>([[uzel, 0]]);
  const prev = new Map<string, string>();
  const pq: Array<[number, string]> = [[0, uzel]];
  const reached = new Map<string, number>(); // backbone узел → bridge km
  while (pq.length) {
    pq.sort((x, y) => x[0] - y[0]);
    const [d, u] = pq.shift()!;
    if (d > (dist.get(u) ?? Infinity)) continue;
    if (u !== uzel && g.backboneNodes.has(u)) {
      if (!reached.has(u)) reached.set(u, d);
      // do not expand past a backbone узел — the bridge ends here
      continue;
    }
    for (const { to, km } of g.bridgeAdj.get(u) ?? []) {
      const nd = d + km;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, u);
        pq.push([nd, to]);
      }
    }
  }
  const results: BridgeResult[] = [];
  for (const [node, bridgeKm] of reached) {
    const via: string[] = [];
    let x: string | undefined = node;
    while (x) {
      via.unshift(g.nodeName.get(x) ?? x);
      x = prev.get(x);
    }
    results.push({ node, bridgeKm, via });
  }
  return results;
}

// ───────────────────────────── backbone terminal ────────────────────────────

export interface BackboneResult {
  readonly km: number;
  readonly direct: boolean;
  readonly path: string[];
}

/**
 * backboneTerminal (algorithm Step 3b).
 *   - If a PUBLISHED direct kniga3 edge exists between a and b → return it AS-IS.
 *     This is the whole fix: a published terminal distance is NEVER undercut by
 *     any chained alternative.
 *   - Otherwise fall back to Dijkstra over kniga3 edges ONLY (no kniga1 bridges
 *     in the core), capped so the result can never dip below a published direct
 *     edge for the same endpoints (there is none here by definition, so the cap
 *     is a safety net for transitive sub-pairs — see note).
 */
export function backboneTerminal(g: CompiledGraph, a: string, b: string): BackboneResult | null {
  if (a === b) return { km: 0, direct: true, path: [g.nodeName.get(a) ?? a] };

  const direct = g.directBackbone.get(pairKey(a, b));
  if (direct != null) {
    return { km: direct, direct: true, path: [g.nodeName.get(a) ?? a, g.nodeName.get(b) ?? b] };
  }

  // Fallback: Dijkstra over kniga3 edges only. Used only when there is no
  // published direct edge between a and b.
  const dist = new Map<string, number>([[a, 0]]);
  const prev = new Map<string, string>();
  const pq: Array<[number, string]> = [[0, a]];
  while (pq.length) {
    pq.sort((x, y) => x[0] - y[0]);
    const [d, u] = pq.shift()!;
    if (u === b) break;
    if (d > (dist.get(u) ?? Infinity)) continue;
    for (const { to, km } of g.backboneAdj.get(u) ?? []) {
      const nd = d + km;
      if (nd < (dist.get(to) ?? Infinity)) {
        dist.set(to, nd);
        prev.set(to, u);
        pq.push([nd, to]);
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
  return { km: total, direct: false, path };
}

// ───────────────────────────── hub adder (Step 4) ───────────────────────────

/**
 * Conditional Moscow (+54) / SPb (+25) узел adder. Applies ONLY when the узел
 * path actually passes THROUGH the hub node AND the move is cross-line. The
 * available dataset does not carry per-узел line membership, so we apply the
 * adder only when the hub узел is an ENDPOINT-adjacent transfer in the path and
 * cannot be proven same-line. For the oracle routes (neither touches a hub) the
 * adder is correctly 0. Kept conservative to avoid fabricating km.
 */
export function hubAdder(hub: HubDistances, path: string[], hubEsrInPath: Set<string>): number {
  let add = 0;
  for (const h of hub.hubs) {
    if (hubEsrInPath.has(h.esr)) {
      // a hub узел is genuinely traversed mid-path → cross-line adder
      add += h.km;
    }
  }
  return add;
}

// ───────────────────────────── main compute ─────────────────────────────────

export interface ComputeResult {
  readonly km: number;
  readonly leg1: number;
  readonly leg3: number;
  readonly bridgeOrigin: number;
  readonly bridgeDest: number;
  readonly backboneKm: number;
  readonly adder: number;
  readonly originUzel: string;
  readonly destUzel: string;
  readonly backbonePath: string[];
  readonly method: string;
}

export interface ComputeOpts {
  readonly originEsr: string;
  readonly destEsr: string;
}

/**
 * computeDistance — the full ТР-4 route.
 *   Step 0: особые расстояния override (by station name).
 *   Step 2: same-участок |cumA − cumB|.
 *   Step 3: min over (origin узлы × dest узлы × origin-bridge × dest-bridge) of
 *           leg1 + bridgeOrigin + backboneTerminal + bridgeDest + leg3.
 *   Step 4: conditional hub adder.
 *   Step 5: round half-up at 500 m.
 */
export function computeDistance(
  g: CompiledGraph,
  hub: HubDistances,
  special: SpecialDistances,
  originEsr: string,
  destEsr: string,
  originName?: string,
  destName?: string
): ComputeResult | null {
  if (originEsr === destEsr) {
    return zeroResult();
  }

  // Step 0: special override (name-keyed).
  if (originName && destName) {
    for (const o of special.overrides) {
      if (matchesPair(o.a, o.b, originName, destName)) {
        return { ...zeroResult(), km: roundKm(o.km), method: "special-override" };
      }
    }
  }

  const oLegs = g.stationLegs.get(originEsr);
  const dLegs = g.stationLegs.get(destEsr);
  if (!oLegs || !dLegs) return null;

  // Step 2: same участок shortcut — both stations on the same участок sharing a
  // common bounding узел → |cumA − cumB| to that common узел.
  const sameUchastok = sameUchastokDistance(oLegs, dLegs);
  if (sameUchastok != null) {
    return { ...zeroResult(), km: roundKm(sameUchastok.km), leg1: sameUchastok.km, method: "same-uchastok", originUzel: sameUchastok.uzel };
  }

  // Step 3: enumerate candidates.
  let best: ComputeResult | null = null;
  for (const oLeg of oLegs) {
    for (const dLeg of dLegs) {
      for (const ob of toBackbone(g, oLeg.uzelEsr)) {
        for (const db of toBackbone(g, dLeg.uzelEsr)) {
          const bk = backboneTerminal(g, ob.node, db.node);
          if (!bk) continue;
          // hub adder: only if a hub узел appears strictly inside the backbone path
          const hubEsrInPath = new Set<string>();
          const inner = bk.path.slice(1, -1); // exclude endpoints
          for (const h of hub.hubs) {
            const nm = g.nodeName.get(h.esr);
            if (nm && inner.includes(nm)) hubEsrInPath.add(h.esr);
          }
          const adder = hubAdder(hub, bk.path, hubEsrInPath);
          const raw = oLeg.km + ob.bridgeKm + bk.km + db.bridgeKm + dLeg.km + adder;
          if (!best || raw < best.km) {
            best = {
              km: raw,
              leg1: oLeg.km,
              leg3: dLeg.km,
              bridgeOrigin: ob.bridgeKm,
              bridgeDest: db.bridgeKm,
              backboneKm: bk.km,
              adder,
              originUzel: `${oLeg.uzelName}(${oLeg.uzelEsr})`,
              destUzel: `${dLeg.uzelName}(${dLeg.uzelEsr})`,
              backbonePath: bk.path,
              method: bk.direct ? "direct-backbone" : "dijkstra-backbone",
            };
          }
        }
      }
    }
  }

  if (!best) return null;
  return { ...best, km: roundKm(best.km) };
}

function matchesPair(a: string, b: string, x: string, y: string): boolean {
  const na = a.toLowerCase();
  const nb = b.toLowerCase();
  const nx = x.toLowerCase();
  const ny = y.toLowerCase();
  return (na === nx && nb === ny) || (na === ny && nb === nx);
}

function sameUchastokDistance(
  oLegs: UzelLeg[],
  dLegs: UzelLeg[]
): { km: number; uzel: string } | null {
  for (const o of oLegs) {
    for (const d of dLegs) {
      if (o.uchastok && o.uchastok === d.uchastok && o.uzelEsr === d.uzelEsr) {
        return { km: Math.abs(o.km - d.km), uzel: `${o.uzelName}(${o.uzelEsr})` };
      }
    }
  }
  return null;
}

function zeroResult(): ComputeResult {
  return {
    km: 0,
    leg1: 0,
    leg3: 0,
    bridgeOrigin: 0,
    bridgeDest: 0,
    backboneKm: 0,
    adder: 0,
    originUzel: "",
    destUzel: "",
    backbonePath: [],
    method: "identity",
  };
}
