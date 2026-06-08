// Pure shortest-path over BACKBONE edges only (design doc §3.1, §5 dijkstra).
//
// CRITICAL CONTRACT (§3.1): Книга 3 is already a curated set of *shortest tariff
// distances* between transit points «без обходных и соединительных ветвей». We may
// only CHAIN published backbone edges; we must NEVER re-derive a shorter path over
// a denser graph (that would find mathematically shorter but tariff-illegal
// routes). This function therefore restricts traversal to `layer === 'backbone'`
// and otherwise just runs a standard Dijkstra over those published edges.
//
// Graceful degradation (§ degradation contract): if the backbone is empty/partial
// and no chain of published edges connects the endpoints, return `null` — the
// caller (computeDistance) turns that into a confidence='red' result with a
// warning, never a fabricated number.

import type { Graph, Neighbor } from "./graph";

/** Only published backbone edges are eligible for chaining. */
const BACKBONE_LAYER = "backbone" as const;

/** Successful shortest-path result over the backbone. */
export interface BackbonePath {
  /** Total km along the chained backbone edges. */
  readonly km: number;
  /** ESR sequence from origin to destination inclusive. */
  readonly path: readonly string[];
}

/** Reconstructs the ESR path from origin to dest using the predecessor map. */
function reconstructPath(
  prev: Map<string, string>,
  origin: string,
  dest: string,
): string[] {
  const path: string[] = [dest];
  let cursor = dest;
  while (cursor !== origin) {
    const before = prev.get(cursor);
    if (before === undefined) return path; // unreachable in practice; guard anyway
    path.unshift(before);
    cursor = before;
  }
  return path;
}

/** Pops the unvisited node with the smallest tentative distance (linear scan). */
function popClosest(
  dist: ReadonlyMap<string, number>,
  visited: ReadonlySet<string>,
): string | null {
  let best: string | null = null;
  let bestKm = Number.POSITIVE_INFINITY;
  for (const [node, km] of dist) {
    if (visited.has(node)) continue;
    if (km < bestKm) {
      bestKm = km;
      best = node;
    }
  }
  return best;
}

/**
 * Shortest backbone-only path between two transit-point ESRs.
 *
 * Returns a {@link BackbonePath} when a chain of published backbone edges
 * connects `origin` to `dest`, or `null` when no such chain exists (missing or
 * partial Книга 3). `origin === dest` is a zero-km no-op path. Spur edges are
 * ignored entirely — only `layer === 'backbone'` neighbors are relaxed.
 *
 * Implementation note: an O(V^2) linear-scan Dijkstra is intentional. The backbone
 * is ~1,199 nodes (§1), where a binary heap buys nothing and a flat array keeps the
 * code trivially correct and dependency-free.
 */
export function shortestBackbonePath(
  graph: Graph,
  origin: string,
  dest: string,
): BackbonePath | null {
  if (origin === dest) return { km: 0, path: [origin] };

  const dist = new Map<string, number>([[origin, 0]]);
  const prev = new Map<string, string>();
  const visited = new Set<string>();

  for (;;) {
    const current = popClosest(dist, visited);
    if (current === null) break; // no more reachable unvisited nodes

    if (current === dest) {
      return { km: dist.get(dest) ?? 0, path: reconstructPath(prev, origin, dest) };
    }

    visited.add(current);
    const currentKm = dist.get(current) ?? Number.POSITIVE_INFINITY;

    for (const neighbor of graph.neighbors(current)) {
      if (!isBackbone(neighbor)) continue;
      if (visited.has(neighbor.esr)) continue;

      const candidate = currentKm + neighbor.km;
      const known = dist.get(neighbor.esr);
      if (known === undefined || candidate < known) {
        dist.set(neighbor.esr, candidate);
        prev.set(neighbor.esr, current);
      }
    }
  }

  return null;
}

/** True only for published backbone edges — spur edges are never chained. */
function isBackbone(neighbor: Neighbor): boolean {
  return neighbor.layer === BACKBONE_LAYER;
}
