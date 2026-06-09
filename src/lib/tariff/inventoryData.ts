// Server-side loader for the INVENTORY-park (общий парк РЖД) tariff tables.
//
// REBUILT (ENGINE FIX 3, 2026-06-09): the инвентарный (общий) парк провозная плата is the
// CERTIFIED R-Тариф structure, validated to the kopeck against two real R-Тариф v19.59 oracles
// (reference-quotes-batch-0609.json inventory_cases): INV-1 повагонная=110170, INV-6_20
// групповая=105804 (Тёплая Гора→Койты, 1409 км, 70т, щебень class 1). The plata is:
//
//   Схема8(груженый, по расчётной массе, ±K4 на СЫРОЙ базе, БЕЗ коэф.рода) × K1 × 0,77 × 0,909 × 1,01
//   + Схема25(1)(порожний за 60% расстояния, per-axle база ±K4 × 1,06 × 1,01 × оси)
//   + СхемаВ(scheme)(расстояние) × 1,01
//   − скидка 754
//   НДС последним.
//
// The loaded leg reads the N8 GRID (Прил.N2 scheme N8, the SAME grid as the own-полувагон path,
// base 107178 @ 70т/1409) — NOT the old И1 grid. The empty leg reads the порожний per-axle base
// belts (scheme 25(1) for ПВ <19.6м). The В leg is distance-only, class-independent.
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

/** Порожний per-axle base belt (схема 25/25(1)/...), за один вагон по поясу расстояния. */
export interface EmptyRunBaseBelt {
  readonly scheme: string;
  readonly axles: number;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly rateRub: number;
}

export interface InventoryTariffData {
  /**
   * N8 grid (₽ за вагон), 2D (weightT × distance) — Прил.N2 scheme N8, base 107178 @ 70т/1409.
   * The CERTIFIED loaded-leg base for the rebuilt инвентарный path (replaces the old И1 grid).
   */
  readonly n8Grid: readonly N8Cell[];
  /** В4 belts (₽ за вагон), distance-only, класс-независимая. KEPT for backward-compat (ПВ path). */
  readonly v4Belts: readonly V4Belt[];
  /**
   * ВСЕ вагонные составляющие В-парка, по схеме (В1..В15). Все distance-only, класс-независимые
   * (см. tr1-v-belts-full.meta.json). Позволяет провизию для платформы (В1)/крытого (В3) и т.д.
   * без интерполяции — снап к опубликованному поясу. Источник: tr1-v-belts-full.json (verbatim).
   */
  readonly vBeltsByScheme: Readonly<Record<string, readonly V4Belt[]>>;
  /**
   * Порожний per-axle base belts по схеме (25 / 25(1) / 26 / ...), за вагон по поясу расстояния.
   * Источник: tr1-empty-run-full.json (verbatim, ФАС 894/25 Прил.N2 схемы N25-N29).
   */
  readonly emptyBeltsByScheme: Readonly<Record<string, readonly EmptyRunBaseBelt[]>>;
  /** K1 class-coefficient belts (Табл.2) — same table as N8. */
  readonly classCoeff: readonly N8ClassCoeffBelt[];
  /** K4 отправочный belts (Табл.5) — same table as N8. */
  readonly k4Belts: readonly N8K4Belt[];
}

let cached: InventoryTariffData | null = null;

/** Load (and memoize) the inventory-park tables (N8 grid + В + порожний). Throws if a seed file is missing. */
export function loadInventoryTariffData(): InventoryTariffData {
  if (cached) return cached;

  const n8File = loadJson<{ schemeN8_weightDist: N8Cell[] }>("tr1-n8-corrected.json");
  const vFile = loadJson<Array<{ scheme: string } & V4Belt>>("tr1-v-belts-full.json");
  const cls = loadJson<{ classCoeff: N8ClassCoeffBelt[] }>("tr1-k1-full.json");
  const k4 = loadJson<{ distanceCorr: N8K4Belt[] }>("tr1-k4-corrected.json");
  const emptyFile = loadJson<EmptyRunBaseBelt[]>("tr1-empty-run-full.json");

  // Group every В-scheme (В1..В15-8) into a snap-able belt list. distOnly, класс-независимые.
  const vBeltsByScheme: Record<string, V4Belt[]> = {};
  for (const b of vFile) {
    const list = vBeltsByScheme[b.scheme] ?? (vBeltsByScheme[b.scheme] = []);
    list.push({ distFromKm: b.distFromKm, distToKm: b.distToKm, rateRub: b.rateRub });
  }

  // Group every порожний scheme (25 / 25(1) / ...) into a snap-able per-axle base belt list.
  const emptyBeltsByScheme: Record<string, EmptyRunBaseBelt[]> = {};
  const emptyArr = Array.isArray(emptyFile)
    ? emptyFile
    : ((emptyFile as { belts?: EmptyRunBaseBelt[] }).belts ?? []);
  for (const b of emptyArr) {
    const list = emptyBeltsByScheme[b.scheme] ?? (emptyBeltsByScheme[b.scheme] = []);
    list.push(b);
  }

  cached = {
    n8Grid: n8File.schemeN8_weightDist,
    v4Belts: vBeltsByScheme["В4"] ?? [],
    vBeltsByScheme,
    emptyBeltsByScheme,
    classCoeff: cls.classCoeff,
    k4Belts: k4.distanceCorr,
  };
  return cached;
}
