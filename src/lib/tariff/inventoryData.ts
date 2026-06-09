// Server-side loader for the INVENTORY-park (общий парк РЖД) tariff tables: И1 + В4.
//
// Инвентарный (общий) парк = составляющая И1 (инфраструктура+локомотив, 2D вес×расстояние)
// + В4 (вагонная составляющая, только расстояние, класс-независимая). Это ДРУГОЙ путь, чем
// собственный полувагон (схема N8 × 0,9346). Источник схем: tr1-classifier-pinned.json
// (полувагон ownership=rzd → И1 + В4, Табл.N6 ТР-1 2026).
//
// ВНИМАНИЕ: эти ставки НЕ выверены до рубля против эталона R-Тариф общего парка (в отличие
// от собственного N8-пути). Используется для строки «ставка предоставления» с пометкой
// «проверяется» — см. computeInventory.ts и quoteMatrix.ts.
//
// Reads from process.cwd()/scripts/seed-data (как loadN8TariffData), no DB.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { N8Cell, N8ClassCoeffBelt, N8K4Belt } from "./computeTariffN8";

const SEED_DIR = resolve(process.cwd(), "scripts/seed-data");

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED_DIR, name), "utf8")) as T;
}

/** Distance-only В-belt (вагонная составляющая) — no weight dimension. */
export interface V4Belt {
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly rateRub: number;
}

export interface InventoryTariffData {
  /** И1 grid (₽ за вагон), 2D (weightT × distance). Same shape as N8Cell. */
  readonly i1Grid: readonly N8Cell[];
  /** В4 belts (₽ за вагон), distance-only, класс-независимая. KEPT for backward-compat (ПВ path). */
  readonly v4Belts: readonly V4Belt[];
  /**
   * ВСЕ вагонные составляющие В-парка, по схеме (В1..В15). Все distance-only, класс-независимые
   * (см. tr1-v-belts-full.meta.json). Позволяет провизию для платформы (В1)/крытого (В3) и т.д.
   * без интерполяции — снап к опубликованному поясу. Источник: tr1-v-belts-full.json (verbatim).
   */
  readonly vBeltsByScheme: Readonly<Record<string, readonly V4Belt[]>>;
  /** K1 class-coefficient belts (Табл.2) — same table as N8. */
  readonly classCoeff: readonly N8ClassCoeffBelt[];
  /** K4 отправочный belts (Табл.5) — same table as N8. */
  readonly k4Belts: readonly N8K4Belt[];
}

let cached: InventoryTariffData | null = null;

/** Load (and memoize) the inventory-park (И1 + В) tables. Throws if a seed file is missing. */
export function loadInventoryTariffData(): InventoryTariffData {
  if (cached) return cached;

  const iFile = loadJson<{ belts: N8Cell[] }>("tr1-i-belts-full.json");
  const vFile = loadJson<Array<{ scheme: string } & V4Belt>>("tr1-v-belts-full.json");
  const cls = loadJson<{ classCoeff: N8ClassCoeffBelt[] }>("tr1-k1-full.json");
  const k4 = loadJson<{ distanceCorr: N8K4Belt[] }>("tr1-k4-corrected.json");

  // Group every В-scheme (В1..В15-8) into a snap-able belt list. distOnly, класс-независимые.
  const vBeltsByScheme: Record<string, V4Belt[]> = {};
  for (const b of vFile) {
    const list = vBeltsByScheme[b.scheme] ?? (vBeltsByScheme[b.scheme] = []);
    list.push({ distFromKm: b.distFromKm, distToKm: b.distToKm, rateRub: b.rateRub });
  }

  cached = {
    i1Grid: iFile.belts.filter((b) => b.scheme === "И1"),
    v4Belts: vBeltsByScheme["В4"] ?? [],
    vBeltsByScheme,
    classCoeff: cls.classCoeff,
    k4Belts: k4.distanceCorr,
  };
  return cached;
}
