import { describe, expect, it } from "vitest";

import {
  coefficientStack,
  computeK1,
  indexFactor,
  type ClassCoeffBelt,
  type CoefficientLike,
  type DistanceCorrBelt,
  type IndexationLike,
} from "./coefficients";

// class-1 K1 belts: ~0.75 short-haul, tapering down with distance (TARIFF_CALCULATOR §2.4).
const CLASS1_BELTS: ClassCoeffBelt[] = [
  { freightClass: 1, distFromKm: 0, distToKm: 1200, k1: 0.75 },
  { freightClass: 1, distFromKm: 1201, distToKm: 5000, k1: 0.62 },
  { freightClass: 1, distFromKm: 5001, distToKm: 99999, k1: 0.55 },
];

// Таблица 5 long-haul taper (max-of-two partner).
const CORR_BELTS: DistanceCorrBelt[] = [
  { distFromKm: 0, distToKm: 1200, kTable5: 0.7 },
  { distFromKm: 1201, distToKm: 5000, kTable5: 0.65 }, // > class1 0.62 → wins at long haul
];

describe("computeK1 (table-driven, max-of-two)", () => {
  it("is TABLE-driven: different L yields different K1", () => {
    const short = computeK1(CLASS1_BELTS, [], 1, 500);
    const mid = computeK1(CLASS1_BELTS, [], 1, 2000);
    const long = computeK1(CLASS1_BELTS, [], 1, 6000);

    expect(short.k1).toBe(0.75);
    expect(mid.k1).toBe(0.62);
    expect(long.k1).toBe(0.55);
    // The whole point of §2.4: K1 is NOT a scalar.
    expect(short.k1).not.toBe(mid.k1);
    expect(mid.k1).not.toBe(long.k1);
  });

  it("applies the max-of-two rule against distance_corr", () => {
    // At 2000 km: class1=0.62, corr=0.65 → max = 0.65.
    const result = computeK1(CLASS1_BELTS, CORR_BELTS, 1, 2000);
    expect(result.found).toBe(true);
    expect(result.k1).toBe(0.65);
  });

  it("keeps class coeff when it exceeds the taper", () => {
    // At 500 km: class1=0.75, corr=0.70 → max = 0.75.
    const result = computeK1(CLASS1_BELTS, CORR_BELTS, 1, 500);
    expect(result.k1).toBe(0.75);
  });

  it("falls back to class coeff alone (with warning) when taper missing", () => {
    const result = computeK1(CLASS1_BELTS, [], 1, 2000);
    expect(result.found).toBe(true);
    expect(result.k1).toBe(0.62);
    expect(result.warning).toBeDefined();
  });

  it("returns found:false (never guesses) when no class belt covers L", () => {
    const result = computeK1(CLASS1_BELTS, CORR_BELTS, 1, 200000);
    expect(result.found).toBe(false);
    expect(result.warning).toBeDefined();
  });
});

describe("indexFactor (compounding)", () => {
  const IX: IndexationLike[] = [
    { pct: 13.8, effectiveFrom: new Date("2024-12-01"), appliesToClass: null },
    { pct: 10.0, effectiveFrom: new Date("2025-12-01"), appliesToClass: null },
    { pct: 5.0, effectiveFrom: new Date("2025-01-01"), appliesToClass: 1 }, // class-1 only
  ];

  it("compounds applicable indexations multiplicatively", () => {
    const f = indexFactor(IX, new Date("2026-06-07"), 2);
    // 1.138 × 1.10 (class-1 row excluded for class 2)
    expect(f).toBeCloseTo(1.138 * 1.1, 6);
  });

  it("includes class-targeted indexation for the matching class", () => {
    const f = indexFactor(IX, new Date("2026-06-07"), 1);
    expect(f).toBeCloseTo(1.138 * 1.1 * 1.05, 6);
  });

  it("excludes indexations not yet in effect on the as-of date", () => {
    const f = indexFactor(IX, new Date("2025-06-01"), 2);
    expect(f).toBeCloseTo(1.138, 6); // only the 2024-12 row is live
  });
});

describe("coefficientStack", () => {
  const COEFS: CoefficientLike[] = [
    {
      multiplier: 1.1,
      appliesTo: "porozhny",
      appliesToClass: null,
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: null,
    },
    {
      multiplier: 1.05,
      appliesTo: "container",
      appliesToClass: null,
      effectiveFrom: new Date("2026-01-01"),
      effectiveTo: null,
    },
    {
      multiplier: 0.9492,
      appliesTo: "minstroy",
      appliesToClass: null,
      effectiveFrom: new Date("2025-01-01"),
      effectiveTo: new Date("2025-12-31"),
    },
  ];

  it("applies порожний ×1.1 for own-wagon (isPorozhny)", () => {
    const f = coefficientStack(COEFS, {
      onDate: new Date("2026-06-07"),
      freightClass: 1,
      isContainer: false,
      isPorozhny: true,
    });
    expect(f).toBeCloseTo(1.1, 6); // minstroy expired, container off
  });

  it("skips expired Минстрой discount in 2026", () => {
    const f = coefficientStack(COEFS, {
      onDate: new Date("2026-06-07"),
      freightClass: 1,
      isContainer: false,
      isPorozhny: false,
    });
    expect(f).toBe(1); // nothing active
  });

  it("applies Минстрой discount within its 2025 window", () => {
    const f = coefficientStack(COEFS, {
      onDate: new Date("2025-06-01"),
      freightClass: 1,
      isContainer: false,
      isPorozhny: false,
    });
    expect(f).toBeCloseTo(0.9492, 6);
  });

  it("applies container +5% only for containers", () => {
    const f = coefficientStack(COEFS, {
      onDate: new Date("2026-06-07"),
      freightClass: 1,
      isContainer: true,
      isPorozhny: false,
    });
    expect(f).toBeCloseTo(1.05, 6);
  });
});
