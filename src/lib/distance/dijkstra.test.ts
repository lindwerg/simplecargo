import { describe, expect, it } from "vitest";

import { buildGraph, type EdgeRow } from "./graph";
import { shortestBackbonePath } from "./dijkstra";

/** Concise backbone-edge builder for fixtures (the pure core's only input). */
function bb(fromEsr: string, toEsr: string, km: number): EdgeRow {
  return { fromEsr, toEsr, km, layer: "backbone" };
}

/** Concise spur-edge builder — spurs must be IGNORED by the backbone path. */
function spur(fromEsr: string, toEsr: string, km: number): EdgeRow {
  return { fromEsr, toEsr, km, layer: "spur" };
}

describe("buildGraph", () => {
  it("mirrors each edge in both directions (backbone stored upper-triangular)", () => {
    const graph = buildGraph([bb("A", "B", 10)]);

    expect(graph.neighbors("A")).toEqual([{ esr: "B", km: 10, layer: "backbone" }]);
    expect(graph.neighbors("B")).toEqual([{ esr: "A", km: 10, layer: "backbone" }]);
    expect([...graph.nodes].sort()).toEqual(["A", "B"]);
  });

  it("skips self-loops and negative-km edges defensively", () => {
    const graph = buildGraph([bb("A", "A", 5), bb("A", "B", -1)]);

    expect(graph.neighbors("A")).toEqual([]);
    expect(graph.nodes.size).toBe(0);
  });

  it("returns an empty neighbor list for an unknown node", () => {
    const graph = buildGraph([bb("A", "B", 10)]);
    expect(graph.neighbors("Z")).toEqual([]);
  });
});

describe("shortestBackbonePath — chaining published edges", () => {
  it("returns a zero-km no-op path when origin === dest", () => {
    const graph = buildGraph([bb("A", "B", 10)]);
    expect(shortestBackbonePath(graph, "A", "A")).toEqual({ km: 0, path: ["A"] });
  });

  it("finds a direct single-edge path", () => {
    const graph = buildGraph([bb("A", "B", 42)]);
    expect(shortestBackbonePath(graph, "A", "B")).toEqual({ km: 42, path: ["A", "B"] });
  });

  it("chains multiple published edges into the shortest total", () => {
    // A-B-C = 30, direct A-C = 100 → must chain the published edges, total 30.
    const graph = buildGraph([bb("A", "B", 10), bb("B", "C", 20), bb("A", "C", 100)]);

    const result = shortestBackbonePath(graph, "A", "C");

    expect(result).toEqual({ km: 30, path: ["A", "B", "C"] });
  });

  it("prefers a cheaper longer chain over an expensive direct edge", () => {
    const graph = buildGraph([
      bb("A", "B", 5),
      bb("B", "D", 5),
      bb("A", "D", 50),
    ]);

    expect(shortestBackbonePath(graph, "A", "D")?.km).toBe(10);
  });
});

describe("shortestBackbonePath — backbone-only restriction (§3.1)", () => {
  it("NEVER traverses spur edges, even when a spur shortcut is cheaper", () => {
    // A-spur-C costs 1, but spurs are tariff-illegal for chaining. The only legal
    // route is the backbone A-B-C = 30. The cheap spur must be ignored.
    const graph = buildGraph([
      bb("A", "B", 10),
      bb("B", "C", 20),
      spur("A", "C", 1),
    ]);

    expect(shortestBackbonePath(graph, "A", "C")).toEqual({ km: 30, path: ["A", "B", "C"] });
  });

  it("returns null when the only connection between endpoints is a spur", () => {
    const graph = buildGraph([spur("A", "C", 1)]);
    expect(shortestBackbonePath(graph, "A", "C")).toBeNull();
  });
});

describe("shortestBackbonePath — graceful degradation (missing Книга 3)", () => {
  it("returns null over an empty backbone (no fabricated number)", () => {
    const graph = buildGraph([]);
    expect(shortestBackbonePath(graph, "A", "B")).toBeNull();
  });

  it("returns null when the destination is unreachable in a partial backbone", () => {
    // A-B connected; C-D is a disconnected island → A→D has no published chain.
    const graph = buildGraph([bb("A", "B", 10), bb("C", "D", 5)]);
    expect(shortestBackbonePath(graph, "A", "D")).toBeNull();
  });
});
