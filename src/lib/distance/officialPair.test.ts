// Tests for L3 of the layered distance-resolution policy
// (docs/planning/DISTANCE_FINAL_ARCHITECTURE.md): officialPair.ts direct lookup
// + its wiring into repository.ts::resolveDistance.
//
// Two halves:
//   1. UNIT — synthetic pair index + tiny compiled graph: direct verbatim match,
//      spur-adjusted match, NO transitive chaining (the forbidden Dijkstra/§2
//      scenario), no-match → null.
//   2. INTEGRATION (real seed data via resolveDistance) — the spec §2 invariant
//      test: every km oracle goes THROUGH resolveDistance and stays EXACT green
//      (L3 must not touch them); a real L2-red route becomes yellow with the
//      pre-№313 warning; unknown stations stay red; kill-switch works.
import { afterEach, describe, expect, it } from "vitest";

import { compileGraph, type DistanceData, type Kniga1Row, type UzelGraph } from "./computeDistance";
import {
  buildOfficialPairIndex,
  officialPairLookup,
  OFFICIAL_PAIR_WARNING,
  type OfficialPairRow,
} from "./officialPair";
import { resolveDistance } from "./repository";

// ── 1. UNIT: synthetic index + minimal compiled data ──────────────────────────

// Station 111111 hangs off ТП 222222 by a published 10-km spur; station 555555
// hangs off ТП 444444 by a published 7-km spur. The official index publishes
// (222222,333333)=100 and (333333,444444)=50 — and deliberately NOT
// (222222,444444), so any number for 222222→444444 could only come from
// forbidden chaining.
const KNIGA1: Kniga1Row[] = [
  { esr: "111111", name: "СтанцияА", uzelEsr: "222222", uzelName: "ТПА", km: 10, uchastok: "у1" },
  { esr: "555555", name: "СтанцияБ", uzelEsr: "444444", uzelName: "ТПБ", km: 7, uchastok: "у2" },
];
const EMPTY_GRAPH: UzelGraph = { nodes: [], edges: [] };

function makeData(): DistanceData {
  const compiled = compileGraph(KNIGA1, EMPTY_GRAPH);
  return { kniga1: KNIGA1, graph: EMPTY_GRAPH, hubs: [], specials: [], compiled };
}

const ROWS: OfficialPairRow[] = [
  { aEsr: "222222", bEsr: "333333", km: 100 },
  { aEsr: "333333", bEsr: "444444", km: 50 },
];

const inp = (originEsr: string, destEsr: string) => ({ originEsr, destEsr, emptyRun: false });

describe("officialPair (unit, synthetic index)", () => {
  const index = buildOfficialPairIndex(ROWS);
  const data = makeData();

  it("buildOfficialPairIndex: undirected keys, junk rows skipped, dup keeps smaller verbatim km", () => {
    const idx = buildOfficialPairIndex([
      ...ROWS,
      { aEsr: "333333", bEsr: "222222", km: 120 }, // reversed dup, larger → ignored
      { aEsr: "777777" }, // junk → skipped
    ]);
    expect(idx.size).toBe(2);
    expect(idx.get("222222|333333")).toBe(100);
  });

  it("direct verbatim pair → yellow km with the pre-№313 warning", () => {
    const r = officialPairLookup(inp("222222", "333333"), data, index);
    expect(r).not.toBeNull();
    expect(r?.km).toBe(100);
    expect(r?.confidence).toBe("yellow");
    expect(r?.warnings).toContain(OFFICIAL_PAIR_WARNING);
    expect(r?.legs).toEqual([{ kind: "direct", fromEsr: "222222", toEsr: "333333", km: 100 }]);
  });

  it("station-leg-adjusted pair → spurO + verbatim pair (+ spurD), yellow", () => {
    // 111111 →(spur 10)→ 222222 →(published 100)→ 333333
    const r = officialPairLookup(inp("111111", "333333"), data, index);
    expect(r?.km).toBe(110);
    expect(r?.confidence).toBe("yellow");
    expect(r?.legs).toEqual([
      { kind: "spur-origin", fromEsr: "111111", toEsr: "222222", km: 10 },
      { kind: "direct", fromEsr: "222222", toEsr: "333333", km: 100 },
    ]);
    // both ends adjusted: 555555 →(7)→ 444444 →(50)→ 333333
    const r2 = officialPairLookup(inp("333333", "555555"), data, index);
    expect(r2?.km).toBe(57);
    expect(r2?.legs).toEqual([
      { kind: "direct", fromEsr: "333333", toEsr: "444444", km: 50 },
      { kind: "spur-dest", fromEsr: "444444", toEsr: "555555", km: 7 },
    ]);
  });

  it("NEVER chains pairs: 222222→444444 has a 2-hop chain (100+50) but NO published pair → null", () => {
    // The forbidden scenario: both (222222,333333) and (333333,444444) exist,
    // but (222222,444444) is not published verbatim — L3 must pass, not invent 150.
    expect(officialPairLookup(inp("222222", "444444"), data, index)).toBeNull();
    // Same via spurs only: 111111→555555 would need the same forbidden chain.
    expect(officialPairLookup(inp("111111", "555555"), data, index)).toBeNull();
  });

  it("no verbatim match anywhere → null (caller keeps the L4 red)", () => {
    expect(officialPairLookup(inp("111111", "999999"), data, index)).toBeNull();
    expect(officialPairLookup(inp("888888", "999999"), data, index)).toBeNull();
  });

  it("empty index → null (missing file degrades to a no-op)", () => {
    expect(officialPairLookup(inp("222222", "333333"), data, buildOfficialPairIndex([]))).toBeNull();
  });
});

// ── 2. INTEGRATION: real seed data through resolveDistance ────────────────────

describe("resolveDistance layered policy (real seed data)", () => {
  afterEach(() => {
    delete process.env.DISTANCE_OFFICIAL_PAIR_FALLBACK;
  });

  // Spec §2 invariant: ALL km oracles pass THROUGH resolveDistance (not only
  // computeDistance) and stay EXACT green — L3 fires only on red and by
  // construction cannot move any of them.
  it("INVARIANT: km oracles stay EXACT green through resolveDistance (L3 untouched)", async () => {
    const oracles: ReadonlyArray<readonly [string, string, number]> = [
      ["021609", "612709", 2444], // Возрождение → Гремячая (квитанция)
      ["771500", "648503", 699], // квитанция
      ["023202", "528706", 3108], // Элисенваара → Элиста (квитанция)
      ["023202", "061108", 1432], // Элисенваара → Решетниково (квитанция)
      ["022207", "050009", 801], // Красный Сокол → Бологое-Московское (L1 ЯКОРЬ, оплата до копейки)
    ];
    for (const [originEsr, destEsr, km] of oracles) {
      const r = await resolveDistance({ originEsr, destEsr, emptyRun: false });
      expect(r.km, `${originEsr}→${destEsr}`).toBe(km);
      expect(r.confidence, `${originEsr}→${destEsr}`).toBe("green");
      expect(r.warnings).not.toContain(OFFICIAL_PAIR_WARNING);
    }
  });

  it("Бологое anchor 022207→050009 = 801 GREEN (L1, official base publishes pre-№313 499 — never used)", async () => {
    const r = await resolveDistance({ originEsr: "022207", destEsr: "050009", emptyRun: false });
    expect(r.km).toBe(801);
    expect(r.confidence).toBe("green");
    expect(r.legs[0]?.kind).toBe("special");
  });

  it("АЯМ + Crimea coverage stays green through the layered resolver", async () => {
    const aym = await resolveDistance({ originEsr: "913403", destEsr: "910000", emptyRun: false });
    expect(aym.km).toBeGreaterThan(0);
    expect(aym.confidence).toBe("green");
    const crimea = await resolveDistance({ originEsr: "856200", destEsr: "856107", emptyRun: false });
    expect(crimea.km).toBeGreaterThan(0);
    expect(crimea.confidence).toBe("green");
  });

  // 688708 is an official ТП with NO Книга-1 leg in our base → L2 is red for
  // every route touching it. The official base publishes 263001↔688708 = 2124
  // verbatim → L3 direct lookup turns it yellow with the mandatory warning.
  it("L2 red → L3 yellow: 263001→688708 = 2124 (verbatim official pair) + pre-№313 warning", async () => {
    const r = await resolveDistance({ originEsr: "263001", destEsr: "688708", emptyRun: false });
    expect(r.km).toBe(2124);
    expect(r.confidence).toBe("yellow");
    expect(r.warnings).toContain(OFFICIAL_PAIR_WARNING);
    expect(r.legs).toEqual([{ kind: "direct", fromEsr: "263001", toEsr: "688708", km: 2124 }]);
  });

  // Station-leg-adjusted real case: Советская Гавань-Сорт.(968209) is NOT an
  // official point itself; its published spur 968209→Мыс Марии? no — 967600 (8 km)
  // matches the published pair 967600↔688708 = 6358 → 8 + 6358 = 6366.
  it("L2 red → L3 yellow (spur-adjusted): 968209→688708 = 6366 (spur 8 + verbatim pair 6358)", async () => {
    const r = await resolveDistance({ originEsr: "968209", destEsr: "688708", emptyRun: false });
    expect(r.km).toBe(6366);
    expect(r.confidence).toBe("yellow");
    expect(r.warnings).toContain(OFFICIAL_PAIR_WARNING);
    expect(r.legs).toEqual([
      { kind: "spur-origin", fromEsr: "968209", toEsr: "967600", km: 8 },
      { kind: "direct", fromEsr: "967600", toEsr: "688708", km: 6358 },
    ]);
  });

  it("no verbatim pair anywhere → stays RED (no number is ever invented)", async () => {
    const r = await resolveDistance({ originEsr: "999998", destEsr: "999997", emptyRun: false });
    expect(r.km).toBeNull();
    expect(r.confidence).toBe("red");
  });

  it("kill-switch DISTANCE_OFFICIAL_PAIR_FALLBACK=0 disables L3 (red again)", async () => {
    process.env.DISTANCE_OFFICIAL_PAIR_FALLBACK = "0";
    const r = await resolveDistance({ originEsr: "263001", destEsr: "688708", emptyRun: false });
    expect(r.km).toBeNull();
    expect(r.confidence).toBe("red");
  });
});
