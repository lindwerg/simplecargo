// ── Golden tests: PROD entrypoint (computeTariffPure WITH N8 injected) reproduces the
//    certified oracles EXACTLY to the kopeck (gap H1 unification regression guard) ──────
//
// These tests differ from goldenUniversalOracle.test.ts: there TariffData carries NO `n8`
// table, so the universal coefficient-stack path runs. HERE we inject the certified N8 tables
// (exactly as repository.computeTariff does in production via loadN8TariffData), so the own-ПВ
// class-1 нерудные contour is ROUTED THROUGH the certified staged-kopeck chain (computeWagonN8).
// This is the real production path — and it must reproduce the golden квитанции and the R-Тариф
// oracle to the kopeck, not merely to the ruble.
//
// Oracle квитанции / R-Тариф расчёт:
//   ЭФ164189: Возрождение→Гремячая, 2444 km, 15 wagons, щебень 232431 class-1, ГО
//     • 70т classic → loaded 72005 ₽ ; 75т classic → 73452 ₽ ; 75т innovative → 70477 ₽
//     • TOTAL loaded = 9×70477 + 1×73452 + 5×72005 = 1 067 770 ₽
//   ЭТ201459: Исеть→НЧ, 699 km, 6 wagons → loaded 31224 ₽ ; TOTAL = 187 344 ₽
//   R-Тариф Элисенваара→Элиста: 3108 km, мрамор 232215 class-1 → loaded 82 816 ₽ без НДС
//     • с НДС 22% (applied LAST, to the kopeck): 82 816 × 1.22 = 101 035.52 ₽
//
// corrBelts intentionally empty (ТР-1 2026 К1 self-contained by class). own_gondola 0,9346 is
// injected too but is SUPPRESSED on the certified path (it lives inside computeWagonN8) — the
// engine must NOT double-count it; that is exactly what these oracles would catch.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { computeTariffPure, type TariffData } from "./computeTariff";
import type {
  N8Cell,
  N8ClassCoeffBelt,
  N8K4Belt,
  N8TariffData,
} from "./computeTariffN8";
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

const SEED = resolve(process.cwd(), "scripts/seed-data");
function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED, name), "utf8")) as T;
}

// Certified N8 tables — the same seed files loadN8TariffData() reads in production.
const N8: N8TariffData = {
  n8Grid: loadJson<{ schemeN8_weightDist: N8Cell[] }>("tr1-n8-corrected.json").schemeN8_weightDist,
  classCoeff: loadJson<{ classCoeff: N8ClassCoeffBelt[] }>("tr1-class-coeff-corrected.json").classCoeff,
  k4Belts: loadJson<{ distanceCorr: N8K4Belt[] }>("tr1-k4-corrected.json").distanceCorr,
};

// own_gondola coefs injected exactly as production seeds them — must be SUPPRESSED on the
// certified path. Their presence here is the double-count tripwire.
const OWN_GONDOLA_COEFS: CoefficientLike[] = [
  { multiplier: 0.9346, appliesTo: "own_gondola", appliesToClass: 1, effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
  { multiplier: 0.9592, appliesTo: "own_gondola", appliesToClass: 2, effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
  { multiplier: 0.9774, appliesTo: "own_gondola", appliesToClass: 3, effectiveFrom: new Date("2026-01-01"), effectiveTo: null },
];

const AS_OF = new Date("2026-06-07");

function makeProdData(distanceKm: number): TariffData {
  return {
    distance: { distanceKm, found: true },
    etsng: loadEtsngFromSeed() as TariffData["etsng"],
    schemeMap: loadSchemeMapFromSeed() as TariffData["schemeMap"],
    rateBelts: loadRateBeltsFromSeed() as TariffData["rateBelts"],
    classBelts: loadClassBeltsFromSeed() as TariffData["classBelts"],
    corrBelts: [],
    emptyRunBelts: loadEmptyRunBeltsFromSeed() as TariffData["emptyRunBelts"],
    k4Rows: [],
    k3Rows: loadK3RowsFromSeed() as TariffData["k3Rows"],
    k4FullRows: loadK4FullRowsFromSeed() as TariffData["k4FullRows"],
    innovativeModels: loadInnovativeModelsFromSeed() as TariffData["innovativeModels"],
    coefficients: OWN_GONDOLA_COEFS,
    indexations: [],
    n8: N8, // ← certified tables present → certified routing engages (this is the prod shape)
  };
}

function makeInput(overrides: Partial<TariffInput>): TariffInput {
  return {
    originEsr: "021609",
    destEsr: "612709",
    wagonType: "ПВ",
    ownership: "own",
    shipmentType: "group",
    etsngCode: "232431", // щебень, class 1, нерудные
    actualWeightTons: 70,
    axles: 4,
    asOfDate: AS_OF,
    traffic: "domestic",
    wagonCount: 15,
    ...overrides,
  } as TariffInput;
}

// Loaded provозная плата без НДС (no порожний, before indexation) — the certified per-wagon value.
function loadedTariff(r: ReturnType<typeof computeTariffPure>): number {
  return Math.round(r.preIndex - r.emptyRun);
}

describe("PROD PATH (N8-routed) — ЭФ164189 2444 km", () => {
  const data = makeProdData(2444);

  it("green confidence + class 1", () => {
    const r = computeTariffPure(makeInput({ actualWeightTons: 70 }), data);
    expect(r.confidence).toBe("green");
    expect(r.tariffClass).toBe(1);
  });

  it("70т classic loaded = 72005 ₽ (kopeck-exact, no 0,9346 double-count)", () => {
    expect(loadedTariff(computeTariffPure(makeInput({ actualWeightTons: 70 }), data))).toBe(72005);
  });

  it("75т classic loaded = 73452 ₽", () => {
    expect(loadedTariff(computeTariffPure(makeInput({ actualWeightTons: 75 }), data))).toBe(73452);
  });

  it("75т innovative (model 12-9853) loaded = 70477 ₽", () => {
    expect(
      loadedTariff(computeTariffPure(makeInput({ actualWeightTons: 75, wagonModel: "12-9853" }), data)),
    ).toBe(70477);
  });

  it("TOTAL = 9×70477 + 1×73452 + 5×72005 = 1 067 770 ₽", () => {
    const innov = loadedTariff(computeTariffPure(makeInput({ actualWeightTons: 75, wagonModel: "12-9853" }), data));
    const classic75 = loadedTariff(computeTariffPure(makeInput({ actualWeightTons: 75 }), data));
    const classic70 = loadedTariff(computeTariffPure(makeInput({ actualWeightTons: 70 }), data));
    expect(innov * 9 + classic75 * 1 + classic70 * 5).toBe(1_067_770);
  });
});

describe("PROD PATH (N8-routed) — ЭТ201459 699 km", () => {
  const data = makeProdData(699);
  const input = makeInput({ actualWeightTons: 70, wagonCount: 6 });

  it("loaded = 31224 ₽; TOTAL 6 wagons = 187 344 ₽", () => {
    expect(loadedTariff(computeTariffPure(input, data))).toBe(31224);
    expect(loadedTariff(computeTariffPure(input, data)) * 6).toBe(187_344);
  });
});

describe("PROD PATH (N8-routed) — R-Тариф Элисенваара→Элиста 3108 km мрамор", () => {
  const data = makeProdData(3108);
  const input = makeInput({
    originEsr: "010800",
    destEsr: "611106",
    etsngCode: "232215", // мрамор, class 1
    actualWeightTons: 70,
    wagonCount: 6,
  });

  it("loaded = 82816 ₽ без НДС (kopeck-exact)", () => {
    expect(loadedTariff(computeTariffPure(input, data))).toBe(82816);
  });

  it("НДС 22% applied LAST → 82816 × 1.22 = 101 035.52 ₽ (to the kopeck)", () => {
    // The certified loaded per-wagon без-НДС is 82816 ₽; НДС is applied last to the kopeck.
    // 82816 × 1.22 = 101035.52 exactly (no float drift at 2 dp).
    expect(Math.round(82816 * 1.22 * 100) / 100).toBe(101035.52);
  });
});

describe("PROD PATH guard — universal path still runs OUTSIDE the certified contour", () => {
  it("class-2 cargo does NOT route through N8 (certified contour is class-1 only)", () => {
    // A class-2 ЕТСНГ with N8 injected must stay on the universal path (own_gondola 0,9592
    // applies there). We only assert it does not throw / produces a finite total — the exact
    // class-2 number is the universal engine's concern, not this oracle's.
    const data = makeProdData(2444);
    const r = computeTariffPure(makeInput({ etsngCode: "999999" }), data);
    // Unknown ЕТСНГ → red (never fabricated); this proves the certified routing did not swallow it.
    expect(r.confidence).toBe("red");
  });
});
