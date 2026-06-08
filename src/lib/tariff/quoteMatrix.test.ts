// ── Golden-тесты матрицы: собственный тариф (выверен) + инвентарный (И1+В4) + предоставление ──
//
// buildMatrixCells — чистая, тестируем с готовым distKm=1367 (Тёплая Гора → Балашейка).
// Собственный тариф (N8) сверен против reference-quotes-rtariff.json:
//   #4 групповая(6) обычн 70т = 50080 ; #6 групповая иннов 75т = 48951
//   #7 повагонная(1) обычн 70т = 52463 ; #9 повагонная иннов 75т = 51278
// Инвентарный (И1+В4) ⚠️ НЕ выверен против эталона — фиксируем то, что даёт формула (regression-lock).
// Предоставление = round(инвентарный × коэффициент собственника).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type {
  N8Cell,
  N8ClassCoeffBelt,
  N8K4Belt,
  N8TariffData,
} from "./computeTariffN8";
import { loadInventoryTariffData } from "./inventoryData";
import { buildMatrixCells, type MatrixRow } from "./quoteMatrix";

const SEED = resolve(process.cwd(), "scripts/seed-data");
function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED, name), "utf8")) as T;
}
function loadN8Data(): N8TariffData {
  const n8 = loadJson<{ schemeN8_weightDist: N8Cell[] }>("tr1-n8-corrected.json");
  const cls = loadJson<{ classCoeff: N8ClassCoeffBelt[] }>("tr1-class-coeff-corrected.json");
  const k4 = loadJson<{ distanceCorr: N8K4Belt[] }>("tr1-k4-corrected.json");
  return { n8Grid: n8.schemeN8_weightDist, classCoeff: cls.classCoeff, k4Belts: k4.distanceCorr };
}

const DIST = 1367;
const COEFF = 1.15;
const n8Data = loadN8Data();
const invData = loadInventoryTariffData();
const rows = buildMatrixCells(DIST, n8Data, invData, 70, 75, COEFF);
const byBand = (band: string): MatrixRow => {
  const row = rows.find((r) => r.band === band);
  if (!row) throw new Error(`нет строки группы '${band}'`);
  return row;
};

describe("buildMatrixCells — собственный тариф (якоря R-Тариф @1367 км)", () => {
  it("группа 6–20: обычный 70т = 50080 ₽, инновац 75т = 48951 ₽", () => {
    const row = byBand("6-20");
    expect(row.classic.tariffNoVat).toBe(50080);
    expect(row.innovative.tariffNoVat).toBe(48951);
  });

  it("повагонная (1): обычный 70т = 52463 ₽, инновац 75т = 51278 ₽", () => {
    const row = byBand("1");
    expect(row.classic.tariffNoVat).toBe(52463);
    expect(row.innovative.tariffNoVat).toBe(51278);
  });

  it("все 5 групп ТР-1 присутствуют", () => {
    expect(rows.map((r) => r.band)).toEqual(["1", "2", "3-5", "6-20", "свыше 20"]);
  });
});

describe("buildMatrixCells — инвентарный парк (И1+В4) ⚠️ regression-lock, не эталон", () => {
  it("группа 6–20: обычный 70т = 95220 ₽, инновац 75т = 96211 ₽", () => {
    const row = byBand("6-20");
    expect(row.classic.inventoryNoVat).toBe(95220);
    expect(row.innovative.inventoryNoVat).toBe(96211);
  });

  it("повагонная (1): обычный 70т = 98533 ₽, инновац 75т = 99567 ₽", () => {
    const row = byBand("1");
    expect(row.classic.inventoryNoVat).toBe(98533);
    expect(row.innovative.inventoryNoVat).toBe(99567);
  });

  it("инвентарный > собственного (добавлена вагонная составляющая В4)", () => {
    for (const r of rows) {
      expect(r.classic.inventoryNoVat).toBeGreaterThan(r.classic.tariffNoVat);
      expect(r.innovative.inventoryNoVat).toBeGreaterThan(r.innovative.tariffNoVat);
    }
  });
});

describe("buildMatrixCells — ставка предоставления = инвентарный × коэффициент + НДС", () => {
  it("предоставление = round(инвентарный × 1,15)", () => {
    const row = byBand("6-20");
    expect(row.classic.provisionNoVat).toBe(Math.round(95220 * COEFF)); // 109503
    expect(row.innovative.provisionNoVat).toBe(Math.round(96211 * COEFF));
  });

  it("с НДС = round(× 1,22) для инвентарного и предоставления", () => {
    const row = byBand("6-20");
    expect(row.classic.inventoryWithVat).toBe(Math.round(95220 * 1.22));
    expect(row.classic.provisionWithVat).toBe(Math.round(row.classic.provisionNoVat * 1.22));
  });

  it("коэффициент 1,0 → предоставление равно инвентарному", () => {
    const flat = buildMatrixCells(DIST, n8Data, invData, 70, 75, 1.0);
    const row = flat.find((r) => r.band === "6-20")!;
    expect(row.classic.provisionNoVat).toBe(row.classic.inventoryNoVat);
  });
});
