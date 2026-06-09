import { describe, expect, it } from "vitest";

import {
  resolveContainerReduction,
  resolveDirectionalK3,
  type ContainerReductionRow,
  type DirectionalK3Row,
} from "./schemeResolve";

// ── Табл.N3 directional coefficient (resolveDirectionalK3) ──────────────────────
// The engine has no route→direction classifier yet, so EVERY ordinary inter-RF haul
// must resolve to ×1.0 (applies:false) — this is the property that keeps all golden
// oracles byte-identical. Only an explicitly-flagged direction may move the multiplier.

const SECTION1_ROWS: readonly DirectionalK3Row[] = [
  { section: "section1_kaliningrad_to_network", coefficient: 0.27, distFromKm: 0, distToKm: 400, tariffClass: 1, confidence: "green" },
  { section: "section1_kaliningrad_to_network", coefficient: 0.68, distFromKm: 1001, distToKm: 2000, tariffClass: 1, confidence: "green" },
  { section: "section2_within_kaliningrad", coefficient: 0.9, tariffClass: "any", confidence: "green" },
  { section: "section4_round_timber_named_routes", coefficient: 70, tariffClass: "any", confidence: "yellow" },
];

describe("resolveDirectionalK3 — Табл.N3 directional multiplier", () => {
  it("is a no-op (×1.0, applies:false) for an ordinary haul with no direction flagged", () => {
    const r = resolveDirectionalK3(SECTION1_ROWS, { distanceKm: 2444, tariffClass: 1 });
    expect(r.coefficient).toBe(1.0);
    expect(r.applies).toBe(false);
    expect(r.warning).toBeUndefined();
  });

  it("is a no-op even when the row table is empty", () => {
    const r = resolveDirectionalK3([], { distanceKm: 800, tariffClass: 2 });
    expect(r.coefficient).toBe(1.0);
    expect(r.applies).toBe(false);
  });

  it("applies the verbatim section-1 coefficient on a flagged Калининград haul, distance+class keyed", () => {
    const near = resolveDirectionalK3(SECTION1_ROWS, {
      distanceKm: 300,
      tariffClass: 1,
      direction: "kaliningrad-network",
    });
    expect(near.applies).toBe(true);
    expect(near.coefficient).toBe(0.27);

    const far = resolveDirectionalK3(SECTION1_ROWS, {
      distanceKm: 1500,
      tariffClass: 1,
      direction: "kaliningrad-network",
    });
    expect(far.coefficient).toBe(0.68);
  });

  it("applies the flat section-2 coefficient for any class within Калининград", () => {
    const r = resolveDirectionalK3(SECTION1_ROWS, {
      distanceKm: 120,
      tariffClass: 3,
      direction: "within-kaliningrad",
    });
    expect(r.applies).toBe(true);
    expect(r.coefficient).toBe(0.9);
  });

  it("REFUSES section-3 погранстанции (seed-red) — keeps ×1.0 and flags, never fabricates", () => {
    const r = resolveDirectionalK3(SECTION1_ROWS, {
      distanceKm: 1000,
      tariffClass: 2,
      direction: "border-transfer",
    });
    expect(r.coefficient).toBe(1.0);
    expect(r.applies).toBe(false);
    expect(r.confidence).toBe("red");
    expect(r.warning).toContain("погранстанции");
  });

  it("keeps ×1.0 + flags when a flagged direction has no matching row", () => {
    const r = resolveDirectionalK3([], {
      distanceKm: 800,
      tariffClass: 1,
      direction: "kaliningrad-network",
    });
    expect(r.coefficient).toBe(1.0);
    expect(r.applies).toBe(false);
    expect(r.warning).toBeTruthy();
  });
});

// ── Табл.N12 FCL container reduction (resolveContainerReduction, п.16.10) ────────
// A ruble subtraction applied before the п.15.5 round. Only an exact, verbatim-sourced
// size-key may be subtracted; an ambiguous/missing size keeps the reduction UN-applied
// (applied:false / 0 ₽) and flags it — the MONEY CONTRACT forbids guessing a row.

const TABL12_ROWS: readonly ContainerReductionRow[] = [
  { sizeKey: "3", ownLoadedRub: 2382, ownEmptyRub: 1664, commonLoadedRub: 2491 },
  { sizeKey: "5", ownLoadedRub: 3952, ownEmptyRub: 2762, commonLoadedRub: 4104 },
  { sizeKey: "10", ownLoadedRub: 5641, ownEmptyRub: 3944, commonLoadedRub: 5937 },
  { sizeKey: "свыше 20", ownLoadedRub: 15632, ownEmptyRub: 10937, commonLoadedRub: 16207 },
];

describe("resolveContainerReduction — Табл.N12 п.16.10 subtraction", () => {
  it("subtracts the verbatim own-loaded amount for an unambiguous 3т container", () => {
    const r = resolveContainerReduction(TABL12_ROWS, "3т", "own");
    expect(r.applied).toBe(true);
    expect(r.reductionRub).toBe(2382);
  });

  it("subtracts the common-park amount for ownership=rzd", () => {
    const r = resolveContainerReduction(TABL12_ROWS, "5т", "rzd");
    expect(r.applied).toBe(true);
    expect(r.reductionRub).toBe(4104);
  });

  it("does NOT subtract for an ft size needing Табл.N10 (un-applied + flagged, never guessed)", () => {
    const r = resolveContainerReduction(TABL12_ROWS, "20ft", "own");
    expect(r.applied).toBe(false);
    expect(r.reductionRub).toBe(0);
    expect(r.warning).toContain("Табл.N10");
  });

  it("is a no-op when no container size is given", () => {
    const r = resolveContainerReduction(TABL12_ROWS, undefined, "own");
    expect(r.applied).toBe(false);
    expect(r.reductionRub).toBe(0);
  });

  it("is a no-op (no flag) when the reduction table is empty", () => {
    const r = resolveContainerReduction([], "3т", "own");
    expect(r.applied).toBe(false);
    expect(r.reductionRub).toBe(0);
  });

  it("flags (not subtracts) when the mapped row is absent from the table", () => {
    const r = resolveContainerReduction(
      [{ sizeKey: "5", ownLoadedRub: 3952, ownEmptyRub: 2762, commonLoadedRub: 4104 }],
      "3т",
      "own",
    );
    expect(r.applied).toBe(false);
    expect(r.reductionRub).toBe(0);
    expect(r.warning).toBeTruthy();
  });
});
