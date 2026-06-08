// ── Golden end-to-end tests for the N8 own-ПВ tariff engine ──────────────────
//
// Oracle квитанции (exact, per real РЖД documents):
//   ЭФ164189: Возрождение(021609) → Гремячая(612709)
//     • 2444 km, 15 wagons, щебень ЕТСНГ 232431 class 1, собственный полувагон, ГО
//     • 75т innovative × 9 → 70477 ₽/ваг; 75т classic × 1 → 73452 ₽; 70т × 5 → 72005 ₽
//     • TOTAL = 1 067 770 ₽
//   ЭТ201459: Исеть(771500) → Набережные Челны(648503)
//     • 699 km, 6 wagons, щебень 232431 class 1, собственный полувагон, ГО
//     • All wagons (cap 69.5/70т) → 31224 ₽/ваг
//     • TOTAL = 187 344 ₽
//
// Distance golden tests live in computeDistance.test.ts.
// These tests load the real seed-data files (no DB, no network).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  computeQuoteN8,
  type N8Cell,
  type N8ClassCoeffBelt,
  type N8K4Belt,
  type N8TariffData,
  type N8WagonInput,
} from "./computeTariffN8";

// ── Load seed tables ──────────────────────────────────────────────────────────

const SEED = resolve(process.cwd(), "scripts/seed-data");

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED, name), "utf8")) as T;
}

function loadN8Data(): N8TariffData {
  const n8File = loadJson<{ schemeN8_weightDist: N8Cell[] }>("tr1-n8-corrected.json");
  const classFile = loadJson<{ classCoeff: N8ClassCoeffBelt[] }>("tr1-class-coeff-corrected.json");
  const k4File = loadJson<{ distanceCorr: N8K4Belt[] }>("tr1-k4-corrected.json");
  return {
    n8Grid: n8File.schemeN8_weightDist,
    classCoeff: classFile.classCoeff,
    k4Belts: k4File.distanceCorr,
  };
}

const data = loadN8Data();

// ── ЭФ164189: Возрождение → Гремячая, 2444 km, 15 wagons ─────────────────────

// 75т wagons with tariffRub = 70477 are innovative; the single 75т at 73452 is classic.
// The 62478854 wagon is the only 75т classic in the квитанция; all others at 75т = innovative.
const EF_WAGONS: N8WagonInput[] = [
  { wagonNo: "64437213", capacityT: 75.0, innovative: true },
  { wagonNo: "64917271", capacityT: 75.0, innovative: true },
  { wagonNo: "62577135", capacityT: 75.0, innovative: true },
  { wagonNo: "60996501", capacityT: 75.0, innovative: true },
  { wagonNo: "62590278", capacityT: 75.0, innovative: true },
  { wagonNo: "62436548", capacityT: 75.0, innovative: true },
  { wagonNo: "60762556", capacityT: 75.0, innovative: true },
  { wagonNo: "62435763", capacityT: 75.0, innovative: true },
  { wagonNo: "53075321", capacityT: 69.5, innovative: false },
  { wagonNo: "55954051", capacityT: 69.5, innovative: false },
  { wagonNo: "55311401", capacityT: 69.5, innovative: false },
  { wagonNo: "55200208", capacityT: 70.3, innovative: false },
  { wagonNo: "62478854", capacityT: 75.0, innovative: false }, // classic 75т → 73452
  { wagonNo: "52201696", capacityT: 70.3, innovative: false },
  { wagonNo: "62587464", capacityT: 75.0, innovative: true },
];

// ── ЭТ201459: Исеть → Набережные Челны, 699 km, 6 wagons ────────────────────

const ET_WAGONS: N8WagonInput[] = [
  { wagonNo: "52270238", capacityT: 69.5, innovative: false },
  { wagonNo: "63256044", capacityT: 70.0, innovative: false },
  { wagonNo: "65165441", capacityT: 70.0, innovative: false },
  { wagonNo: "65877649", capacityT: 70.0, innovative: false },
  { wagonNo: "63255889", capacityT: 70.0, innovative: false },
  { wagonNo: "65599458", capacityT: 70.0, innovative: false },
];

// ── Oracle tests ──────────────────────────────────────────────────────────────

describe("N8 tariff engine — GOLDEN ORACLE (real квитанции)", () => {
  it("ЭФ164189: per-wagon 75т innovative = 70477 ₽ (×9 wagons)", () => {
    const result = computeQuoteN8(EF_WAGONS, data, 2444);
    const innovWagons = result.wagons.filter((w) => w.innovative && w.capacityT >= 74.5);
    for (const w of innovWagons) {
      expect(w.tariffRub).toBe(70477);
    }
    expect(innovWagons.length).toBe(9);
  });

  it("ЭФ164189: per-wagon 75т classic = 73452 ₽ (×1 wagon — 62478854)", () => {
    const result = computeQuoteN8(EF_WAGONS, data, 2444);
    const classic75 = result.wagons.find((w) => w.wagonNo === "62478854");
    expect(classic75?.tariffRub).toBe(73452);
  });

  it("ЭФ164189: per-wagon 70т (cap 69.5/70.3) = 72005 ₽ (×5 wagons)", () => {
    const result = computeQuoteN8(EF_WAGONS, data, 2444);
    const cap70 = result.wagons.filter((w) => w.capacityT < 74.5 && !w.innovative);
    for (const w of cap70) {
      expect(w.tariffRub).toBe(72005);
    }
    expect(cap70.length).toBe(5);
  });

  it("ЭФ164189: TOTAL = 1 067 770 ₽", () => {
    const result = computeQuoteN8(EF_WAGONS, data, 2444);
    expect(result.total).toBe(1_067_770);
  });

  it("ЭТ201459: per-wagon (cap 69.5/70т) = 31224 ₽ (all 6 wagons)", () => {
    const result = computeQuoteN8(ET_WAGONS, data, 699);
    for (const w of result.wagons) {
      expect(w.tariffRub).toBe(31224);
    }
  });

  it("ЭТ201459: TOTAL = 187 344 ₽", () => {
    const result = computeQuoteN8(ET_WAGONS, data, 699);
    expect(result.total).toBe(187_344);
  });
});

describe("N8 tariff engine — per-wagon breakdown sanity checks", () => {
  it("ЭФ164189: 9 innovative + 5 cap-70 + 1 classic = 15 wagons", () => {
    const result = computeQuoteN8(EF_WAGONS, data, 2444);
    expect(result.wagons.length).toBe(15);
    expect(9 * 70477 + 5 * 72005 + 1 * 73452).toBe(1_067_770);
  });

  it("ЭТ201459: cap 69.5 rounds to w70 (same belt as cap 70.0)", () => {
    const result = computeQuoteN8(ET_WAGONS, data, 699);
    // The first wagon has cap 69.5 → Math.round(69.5) = 70 in JS (rounds to even = 70)
    // All wagons should produce the same per-wagon rate since the N8 grid is coarser here.
    const unique = new Set(result.wagons.map((w) => w.tariffRub));
    expect(unique.size).toBe(1);
    expect([...unique][0]).toBe(31224);
  });

  it("K4 at 2444 km is sourced (not fitted)", () => {
    const result = computeQuoteN8(EF_WAGONS, data, 2444);
    expect(result.wagons[0].k4Fitted).toBe(false);
  });

  it("K4 at 699 km is fitted (belt-boundary uplift applied)", () => {
    const result = computeQuoteN8(ET_WAGONS, data, 699);
    expect(result.wagons[0].k4Fitted).toBe(true);
  });
});
