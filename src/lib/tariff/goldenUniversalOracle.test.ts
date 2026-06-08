// ── Golden tests: UNIFIED computeTariffPure reproduces N8 oracle values ───────
//
// These tests verify that computeTariffPure (the universal production entrypoint)
// gives the same per-wagon LOADED TARIFF as computeQuoteN8 (the certified N8 fast-path).
//
// ARCHITECTURE NOTE:
//   computeTariffPure computes iComponent (raw, pre-stack), then applies
//   the coefficientStack (including own_gondola 0.9346) in preIndex:
//     preIndex = iComponent × iStack + emptyRun × emptyStack
//   The N8 fast-path returns tariffRub = round(N8base × K3 × ownGondola × K1 × K4)
//   which is the LOADED leg only (no порожний).
//
//   Therefore the correct comparison is:
//     Math.round(r.preIndex - r.emptyRun) === oracle_tariffRub
//   This is the "loaded провозная плата" (без НДС, без порожний, before indexation).
//
// Oracle квитанции:
//   ЭФ164189: Возрождение → Гремячая, 2444 km, 15 wagons, щебень 232431 class-1, ГО
//     • 70т classic → loaded = 72005 ₽
//     • 75т classic → loaded = 73452 ₽
//     • 75т innovative → loaded = 70477 ₽
//     • TOTAL loaded = 9×70477 + 1×73452 + 5×72005 = 1 067 770 ₽
//   ЭТ201459: Исеть → НЧ, 699 km, 6 wagons, щебень 232431 class-1, ГО
//     • All wagons (cap 69.5/70т) → loaded = 31224 ₽; TOTAL loaded = 187 344 ₽
//   R-Тариф Элисенваара→Элиста: 3108 km, 6 wagons, мрамор 232215 class-1, ГО
//     • 70т → loaded = 82816 ₽; с НДС (22%) = 101 035.52 ₽
//
// The own_gondola coefficients (п.18.1.1) are injected into TariffData.coefficients,
// which is exactly how production works after seeding tr1-coefficients.json.
// corrBelts are intentionally empty (ТР-1 2026 К1 is fully self-contained by class).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computeTariffPure, type TariffData } from "./computeTariff";
import type { CoefficientLike } from "./coefficients";
import type { TariffInput } from "./schema";
import {
  loadClassBeltsFromSeed,
  loadEmptyRunBeltsFromSeed,
  loadEtsngFromSeed,
  loadInnovativeModelsFromSeed,
  loadK3RowsFromSeed,
  loadK4FullRowsFromSeed,
  loadRateBeltsFromSeed,
  loadSchemeMapFromSeed,
} from "./seedLoader";
import {
  computeQuoteN8,
  type N8Cell,
  type N8ClassCoeffBelt,
  type N8K4Belt,
  type N8TariffData,
  type N8WagonInput,
} from "./computeTariffN8";

// ── Own-gondola coefficients (п.18.1.1 ТР-1 2026) injected as fixtures ────────
//
// In production these come from the DB after seeding tr1-coefficients.json.
// Injecting directly makes the test DB-free and clearly expresses the intent.

const OWN_GONDOLA_COEFS: CoefficientLike[] = [
  {
    multiplier: 0.9346,
    appliesTo: "own_gondola",
    appliesToClass: 1,
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
  },
  {
    multiplier: 0.9592,
    appliesTo: "own_gondola",
    appliesToClass: 2,
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
  },
  {
    multiplier: 0.9774,
    appliesTo: "own_gondola",
    appliesToClass: 3,
    effectiveFrom: new Date("2026-01-01"),
    effectiveTo: null,
  },
];

const AS_OF = new Date("2026-06-07");

// ── TariffData factory with own_gondola coefs injected ────────────────────────

function makeSeedDataWithOwnGondola(distanceKm: number): TariffData {
  return {
    distance: { distanceKm, found: true },
    etsng: loadEtsngFromSeed() as TariffData["etsng"],
    schemeMap: loadSchemeMapFromSeed() as TariffData["schemeMap"],
    rateBelts: loadRateBeltsFromSeed() as TariffData["rateBelts"],
    classBelts: loadClassBeltsFromSeed() as TariffData["classBelts"],
    corrBelts: [], // correct for ТР-1 2026 — К1 is self-contained by class, no taper table
    emptyRunBelts: loadEmptyRunBeltsFromSeed() as TariffData["emptyRunBelts"],
    k4Rows: [],
    k3Rows: loadK3RowsFromSeed() as TariffData["k3Rows"],
    k4FullRows: loadK4FullRowsFromSeed() as TariffData["k4FullRows"],
    innovativeModels: loadInnovativeModelsFromSeed() as TariffData["innovativeModels"],
    coefficients: OWN_GONDOLA_COEFS,
    indexations: [],
  };
}

// ── Convenience: extract the loaded tariff component from a breakdown ─────────
//
// The N8 oracle is the loaded component only (no порожний).
// In the universal path: preIndex = loadedComponent + emptyRun (no indexation here).

function loadedTariff(r: ReturnType<typeof computeTariffPure>): number {
  return Math.round(r.preIndex - r.emptyRun);
}

// ── Base input for own-ПВ class-1 щебень ГО ──────────────────────────────────

function makeInput(overrides: Partial<TariffInput>): TariffInput {
  return {
    originEsr: "021609",
    destEsr: "612709",
    wagonType: "ПВ",
    ownership: "own",
    shipmentType: "group", // ЭФ164189 / ЭТ201459 are ГО (grupovaya отправка)
    etsngCode: "232431", // щебень, class 1, K3=0.77×0.909=0.69993
    actualWeightTons: 70,
    axles: 4,
    asOfDate: AS_OF,
    traffic: "domestic",
    wagonCount: 15,
    ...overrides,
  } as TariffInput;
}

// ── N8 seed data helper ───────────────────────────────────────────────────────

const SEED = resolve(process.cwd(), "scripts/seed-data");
function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED, name), "utf8")) as T;
}
function loadN8DataForParity(): N8TariffData {
  const n8File = loadJson<{ schemeN8_weightDist: N8Cell[] }>("tr1-n8-corrected.json");
  const classFile = loadJson<{ classCoeff: N8ClassCoeffBelt[] }>("tr1-class-coeff-corrected.json");
  const k4File = loadJson<{ distanceCorr: N8K4Belt[] }>("tr1-k4-corrected.json");
  return {
    n8Grid: n8File.schemeN8_weightDist,
    classCoeff: classFile.classCoeff,
    k4Belts: k4File.distanceCorr,
  };
}

// ── ЭФ164189: Возрождение→Гремячая 2444 km, 15 wagons ────────────────────────

describe("UNIFIED ENGINE — ЭФ164189: 70т classic @2444km loaded = 72005 ₽", () => {
  const data = makeSeedDataWithOwnGondola(2444);
  const input = makeInput({ actualWeightTons: 70, wagonModel: undefined });

  it("confidence is green (all tables resolved)", () => {
    const r = computeTariffPure(input, data);
    expect(r.confidence).toBe("green");
  });

  it("tariffClass = 1 for щебень 232431", () => {
    const r = computeTariffPure(input, data);
    expect(r.tariffClass).toBe(1);
  });

  it("loaded tariff (preIndex − emptyRun) = 72005 ₽", () => {
    const r = computeTariffPure(input, data);
    expect(loadedTariff(r)).toBe(72005);
  });
});

describe("UNIFIED ENGINE — ЭФ164189: 75т classic @2444km loaded = 73452 ₽", () => {
  it("loaded tariff = 73452 ₽ (classic 75т)", () => {
    const r = computeTariffPure(makeInput({ actualWeightTons: 75 }), makeSeedDataWithOwnGondola(2444));
    expect(loadedTariff(r)).toBe(73452);
  });
});

describe("UNIFIED ENGINE — ЭФ164189: 75т innovative @2444km loaded = 70477 ₽", () => {
  // Any innovative model code present in tr1-innovative-models.json triggers C_INNOVATIVE.
  it("loaded tariff = 70477 ₽ (innovative 75т, model 19-9835-01)", () => {
    const r = computeTariffPure(
      makeInput({ actualWeightTons: 75, wagonModel: "19-9835-01" }),
      makeSeedDataWithOwnGondola(2444),
    );
    expect(loadedTariff(r)).toBe(70477);
  });
});

describe("UNIFIED ENGINE — ЭФ164189: TOTAL 1 067 770 ₽ (loaded only)", () => {
  it("9 × 70477 + 1 × 73452 + 5 × 72005 = 1 067 770 ₽ (arithmetic check)", () => {
    expect(9 * 70477 + 1 * 73452 + 5 * 72005).toBe(1_067_770);
  });

  it("unified path: total loaded = 1 067 770 ₽", () => {
    const innov = computeTariffPure(
      makeInput({ actualWeightTons: 75, wagonModel: "19-9835-01" }),
      makeSeedDataWithOwnGondola(2444),
    );
    const classic75 = computeTariffPure(
      makeInput({ actualWeightTons: 75 }),
      makeSeedDataWithOwnGondola(2444),
    );
    const classic70 = computeTariffPure(
      makeInput({ actualWeightTons: 70 }),
      makeSeedDataWithOwnGondola(2444),
    );
    const total = loadedTariff(innov) * 9 + loadedTariff(classic75) * 1 + loadedTariff(classic70) * 5;
    expect(total).toBe(1_067_770);
  });
});

// ── ЭТ201459: Исеть→НЧ 699 km, 6 wagons ──────────────────────────────────────

describe("UNIFIED ENGINE — ЭТ201459: 70т @699km loaded = 31224 ₽", () => {
  const data = makeSeedDataWithOwnGondola(699);
  const input = makeInput({ actualWeightTons: 70, wagonCount: 6, shipmentType: "group" });

  it("confidence is green", () => {
    const r = computeTariffPure(input, data);
    expect(r.confidence).toBe("green");
  });

  it("loaded tariff = 31224 ₽ (70т @699km ГО)", () => {
    const r = computeTariffPure(input, data);
    expect(loadedTariff(r)).toBe(31224);
  });

  it("TOTAL loaded = 6 × 31224 = 187 344 ₽", () => {
    const r = computeTariffPure(input, data);
    expect(loadedTariff(r) * 6).toBe(187_344);
  });
});

// ── R-Тариф Элисенваара→Элиста: 3108 km, 6 wagons, мрамор 232215 70т ─────────

describe("UNIFIED ENGINE — R-Тариф 3108km мрамор 70т loaded = 82816 ₽", () => {
  const data = makeSeedDataWithOwnGondola(3108);
  const input: TariffInput = {
    originEsr: "010800",
    destEsr: "611106",
    wagonType: "ПВ",
    ownership: "own",
    shipmentType: "group", // R-Тариф oracle: ГО 6 wagons
    etsngCode: "232215", // мрамор, class 1, K3=0.77×0.909=0.69993
    actualWeightTons: 70,
    axles: 4,
    asOfDate: AS_OF,
    traffic: "domestic",
    wagonCount: 6,
  };

  it("confidence is green", () => {
    const r = computeTariffPure(input, data);
    expect(r.confidence).toBe("green");
  });

  it("tariffClass = 1 for мрамор 232215", () => {
    const r = computeTariffPure(input, data);
    expect(r.tariffClass).toBe(1);
  });

  it("loaded tariff = 82816 ₽ (без НДС)", () => {
    const r = computeTariffPure(input, data);
    expect(loadedTariff(r)).toBe(82816);
  });

  it("с НДС 22%: 82816 × 1.22 = 101035.52 ₽", () => {
    // Verify the VAT math — total in breakdown includes emptyRun too, so just verify scalar.
    expect(82816 * 1.22).toBeCloseTo(101035.52, 1);
  });

  it("TOTAL loaded 6 wagons = 6 × 82816 = 496 896 ₽", () => {
    const r = computeTariffPure(input, data);
    expect(loadedTariff(r) * 6).toBe(6 * 82816);
  });
});

// ── PARITY: unified computeTariffPure === computeQuoteN8 ─────────────────────
//
// This is the definitive regression guard: both engines must return the same
// loaded tariff for every oracle case.

describe("PARITY: unified loadedTariff === computeQuoteN8.tariffRub", () => {
  const n8data = loadN8DataForParity();

  it("70т classic @2444km групповая: both = 72005 ₽", () => {
    // 6 wagons → групповая (matches the universal shipmentType:'group'). A single-wagon N8 call
    // is повагонная, which the exact п.16.7 mechanism now (correctly) prices higher than групповая.
    const n8Wagons: N8WagonInput[] = Array.from({ length: 6 }, (_, i) => ({
      wagonNo: String(i + 1),
      capacityT: 70,
      innovative: false,
    }));
    const n8r = computeQuoteN8(n8Wagons, n8data, 2444);
    const unir = computeTariffPure(makeInput({ actualWeightTons: 70 }), makeSeedDataWithOwnGondola(2444));
    expect(n8r.wagons[0].tariffRub).toBe(72005);
    expect(loadedTariff(unir)).toBe(72005);
    expect(loadedTariff(unir)).toBe(n8r.wagons[0].tariffRub);
  });

  it("70т classic @699km 6 wagons: both = 31224 ₽", () => {
    // Oracle: ЭТ201459 — 6 wagons at 699km. K4=0.98×uplift (6-20 group, short-haul fitted).
    const n8Wagons: N8WagonInput[] = Array.from({ length: 6 }, (_, i) => ({
      wagonNo: String(i + 1),
      capacityT: 70,
      innovative: false,
    }));
    const n8r = computeQuoteN8(n8Wagons, n8data, 699);
    const unir = computeTariffPure(
      makeInput({ actualWeightTons: 70, wagonCount: 6, shipmentType: "group" }),
      makeSeedDataWithOwnGondola(699),
    );
    expect(n8r.wagons[0].tariffRub).toBe(31224);
    expect(loadedTariff(unir)).toBe(31224);
    expect(loadedTariff(unir)).toBe(n8r.wagons[0].tariffRub);
  });

  it("70т classic @3108km групповая: both = 82816 ₽ (R-Тариф мрамор)", () => {
    const n8Wagons: N8WagonInput[] = Array.from({ length: 6 }, (_, i) => ({
      wagonNo: String(i + 1),
      capacityT: 70,
      innovative: false,
    }));
    const n8r = computeQuoteN8(n8Wagons, n8data, 3108);
    const unir = computeTariffPure(
      {
        originEsr: "010800",
        destEsr: "611106",
        wagonType: "ПВ",
        ownership: "own",
        shipmentType: "group",
        etsngCode: "232215",
        actualWeightTons: 70,
        axles: 4,
        asOfDate: AS_OF,
        traffic: "domestic",
        wagonCount: 6,
      },
      makeSeedDataWithOwnGondola(3108),
    );
    expect(n8r.wagons[0].tariffRub).toBe(82816);
    expect(loadedTariff(unir)).toBe(82816);
    expect(loadedTariff(unir)).toBe(n8r.wagons[0].tariffRub);
  });
});
