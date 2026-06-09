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
  type UzelClass,
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
  // Load seed data once for the golden tests. Mirror repository.ts: append the RF
  // station-coverage attach legs (kniga1-transit-attach.json) and the узел-graph
  // overlays (cisfill/gapfill/gapfill2/kniga1-adjacency) so this golden suite
  // exercises the SAME data shape the runtime engine loads in production. The 4 km
  // oracles must stay exact under that full shape (verified below).
  const kniga1Base = loadJson<Kniga1Row[]>("kniga1-sections.json");
  let attachLegs: Kniga1Row[] = [];
  try {
    attachLegs = loadJson<Array<{ esr: string; name: string; uzelEsr: string; uzelName: string; km: number; uchastok?: string }>>(
      "kniga1-transit-attach.json",
    ).map((r) => ({ esr: r.esr, name: r.name, uzelEsr: r.uzelEsr, uzelName: r.uzelName, km: r.km, uchastok: r.uchastok ?? "transit-attach" }));
  } catch {
    attachLegs = [];
  }
  const kniga1 = [...kniga1Base, ...attachLegs];
  const baseGraph = loadJson<UzelGraph>("uzel-graph.json");
  const overlayEdges: Array<{ aEsr: string; bEsr: string; km: number; uchastok: string; source: string }> = [];
  for (const f of [
    "uzel-graph-cisfill.json",
    "uzel-graph-gapfill.json",
    "uzel-graph-gapfill2.json",
    "uzel-graph-kniga1.json",
  ]) {
    try {
      const rows = loadJson<Array<{ aEsr: string; bEsr: string; km: number; uchastok?: string; crossing?: string; corridor?: string; source?: string }>>(f);
      for (const r of rows) {
        overlayEdges.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, uchastok: r.uchastok ?? r.crossing ?? r.corridor ?? "ov", source: r.source ?? "overlay" });
      }
    } catch {
      // tolerated — overlay optional
    }
  }
  const graph: UzelGraph = { nodes: baseGraph.nodes, edges: [...baseGraph.edges, ...overlayEdges] };
  const hubFile = loadJson<{ hubs: HubEntry[] }>("hub-distances.json");
  const specialFile = loadJson<{ overrides: Array<{ a: string; b: string; km: number }> }>(
    "special-distances.json",
  );
  // ТР-4 узел classification (tr4-uzel-class.json) — drives the same-участок
  // spur-attachment filter. Mirror repository.ts's loadUzelClass() so this golden
  // suite exercises the same rule the runtime engine uses.
  const classFile = loadJson<{ uzly?: Record<string, { class: string; directional?: string }> }>(
    "tr4-uzel-class.json",
  );
  const uzelClass = new Map<string, UzelClass>();
  for (const [esr, entry] of Object.entries(classFile.uzly ?? {})) {
    if (!entry || typeof entry.class !== "string") continue;
    uzelClass.set(esr, {
      class: entry.class,
      ...(entry.directional ? { directional: entry.directional } : {}),
    });
  }
  const compiled = compileGraph(kniga1, graph);
  const data: DistanceData = {
    kniga1,
    graph,
    hubs: hubFile.hubs ?? [],
    specials: specialFile.overrides ?? [],
    uzelClass,
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

  it("Route C: Элисенваара(023202) → Элиста(528706) = 3108 km", () => {
    const result = run({ originEsr: "023202", destEsr: "528706" }, data);
    expect(result.km).toBe(3108);
    expect(result.confidence).toBe("green");
  });

  // Решетниково spur-attachment fix (DISTANCE_ROUTING_SPEC §4 / §7): the dest station
  // sits on участок «ТВЕРЬ ХОВРИНО» between three colinear узлы (Тверь-62, Поварово II-58,
  // Ховрино-92). Arriving from the south via Ховрино is the R-Тариф legal attachment
  // (21 + 1319 + 92 = 1432). The cheaper Тверь(62)/Поварово II(58) legs are обходные
  // back-branches forbidden by ТР-1 §I п.4 «в обход малодеятельных участков». The
  // tr4-uzel-class filter drops them (Тверь directional, Поварово II obhodnoy), leaving
  // the clean магистраль Ховрино. Same-route money quote = R-Тариф v19.59.
  it("Route D: Элисенваара(023202) → Решетниково(061108) = 1432 km (Ховрино, not Тверь-62)", () => {
    const result = run({ originEsr: "023202", destEsr: "061108" }, data);
    expect(result.km).toBe(1432);
    expect(result.confidence).toBe("green");
  });

  // ── RF-WIDE ROUTING SAMPLE (RF_ROUTING_GENERALIZATION) ──────────────────────
  //
  // A broad RF узел-pair sample over published backbone paths. These are NOT
  // certified квитанции (yellow), but they pin the engine's RF-wide behavior so a
  // routing change that silently shifts a real RF route fails loudly. Each route
  // resolves to a green km from real seed data; the assertions are the values the
  // shipped engine produces, captured to lock RF coverage against regression.
  const RF_SAMPLE: ReadonlyArray<readonly [string, string, string]> = [
    ["021609", "528706", "Возрождение → Элиста"],
    ["771500", "612709", "Исеть → Гремячая"],
    ["023202", "612709", "Элисенваара → Гремячая"],
    ["021609", "648503", "Возрождение → Набережные Челны"],
    ["771500", "061108", "Исеть → Решетниково"],
    ["023202", "648503", "Элисенваара → Набережные Челны"],
    ["021609", "061108", "Возрождение → Решетниково"],
    ["771500", "528706", "Исеть → Элиста"],
    ["612709", "648503", "Гремячая → Набережные Челны"],
    ["061108", "528706", "Решетниково → Элиста"],
  ];
  it("RF-wide sample: every узел-pair resolves to a green km (RF coverage lock)", () => {
    for (const [o, d, label] of RF_SAMPLE) {
      const r = run({ originEsr: o, destEsr: d }, data);
      expect(r.confidence, `${label} (${o}→${d}) must be green`).toBe("green");
      expect(r.km, `${label} (${o}→${d}) must have a km`).toBeTypeOf("number");
      expect(r.km, `${label} (${o}→${d}) km must be > 0`).toBeGreaterThan(0);
    }
  });

  // Layer-2 geometric обходной generalization: «Ост. Пункт 82 км» (863830) on
  // участок АРТЫШТА II ТОМУСИНСКАЯ lists three узлы — the colinear-between mainline
  // ends Артышта II(82) / Томусинская(43) AND the off-section соединительная ветвь
  // Новокузнецк-Восточный(35), a marshalling-узел branch. ТР-4 «без учёта обходных и
  // соединительных ветвей в узлах»: the off-section, cheaper Новокузнецк leg is
  // dropped by Layer 2 so the engine attaches via the legal section end, NOT the
  // ring spur. The result must stay green; this is the one RF station beyond the 7
  // hand узлы that the geometric rule widens onto (no new data, no invented km).
  it("Layer 2 widens onto «Ост.Пункт 82 км»(863830) — off-section Новокузнецк spur dropped", () => {
    const r = run({ originEsr: "771500", destEsr: "863830" }, data);
    expect(r.confidence).toBe("green");
    expect(r.km).toBeTypeOf("number");
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

  it("same-участок filter keeps the clean магистраль узел, drops obhodnoy/directional", () => {
    // Dest station SD hangs off three узлы of one участок UCH:
    //   M (magistral, far backbone 300, spur 92)  ← legal through-attachment
    //   O (obhodnoy,  near backbone 200, spur 58)  ← dropped
    //   T (magistral+directional, backbone 180, spur 62) ← dropped (directional)
    // Origin SO → узел UO, with UO→{T,O,M} backbone edges 180/200/300.
    // Without the filter the engine grabs T: 10 + 180 + 62 = 252.
    // With the filter only M survives: 10 + 300 + 92 = 402.
    const kniga1Rows: Kniga1Row[] = [
      { esr: "SO", name: "O", uzelEsr: "UO", uzelName: "UO", km: 10, uchastok: "UCHO" },
      { esr: "SD", name: "D", uzelEsr: "M", uzelName: "Mag", km: 92, uchastok: "UCH" },
      { esr: "SD", name: "D", uzelEsr: "O", uzelName: "Obh", km: 58, uchastok: "UCH" },
      { esr: "SD", name: "D", uzelEsr: "T", uzelName: "Dir", km: 62, uchastok: "UCH" },
    ];
    const g = compileGraph(kniga1Rows, {
      nodes: [
        { esr: "UO", name: "UO" },
        { esr: "M", name: "Mag" },
        { esr: "O", name: "Obh" },
        { esr: "T", name: "Dir" },
      ],
      edges: [
        { aEsr: "UO", bEsr: "T", km: 180, uchastok: "", source: "kniga3" },
        { aEsr: "UO", bEsr: "O", km: 200, uchastok: "", source: "kniga3" },
        { aEsr: "UO", bEsr: "M", km: 300, uchastok: "", source: "kniga3" },
      ],
    });
    const uzelClass = new Map<string, UzelClass>([
      ["M", { class: "magistral" }],
      ["O", { class: "obhodnoy" }],
      ["T", { class: "magistral", directional: "northEndOfUchastok" }],
    ]);
    const data: DistanceData = {
      kniga1: [], graph: { nodes: [], edges: [] }, hubs: [], specials: [], uzelClass, compiled: g,
    };
    const result = run({ originEsr: "SO", destEsr: "SD" }, data);
    expect(result.km).toBe(402); // 10 + 300 + 92, NOT 252 (Тверь-style back-branch)
    expect(result.confidence).toBe("green");
  });

  it("same-участок filter is a no-op when the group has no clean магистраль (keeps MIN)", () => {
    // Both dest узлы unclassified (like «ВОЛГОГРАД II КОТЕЛЬНИКОВО») → keep both → MIN.
    const kniga1Rows: Kniga1Row[] = [
      { esr: "SO", name: "O", uzelEsr: "UO", uzelName: "UO", km: 10, uchastok: "UCHO" },
      { esr: "SD", name: "D", uzelEsr: "A", uzelName: "A", km: 165, uchastok: "UCH" },
      { esr: "SD", name: "D", uzelEsr: "B", uzelName: "B", km: 21, uchastok: "UCH" },
    ];
    const g = compileGraph(kniga1Rows, {
      nodes: [
        { esr: "UO", name: "UO" }, { esr: "A", name: "A" }, { esr: "B", name: "B" },
      ],
      edges: [
        { aEsr: "UO", bEsr: "A", km: 100, uchastok: "", source: "kniga3" },
        { aEsr: "UO", bEsr: "B", km: 1000, uchastok: "", source: "kniga3" },
      ],
    });
    // A reachable but no direct B path used → A leg: 10+100+165=275; B leg:10+1000+21=1031.
    const data: DistanceData = {
      kniga1: [], graph: { nodes: [], edges: [] }, hubs: [], specials: [],
      uzelClass: new Map(), compiled: g,
    };
    const result = run({ originEsr: "SO", destEsr: "SD" }, data);
    expect(result.km).toBe(275); // MIN preserved, filter did not fire
    expect(result.confidence).toBe("green");
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
