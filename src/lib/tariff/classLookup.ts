// Pure ЕТСНГ → {class, МВН} dictionary lookup + chargeable-tonnage floor
// (TARIFF_CALCULATOR §2.5). NO DB import — the каталог is passed in as an argument so
// this unit-tests without Postgres. The Drizzle load lives in ./repository.
//
// Class (1/2/3) is a per-position attribute (Таблица №1), NOT encoded in the 6-digit
// code. МВН (минимальная весовая норма) is multi-form: a single number, a per-wagon-
// type triplet, or "gp" (= по грузоподъёмности, full carrying capacity). It sets the
// повагонная floor: chargeable_tons = max(actual_weight, МВН). When МВН is "gp" there
// is no numeric floor to apply here (capacity is wagon-specific), so actual weight stands.

import type { FreightClass } from "./schema";

/** "gp" sentinel = МВН по грузоподъёмности (full carrying capacity, wagon-specific). */
export const MVN_BY_CAPACITY = "gp" as const;

export type MvnValue = number | typeof MVN_BY_CAPACITY;

/** Parsed per-wagon-type МВН map. Keys mirror seed JSON (kr/pv/pl/default). */
export interface MvnByWagon {
  readonly kr?: MvnValue;
  readonly pv?: MvnValue;
  readonly pl?: MvnValue;
  readonly default?: MvnValue;
}

/** One ЕТСНГ row as the pure core needs it (mirrors the `etsng` table, sans metadata). */
export interface EtsngEntry {
  readonly code: string;
  readonly name: string;
  readonly tariffClass: FreightClass;
  readonly mvnByWagon: MvnByWagon | null;
}

export interface ClassLookupResult {
  readonly tariffClass: FreightClass;
  readonly mvn: MvnValue | null;
  readonly found: boolean;
}

// Canonical wagon-type code → МВН map key. Only the codes that carry a distinct МВН
// form in Таблица №1 are mapped; everything else falls back to `default`.
const WAGON_CODE_TO_MVN_KEY: Readonly<Record<string, keyof MvnByWagon>> = {
  КР: "kr",
  ПВ: "pv",
  ПЛ: "pl",
};

/**
 * Resolve the applicable МВН for a wagon type from a per-wagon-type map.
 * Tries the wagon-specific slot first, then `default`. Returns null when neither is set
 * (caller treats null as "no floor" and uses actual weight).
 */
export function resolveMvn(
  mvnByWagon: MvnByWagon | null | undefined,
  wagonType: string,
): MvnValue | null {
  if (!mvnByWagon) return null;

  const key = WAGON_CODE_TO_MVN_KEY[wagonType];
  if (key !== undefined && mvnByWagon[key] !== undefined) {
    return mvnByWagon[key] as MvnValue;
  }
  return mvnByWagon.default ?? null;
}

/**
 * Look up class + МВН for a code in an injected каталог. Returns `found: false` (and
 * leaves tariffClass at the caller-supplied unknown) so the orchestrator can emit a
 * 'red' warning instead of guessing. When found, class and the wagon-resolved МВН stand.
 */
export function classLookup(
  catalog: ReadonlyMap<string, EtsngEntry>,
  etsngCode: string,
  wagonType: string,
): ClassLookupResult {
  const entry = catalog.get(etsngCode);
  if (!entry) {
    return { tariffClass: 2, mvn: null, found: false };
  }
  return {
    tariffClass: entry.tariffClass,
    mvn: resolveMvn(entry.mvnByWagon, wagonType),
    found: true,
  };
}

/**
 * Повагонная floor: chargeable_tons = max(actual_weight, МВН).
 * A "gp" МВН has no numeric floor here (capacity is wagon-specific) → actual stands.
 * A null МВН (unknown / not seeded) likewise leaves actual weight untouched.
 */
export function chargeableTons(actualWeightTons: number, mvn: MvnValue | null): number {
  if (mvn === null || mvn === MVN_BY_CAPACITY) return actualWeightTons;
  return Math.max(actualWeightTons, mvn);
}

/** Build a code→entry Map from an array (convenience for repository + tests). */
export function buildEtsngCatalog(
  entries: readonly EtsngEntry[],
): Map<string, EtsngEntry> {
  return new Map(entries.map((e) => [e.code, e]));
}
