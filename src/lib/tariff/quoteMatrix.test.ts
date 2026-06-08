// ── Golden-тесты матрицы «обычный/инновационный × группы» против R-Тариф ──────
//
// buildMatrixCells — чистая, поэтому тестируем с готовым distKm=1367 (Тёплая Гора → Балашейка),
// сверяя ячейки против reference-quotes-rtariff.json:
//   #4 групповая(6) обычный 70т = 50080 ;  #6 групповая(6) иннов 75т = 48951
//   #7 повагонная(1) обычный 70т = 52463 ;  #9 повагонная(1) иннов 75т = 51278
// Ставка предоставления = round(тариф × 1,15); с НДС = round(× 1,22).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type {
  N8Cell,
  N8ClassCoeffBelt,
  N8K4Belt,
  N8TariffData,
} from "./computeTariffN8";
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
const MARKUP = 15;
const data = loadN8Data();
const rows = buildMatrixCells(DIST, data, 70, 75, MARKUP);
const byBand = (band: string): MatrixRow => {
  const row = rows.find((r) => r.band === band);
  if (!row) throw new Error(`нет строки группы '${band}'`);
  return row;
};

describe("buildMatrixCells — тариф (якоря R-Тариф @1367 км)", () => {
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

describe("buildMatrixCells — ставка предоставления (+15%) и НДС", () => {
  it("предоставление = round(тариф × 1,15)", () => {
    const row = byBand("6-20");
    expect(row.classic.provisionNoVat).toBe(Math.round(50080 * 1.15)); // 57592
    expect(row.innovative.provisionNoVat).toBe(Math.round(48951 * 1.15)); // 56294
  });

  it("с НДС = round(× 1,22) для тарифа и предоставления", () => {
    const row = byBand("6-20");
    expect(row.classic.tariffWithVat).toBe(Math.round(50080 * 1.22)); // 61098
    expect(row.classic.provisionWithVat).toBe(Math.round(57592 * 1.22)); // 70262
  });

  it("наценка 0% → предоставление равно тарифу", () => {
    const flat = buildMatrixCells(DIST, data, 70, 75, 0);
    const row = flat.find((r) => r.band === "6-20")!;
    expect(row.classic.provisionNoVat).toBe(row.classic.tariffNoVat);
  });
});
