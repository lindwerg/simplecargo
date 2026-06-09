import { describe, expect, it } from "vitest";

import { computeTariffPure, type TariffData } from "./computeTariff";
import type { TariffInput } from "./schema";

// Golden fixtures for SimpleCargo's primary path: own-wagon полувагон, щебень (class 1),
// повагонная, domestic → И + порожний, NO В (TARIFF_CALCULATOR §2.2, §5). All tables are
// INJECTED so the core unit-tests with no DB / no network.

const AS_OF = new Date("2026-06-07");

const BASE_INPUT: TariffInput = {
  originEsr: "231305", // Серпухов (illustrative)
  destEsr: "190106", // Печора (illustrative)
  wagonType: "ПВ",
  ownership: "own",
  shipmentType: "wagon",
  etsngCode: "232395",
  actualWeightTons: 69,
  axles: 4,
  asOfDate: AS_OF,
  traffic: "domestic",
};

function makeData(overrides: Partial<TariffData> = {}): TariffData {
  const base: TariffData = {
    distance: { distanceKm: 800, found: true },
    etsng: [
      {
        code: "232395",
        name: "Щебень гранитный",
        tariffClass: 1,
        mvnByWagon: { pv: 69, default: 69 },
      },
    ],
    schemeMap: [
      {
        wagonType: "ПВ",
        ownership: "own",
        shipmentType: "wagon",
        iSchemeCode: "И1",
        vSchemeCode: null, // own wagon → no В
      },
    ],
    rateBelts: [
      { schemeCode: "И1", distFromKm: 0, distToKm: 1200, rateRub: 50000 },
      { schemeCode: "И1", distFromKm: 1201, distToKm: 5000, rateRub: 90000 },
    ],
    classBelts: [
      { freightClass: 1, distFromKm: 0, distToKm: 1200, k1: 0.75 },
      { freightClass: 1, distFromKm: 1201, distToKm: 5000, k1: 0.62 },
    ],
    // corrBelts present so K1 taper lookup succeeds (no soft warning → green confidence).
    // class-1 k1=0.75 > corrK=0.5 → max-of-two = 0.75 (same iComponent result).
    corrBelts: [
      { distFromKm: 0, distToKm: 1200, kTable5: 0.5 },
      { distFromKm: 1201, distToKm: 5000, kTable5: 0.4 },
    ],
    emptyRunBelts: [
      { axles: 4, distFromKm: 0, distToKm: 1200, rateRub: 12000 },
      { axles: 4, distFromKm: 1201, distToKm: 5000, rateRub: 20000 },
    ],
    k4Rows: [],
    // New Phase-1 fields: empty = neutral (K3=1.0, K4 falls back to legacy, innovative=1.0).
    k3Rows: [],
    k4FullRows: [],
    innovativeModels: [],
    coefficients: [
      {
        multiplier: 1.1, // порожний ×1.1
        appliesTo: "porozhny",
        appliesToClass: null,
        effectiveFrom: new Date("2026-01-01"),
        effectiveTo: null,
      },
    ],
    // Both 2024/2025 indexations are ALREADY baked into the ТР-1 2026 base rate tables
    // (DATA_ACQUISITION_REPORT.md §2 lines 38,40). Each carries a closing window before the
    // 2026 calc date, so isIndexApplicable skips them → indexFactor = 1.0 for a 2026 loaded
    // calc. Re-applying them was the ~25% double-count (TARIFF_MASTER_AUDIT.md §3 item 1, C1).
    indexations: [
      { pct: 13.8, effectiveFrom: new Date("2024-12-01"), effectiveTo: new Date("2025-11-30"), appliesToClass: null },
      { pct: 10.0, effectiveFrom: new Date("2025-12-01"), effectiveTo: new Date("2025-12-31"), appliesToClass: null },
    ],
    ...overrides,
  };
  return base;
}

describe("computeTariffPure — own-wagon щебень class-1 happy path", () => {
  it("computes И + порожний, NO В, with 22% НДС last (green)", () => {
    const r = computeTariffPure(BASE_INPUT, makeData());

    expect(r.confidence).toBe("green");
    expect(r.tariffClass).toBe(1);
    expect(r.vComponent).toBe(0); // own wagon → no В
    expect(r.distanceKm).toBe(800);

    // И = 50000 × 0.75 (k1) × 1 (k3) × 1 (k4 повагонная) × 1 (k5) = 37500
    expect(r.iComponent).toBe(37500);
    // порожний = 12000
    expect(r.emptyRun).toBe(12000);

    // iStack = 1.0 (no container coef active). emptyStack = ×1.1 (порожний coef).
    // preIndex = (37500 + 0) × 1.0 + 12000 × 1.1 = 37500 + 13200 = 50700
    expect(r.preIndex).toBeCloseTo(50700, 2);

    // indexFactor = 1.0: for a 2026 domestic loaded calc the +13.8% and +10% are already
    // embedded in the base, so neither re-applies (TARIFF_MASTER_AUDIT.md §3 item 1 / C1/C2).
    // The previous 1.138×1.10=1.2518 assertion LOCKED IN a ~25% overcharge; corrected here.
    expect(r.indexFactor).toBeCloseTo(1.0, 6);
    expect(r.postIndex).toBeCloseTo(50700, 0);

    // НДС 22% last
    expect(r.vatRate).toBe(22);
    expect(r.total).toBeCloseTo(r.postIndex * 1.22, 0);
  });

  it("is K1-TABLE-driven: a longer distance yields a different K1 (not a scalar)", () => {
    const short = computeTariffPure(BASE_INPUT, makeData({ distance: { distanceKm: 800, found: true } }));
    const long = computeTariffPure(BASE_INPUT, makeData({ distance: { distanceKm: 2000, found: true } }));

    // short: И1 50000 × k1 0.75 = 37500 ; long: И1 90000 × k1 0.62 = 55800
    expect(short.iComponent).toBe(37500);
    expect(long.iComponent).toBe(55800);
    expect(short.iComponent).not.toBe(long.iComponent);
  });

  it("applies МВН floor to chargeable tons", () => {
    const light = computeTariffPure(
      { ...BASE_INPUT, actualWeightTons: 55 },
      makeData(),
    );
    expect(light.chargeableTons).toBe(69); // lifted to МВН floor
  });

  it("export traffic → 0% НДС", () => {
    const r = computeTariffPure({ ...BASE_INPUT, traffic: "export" }, makeData());
    expect(r.vatRate).toBe(0);
    expect(r.total).toBeCloseTo(r.postIndex, 2);
  });
});

describe("computeTariffPure — RZD-owned wagon path uses В, not порожний", () => {
  it("charges В and skips порожний for ownership=rzd", () => {
    const data = makeData({
      schemeMap: [
        {
          wagonType: "ПВ",
          ownership: "rzd",
          shipmentType: "wagon",
          iSchemeCode: "И1",
          vSchemeCode: "В1",
        },
      ],
      rateBelts: [
        { schemeCode: "И1", distFromKm: 0, distToKm: 1200, rateRub: 50000 },
        { schemeCode: "В1", distFromKm: 0, distToKm: 1200, rateRub: 18000 },
      ],
    });

    const r = computeTariffPure({ ...BASE_INPUT, ownership: "rzd" }, data);
    // CONFIDENCE MODEL: rzd-owned (общий парк) is outside the validated own-ПВ class-1
    // нерудные green contour → computed but unvalidated = yellow.
    expect(r.confidence).toBe("yellow");
    expect(r.vComponent).toBe(18000);
    expect(r.emptyRun).toBe(0); // no порожний for RZD wagon
  });
});

describe("computeTariffPure — graceful degradation (never guesses)", () => {
  it("returns red when the distance edge is missing", () => {
    const r = computeTariffPure(
      BASE_INPUT,
      makeData({ distance: { distanceKm: 0, found: false, warning: "Книга 3 edge missing" } }),
    );
    expect(r.confidence).toBe("red");
    expect(r.total).toBe(0);
    expect(r.warnings.some((w) => w.includes("Книга 3"))).toBe(true);
  });

  it("returns red when the ЕТСНГ class is unknown", () => {
    const r = computeTariffPure({ ...BASE_INPUT, etsngCode: "000000" }, makeData());
    expect(r.confidence).toBe("red");
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("returns red when the scheme map has no row", () => {
    const r = computeTariffPure(BASE_INPUT, makeData({ schemeMap: [] }));
    expect(r.confidence).toBe("red");
    expect(r.warnings.some((w) => w.includes("схем"))).toBe(true);
  });

  it("returns red when no rate belt covers the distance", () => {
    const r = computeTariffPure(BASE_INPUT, makeData({ rateBelts: [] }));
    expect(r.confidence).toBe("red");
  });

  it("returns red when the K1 class belt is missing", () => {
    const r = computeTariffPure(BASE_INPUT, makeData({ classBelts: [] }));
    expect(r.confidence).toBe("red");
  });

  it("returns red when the порожний belt is missing for own wagon", () => {
    const r = computeTariffPure(BASE_INPUT, makeData({ emptyRunBelts: [] }));
    expect(r.confidence).toBe("red");
  });
});
