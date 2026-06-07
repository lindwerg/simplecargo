// Pure coefficient logic for ТР-1 2026 (TARIFF_CALCULATOR §2.4, §2.6). NO DB import —
// every table is passed in as an argument so this unit-tests without Postgres. The
// Drizzle load lives in ./repository.
//
// K1 is a (class, distance) TABLE with the "max-of-two" rule (pt 16.7.3): for the
// cargo's class find the class_coeff belt covering L, find the distance_corr belt
// covering L, and take the MAX of the two. It is NOT a scalar — class 1 and class 3
// vary by distance; class 2 = 1.0 is the only safe constant.
//
// Indexation compounding mirrors src/lib/tariffs/resolve.ts applyIndexations: ∏(1 +
// pct/100) over applicable rows, in effective-date order. The coefficient stack
// (порожний ×1.1, container, Минстрой) is a separate multiplicative set, gated by
// `applies_to` discriminator and date window.

import type { FreightClass } from "./schema";

export const SCALAR_CLASS_2_K1 = 1.0; // the only safe scalar (class 2 = 1.0)

// ── K1: (class, distance) max-of-two ─────────────────────────────────────────────

/** class_coeff belt: K1 contribution for a freight class over [from, to] km. */
export interface ClassCoeffBelt {
  readonly freightClass: FreightClass;
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly k1: number;
}

/** distance_corr belt (Таблица 5 long-haul taper) over [from, to] km. */
export interface DistanceCorrBelt {
  readonly distFromKm: number;
  readonly distToKm: number;
  readonly kTable5: number;
}

export interface K1Result {
  readonly k1: number;
  readonly found: boolean;
  readonly warning?: string;
}

function beltCovers(from: number, to: number, distanceKm: number): boolean {
  return distanceKm >= from && distanceKm <= to;
}

function findClassCoeff(
  belts: readonly ClassCoeffBelt[],
  freightClass: FreightClass,
  distanceKm: number,
): number | null {
  const hit = belts.find(
    (b) =>
      b.freightClass === freightClass && beltCovers(b.distFromKm, b.distToKm, distanceKm),
  );
  return hit ? hit.k1 : null;
}

function findDistanceCorr(
  belts: readonly DistanceCorrBelt[],
  distanceKm: number,
): number | null {
  const hit = belts.find((b) => beltCovers(b.distFromKm, b.distToKm, distanceKm));
  return hit ? hit.kTable5 : null;
}

/**
 * K1(class, L) via the max-of-two rule. Reads the class_coeff belt for the class and the
 * distance_corr belt for L, returns the MAX. NEVER guesses: a missing belt yields
 * `found: false` + warning so the orchestrator drops confidence to 'red'. Distance-corr
 * is optional — when the taper table is empty the class coefficient alone applies, but a
 * missing CLASS belt is fatal (we do not fall back to a scalar).
 */
export function computeK1(
  classBelts: readonly ClassCoeffBelt[],
  corrBelts: readonly DistanceCorrBelt[],
  freightClass: FreightClass,
  distanceKm: number,
): K1Result {
  const classK = findClassCoeff(classBelts, freightClass, distanceKm);
  if (classK === null) {
    return {
      k1: 1,
      found: false,
      warning: `K1: нет class_coeff для класса ${freightClass} на ${distanceKm} км`,
    };
  }

  const corrK = findDistanceCorr(corrBelts, distanceKm);
  if (corrK === null) {
    // Taper table not seeded for this belt → class coefficient stands alone (max-of-one).
    return {
      k1: classK,
      found: true,
      warning: `K1: нет distance_corr на ${distanceKm} км — применён только class_coeff`,
    };
  }

  return { k1: Math.max(classK, corrK), found: true };
}

// ── Indexation compounding (mirrors src/lib/tariffs/resolve.ts) ──────────────────

const PERCENT_DIVISOR = 100;

export interface IndexationLike {
  readonly pct: number;
  readonly effectiveFrom: Date;
  readonly appliesToClass: number | null;
}

function isIndexApplicable(
  ix: IndexationLike,
  onDate: Date,
  freightClass: FreightClass,
): boolean {
  if (ix.effectiveFrom.getTime() > onDate.getTime()) return false;
  if (ix.appliesToClass !== null && ix.appliesToClass !== freightClass) return false;
  return true;
}

/**
 * ∏(1 + pct/100) over indexations in effect on `onDate` and matching the class (or
 * class-agnostic). Returns the bare factor (not the indexed amount) so the orchestrator
 * can report it in the breakdown. No base date filter here: ТР-1 2026 is the indexed
 * base itself, so applicable 2026+ indexations compound onto the computed без-НДС total.
 */
export function indexFactor(
  indexations: readonly IndexationLike[],
  onDate: Date,
  freightClass: FreightClass,
): number {
  return indexations
    .filter((ix) => isIndexApplicable(ix, onDate, freightClass))
    .reduce((acc, ix) => acc * (1 + ix.pct / PERCENT_DIVISOR), 1);
}

// ── Coefficient stack (порожний / container / Минстрой) ──────────────────────────

export type CoefAppliesTo = "all" | "porozhny" | "container" | "minstroy" | "class" | "own_gondola";

export interface CoefficientLike {
  readonly multiplier: number;
  readonly appliesTo: CoefAppliesTo;
  readonly appliesToClass: number | null;
  readonly effectiveFrom: Date | null;
  readonly effectiveTo: Date | null;
}

/** Which coefficient buckets are active for this shipment (gates `applies_to`). */
export interface CoefContext {
  readonly onDate: Date;
  readonly freightClass: FreightClass;
  readonly isContainer: boolean;
  readonly isPorozhny: boolean; // empty-run leg / own-wagon порожний component
  /** Wagon ownership ('own' | 'rzd') — required for own_gondola gating. */
  readonly ownership?: string;
  /** Wagon type code (e.g. 'ПВ', 'ПЛ') — required for own_gondola gating. */
  readonly wagonType?: string;
}

function isDateInWindow(coef: CoefficientLike, onDate: Date): boolean {
  if (coef.effectiveFrom && coef.effectiveFrom.getTime() > onDate.getTime()) return false;
  if (coef.effectiveTo && coef.effectiveTo.getTime() < onDate.getTime()) return false;
  return true;
}

function isCoefApplicable(coef: CoefficientLike, ctx: CoefContext): boolean {
  if (!isDateInWindow(coef, ctx.onDate)) return false;

  switch (coef.appliesTo) {
    case "all":
      return true;
    case "minstroy":
      return true; // discount applies broadly within its date window (e.g. минстрой 2025)
    case "container":
      return ctx.isContainer;
    case "porozhny":
      return ctx.isPorozhny;
    case "class":
      return coef.appliesToClass === ctx.freightClass;
    case "own_gondola":
      // п.18.1.1 ТР-1 2026: class-keyed И-component factor for own полувагон (ПВ).
      // Applies only when ownership='own' AND wagonType='ПВ'; class-gated if appliesToClass set.
      if (ctx.ownership !== "own" || ctx.wagonType !== "ПВ") return false;
      return coef.appliesToClass === null || coef.appliesToClass === ctx.freightClass;
    default:
      return false;
  }
}

/**
 * ∏(multiplier) over every active coefficient (container ×1.05, порожний ×1.1, Минстрой
 * ×0.9492 within window, …). Returns the bare product (1 when none apply). Date-windowed
 * and bucket-gated so an expired/irrelevant coef is silently skipped — these are known
 * multipliers, not missing data, so no warning is raised here.
 */
export function coefficientStack(
  coefficients: readonly CoefficientLike[],
  ctx: CoefContext,
): number {
  return coefficients
    .filter((c) => isCoefApplicable(c, ctx))
    .reduce((acc, c) => acc * c.multiplier, 1);
}
