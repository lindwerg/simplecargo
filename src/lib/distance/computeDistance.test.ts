// ─────────────────────────────────────────────────────────────────────────────
// computeDistance.test.ts — ТР-4 узел-graph engine unit tests.
//
// GOLDEN ORACLE ASSERTIONS (real квитанции, exact km):
//   Route A: Возрождение(021609) → Гремячая(612709) = 2444 km
//   Route B: Исеть(771500) → Набережные Челны(648503) = 699 km
//
// All other tests use synthetic fixtures injected via DistanceData so this
// file needs no DB, no network, and no seed-data files.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  computeDistance,
  compileGraph,
  type CompiledGraph,
  type DistanceData,
  type Kniga1Row,
  type UzelGraph,
  type HubEntry,
} from "./computeDistance";
import type { DistanceInput } from "./schema";

// ── Helpers ───────────────────────────────────────────────────────────────────

function run(
  input: Partial<DistanceInput> & { originEsr: string; destEsr: string },
  data: DistanceData,
) {
  return computeDistance({ emptyRun: false, ...input }, data);
}

/** Build minimal DistanceData from a compiled graph + optional overrides. */
function makeData(
  compiled: CompiledGraph,
  opts: { hubs?: HubEntry[]; specials?: Array<{ a: string; b: string; km: number }> } = {},
): DistanceData {
  return {
    kniga1: [],
    graph: { nodes: [], edges: [] },
    hubs: opts.hubs ?? [],
    specials: opts.specials ?? [],
    compiled,
  };
}

// ── GOLDEN ORACLE TESTS (real квитанции) ──────────────────────────────────────

const SEED = resolve(process.cwd(), "scripts/seed-data");

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED, name), "utf8")) as T;
}

describe("computeDistance — GOLDEN ORACLE (real квитанции)", () => {
  // Load seed data once for the golden tests.
  const kniga1 = loadJson<Kniga1Row[]>("kniga1-sections.json");
  const graph = loadJson<UzelGraph>("uzel-graph.json");
  const hubFile = loadJson<{ hubs: HubEntry[] }>("hub-distances.json");
  const specialFile = loadJson<{ overrides: Array<{ a: string; b: string; km: number }> }>(
    "special-distances.json",
  );
  const compiled = compileGraph(kniga1, graph);
  const data: DistanceData = {
    kniga1,
    graph,
    hubs: hubFile.hubs ?? [],
    specials: specialFile.overrides ?? [],
    compiled,
  };

  it("Route A: Возрождение(021609) → Гремячая(612709) = 2444 km", () => {
    const result = run({ originEsr: "021609", destEsr: "612709" }, data);
    expect(result.km).toBe(2444);
    expect(result.confidence).toBe("green");
  });

  it("Route B: Исеть(771500) → Набережные Челны(648503) = 699 km", () => {
    const result = run({ originEsr: "771500", destEsr: "648503" }, data);
    expect(result.km).toBe(699);
    expect(result.confidence).toBe("green");
  });
});

// ── UNIT TESTS (synthetic fixtures — no I/O) ──────────────────────────────────

describe("computeDistance — unit (synthetic fixtures)", () => {
  // A minimal 2-node backbone graph.
  function twoNodeGraph(): CompiledGraph {
    const kniga1Rows: Kniga1Row[] = [
      { esr: "S1", name: "StationA", uzelEsr: "U1", uzelName: "UzelA", km: 10, uchastok: "UCH1" },
      { esr: "S2", name: "StationB", uzelEsr: "U2", uzelName: "UzelB", km: 5, uchastok: "UCH2" },
    ];
    const uzelGraph: UzelGraph = {
      nodes: [
        { esr: "U1", name: "UzelA" },
        { esr: "U2", name: "UzelB" },
      ],
      edges: [{ aEsr: "U1", bEsr: "U2", km: 100, uchastok: "", source: "kniga3" }],
    };
    return compileGraph(kniga1Rows, uzelGraph);
  }

  it("same station returns 0 km", () => {
    const g = twoNodeGraph();
    const result = run({ originEsr: "S1", destEsr: "S1" }, makeData(g));
    expect(result.km).toBe(0);
    expect(result.confidence).toBe("green");
  });

  it("computes leg1 + backbone + leg3", () => {
    // S1 → U1(10) + backbone(100) + U2(5) → S2 = 115
    const g = twoNodeGraph();
    const result = run({ originEsr: "S1", destEsr: "S2" }, makeData(g));
    expect(result.km).toBe(115);
    expect(result.confidence).toBe("green");
  });

  it("same-участок shortcut uses |cumA − cumB|", () => {
    // Both stations on участок UCH1 sharing узел U1 with cum 10 and 30 → |10-30|=20.
    const kniga1Rows: Kniga1Row[] = [
      { esr: "SA", name: "A", uzelEsr: "U1", uzelName: "UzelA", km: 10, uchastok: "UCH1" },
      { esr: "SB", name: "B", uzelEsr: "U1", uzelName: "UzelA", km: 30, uchastok: "UCH1" },
    ];
    const g = compileGraph(kniga1Rows, { nodes: [], edges: [] });
    const result = run({ originEsr: "SA", destEsr: "SB" }, makeData(g));
    expect(result.km).toBe(20);
    expect(result.confidence).toBe("green");
  });

  it("adjacent участки joined at a shared узел sum the two legs (M3)", () => {
    // SA on UCH1 (cum 12) and SB on UCH2 (cum 8), both bounded by узел U1 — the
    // sections meet AT the узел, so the path is SA→U1→SB = 12 + 8 = 20. No backbone
    // edge exists (узел graph empty), so this MUST be resolved by the shared-узел
    // shortcut, not fall through to red.
    const kniga1Rows: Kniga1Row[] = [
      { esr: "SA", name: "A", uzelEsr: "U1", uzelName: "UzelA", km: 12, uchastok: "UCH1" },
      { esr: "SB", name: "B", uzelEsr: "U1", uzelName: "UzelA", km: 8, uchastok: "UCH2" },
    ];
    const g = compileGraph(kniga1Rows, { nodes: [], edges: [] });
    const result = run({ originEsr: "SA", destEsr: "SB" }, makeData(g));
    expect(result.km).toBe(20);
    expect(result.confidence).toBe("green");
  });

  it("takes MIN over multiple shared-узел anchors, not the first match (M4)", () => {
    // SA has two legs: узел U1 (cum 50) and узел U2 (cum 5, same участок UCHX).
    // SB has two legs: узел U1 (cum 60) and узел U2 (cum 9, same участок UCHX).
    // Via U1 (adjacent, different uchastok): 50 + 60 = 110.
    // Via U2 (same участок UCHX): |5 - 9| = 4.  MIN = 4 (the SECOND anchor pair).
    // A first-match implementation would wrongly return the U1 candidate (110).
    const kniga1Rows: Kniga1Row[] = [
      { esr: "SA", name: "A", uzelEsr: "U1", uzelName: "N1", km: 50, uchastok: "UCH1" },
      { esr: "SA", name: "A", uzelEsr: "U2", uzelName: "N2", km: 5, uchastok: "UCHX" },
      { esr: "SB", name: "B", uzelEsr: "U1", uzelName: "N1", km: 60, uchastok: "UCH2" },
      { esr: "SB", name: "B", uzelEsr: "U2", uzelName: "N2", km: 9, uchastok: "UCHX" },
    ];
    const g = compileGraph(kniga1Rows, { nodes: [], edges: [] });
    const result = run({ originEsr: "SA", destEsr: "SB" }, makeData(g));
    expect(result.km).toBe(4);
    expect(result.confidence).toBe("green");
  });

  it("returns confidence='red' when no backbone path connects узлы", () => {
    // SA→U1 and SB→U2 exist, and U1/U2 are backbone nodes (connected to U3 respectively),
    // but there is NO path from U1 to U2 through the backbone.
    const kniga1Rows: Kniga1Row[] = [
      { esr: "SA", name: "A", uzelEsr: "U1", uzelName: "UzelA", km: 5, uchastok: "UCH1" },
      { esr: "SB", name: "B", uzelEsr: "U2", uzelName: "UzelB", km: 5, uchastok: "UCH2" },
    ];
    // U1 and U2 are each given a kniga3 self-loop partner (U3/U4) but are NOT connected to each other.
    const g = compileGraph(kniga1Rows, {
      nodes: [
        { esr: "U1", name: "UzelA" },
        { esr: "U2", name: "UzelB" },
        { esr: "U3", name: "Island1" },
        { esr: "U4", name: "Island2" },
      ],
      edges: [
        // Two disconnected backbone islands: U1↔U3 and U2↔U4.
        { aEsr: "U1", bEsr: "U3", km: 10, uchastok: "", source: "kniga3" },
        { aEsr: "U2", bEsr: "U4", km: 10, uchastok: "", source: "kniga3" },
      ],
    });
    const result = run({ originEsr: "SA", destEsr: "SB" }, makeData(g));
    expect(result.km).toBeNull();
    expect(result.confidence).toBe("red");
    expect(result.warnings[0]).toMatch(/backbone edge missing/i);
  });

  it("returns red when origin station has no kniga1 leg", () => {
    const kniga1Rows: Kniga1Row[] = [
      { esr: "SB", name: "B", uzelEsr: "U2", uzelName: "UzelB", km: 5, uchastok: "UCH2" },
    ];
    const g = compileGraph(kniga1Rows, { nodes: [], edges: [] });
    const result = run({ originEsr: "SA_MISSING", destEsr: "SB" }, makeData(g));
    expect(result.km).toBeNull();
    expect(result.confidence).toBe("red");
    expect(result.warnings[0]).toMatch(/no kniga1 leg for origin/i);
  });

  it("special override (by ESR) wins over computed sum", () => {
    const g = twoNodeGraph();
    const data = makeData(g, { specials: [{ a: "S1", b: "S2", km: 42 }] });
    const result = run({ originEsr: "S1", destEsr: "S2" }, data);
    expect(result.km).toBe(42);
    expect(result.legs[0].kind).toBe("special");
    expect(result.confidence).toBe("green");
  });

  it("special override matches regardless of pair orientation", () => {
    const g = twoNodeGraph();
    const data = makeData(g, { specials: [{ a: "S2", b: "S1", km: 17 }] });
    const result = run({ originEsr: "S1", destEsr: "S2" }, data);
    expect(result.km).toBe(17);
  });

  it("chains two backbone edges when no direct edge exists", () => {
    // S1→U1(10) + U1→U2(50) + U2→U3(50) + U3→S2(5) = 115
    const kniga1Rows: Kniga1Row[] = [
      { esr: "S1", name: "A", uzelEsr: "U1", uzelName: "N1", km: 10, uchastok: "UCH1" },
      { esr: "S2", name: "B", uzelEsr: "U3", uzelName: "N3", km: 5, uchastok: "UCH3" },
    ];
    const g = compileGraph(kniga1Rows, {
      nodes: [
        { esr: "U1", name: "N1" },
        { esr: "U2", name: "N2" },
        { esr: "U3", name: "N3" },
      ],
      edges: [
        { aEsr: "U1", bEsr: "U2", km: 50, uchastok: "", source: "kniga3" },
        { aEsr: "U2", bEsr: "U3", km: 50, uchastok: "", source: "kniga3" },
      ],
    });
    const result = run({ originEsr: "S1", destEsr: "S2" }, makeData(g));
    expect(result.km).toBe(115);
  });

  it("rounds synthesized fractional km half-up at 500 m", () => {
    // Both stations on same участок sharing узел U1 with cum 10.3 and 10.8 → |10.3-10.8|=0.5 → rounds to 1
    const kniga1Rows: Kniga1Row[] = [
      { esr: "SA", name: "A", uzelEsr: "U1", uzelName: "N1", km: 10.3, uchastok: "UCH1" },
      { esr: "SB", name: "B", uzelEsr: "U1", uzelName: "N1", km: 10.8, uchastok: "UCH1" },
    ];
    const g = compileGraph(kniga1Rows, { nodes: [], edges: [] });
    const result = run({ originEsr: "SA", destEsr: "SB" }, makeData(g));
    expect(result.km).toBe(1); // 0.5 rounds up to 1
  });

  it("hub adder is applied when hub узел is mid-path", () => {
    // S1→U1(10) + backbone U1→HUB(40)→U3(60) + U3→S2(5) = 115 + 54 hub adder = 169
    const kniga1Rows: Kniga1Row[] = [
      { esr: "S1", name: "A", uzelEsr: "U1", uzelName: "N1", km: 10, uchastok: "UCH1" },
      { esr: "S2", name: "B", uzelEsr: "U3", uzelName: "N3", km: 5, uchastok: "UCH3" },
    ];
    const g = compileGraph(kniga1Rows, {
      nodes: [
        { esr: "U1", name: "N1" },
        { esr: "HUB", name: "MoscowHub" },
        { esr: "U3", name: "N3" },
      ],
      edges: [
        { aEsr: "U1", bEsr: "HUB", km: 40, uchastok: "", source: "kniga3" },
        { aEsr: "HUB", bEsr: "U3", km: 60, uchastok: "", source: "kniga3" },
      ],
    });
    const hubs: HubEntry[] = [{ hub: "MoscowHub", km: 54, esr: "HUB" }];
    const result = run({ originEsr: "S1", destEsr: "S2" }, makeData(g, { hubs }));
    expect(result.km).toBe(169); // 10 + 40 + 60 + 5 + 54
    expect(result.legs.some((l) => l.kind === "hub-adder")).toBe(true);
  });
});
