// In-memory adjacency structure over tariff edges (design doc §5 graph). Pure —
// takes edge rows as ARGUMENTS so it builds/unit-tests with no DB or network.
//
// Edges come from two layers (§4.1 `tariff_edges`):
//   • 'spur'     — radial station→ТП edges reconstructed from CSV field[4]
//   • 'backbone' — published Книга-3 ТП↔ТП distances (MUST be sourced verbatim)
//
// The backbone layer is symmetric and stored upper-triangular (from_esr < to_esr)
// per §4.1. The graph mirrors every edge in BOTH directions so Dijkstra can chain
// published edges from either endpoint. We NEVER invent an edge: only the rows
// handed in become adjacency.

/** A single graph edge row, mirroring `tariff_edges` (§4.1). */
export interface EdgeRow {
  readonly fromEsr: string;
  readonly toEsr: string;
  readonly km: number;
  readonly layer: "spur" | "backbone";
}

/** One outbound neighbor in the adjacency list. */
export interface Neighbor {
  readonly esr: string;
  readonly km: number;
  readonly layer: "spur" | "backbone";
}

/**
 * Immutable adjacency view. `neighbors(esr)` is the only read surface Dijkstra
 * needs; `nodes` exposes the full vertex set for diagnostics/iteration.
 */
export interface Graph {
  /** Outbound neighbors of `esr` (empty array if the node is unknown). */
  neighbors(esr: string): readonly Neighbor[];
  /** Every ESR that appears as an endpoint of at least one edge. */
  readonly nodes: ReadonlySet<string>;
}

/** Adds a directed neighbor entry, creating the bucket on first use. */
function addNeighbor(
  adjacency: Map<string, Neighbor[]>,
  from: string,
  to: string,
  km: number,
  layer: "spur" | "backbone",
): void {
  const bucket = adjacency.get(from);
  const next: Neighbor = { esr: to, km, layer };
  if (bucket) {
    bucket.push(next);
    return;
  }
  adjacency.set(from, [next]);
}

/**
 * Build an immutable {@link Graph} from edge rows. Every edge is inserted in both
 * directions (the underlying tables store backbone upper-triangular, so the graph
 * is responsible for symmetry). Rows with a negative km are skipped defensively
 * rather than corrupting shortest-path math. Self-loops (from === to) are dropped.
 *
 * If the same ordered pair appears more than once on the same layer, both entries
 * are kept; Dijkstra naturally relaxes to the cheaper one, so de-duplication is
 * not required for correctness.
 */
export function buildGraph(edges: readonly EdgeRow[]): Graph {
  const adjacency = new Map<string, Neighbor[]>();
  const nodes = new Set<string>();

  for (const edge of edges) {
    if (edge.km < 0) continue;
    if (edge.fromEsr === edge.toEsr) continue;

    nodes.add(edge.fromEsr);
    nodes.add(edge.toEsr);

    addNeighbor(adjacency, edge.fromEsr, edge.toEsr, edge.km, edge.layer);
    addNeighbor(adjacency, edge.toEsr, edge.fromEsr, edge.km, edge.layer);
  }

  return {
    nodes,
    neighbors(esr: string): readonly Neighbor[] {
      return adjacency.get(esr) ?? [];
    },
  };
}
