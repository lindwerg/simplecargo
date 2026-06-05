// Pure tariff-indexation logic. NO DB import so it stays unit-testable without
// env/Postgres (the live queries live in ./repository). The operator remembers a РЖД
// base 10-01 tariff (₽/wagon, un-indexed, as of effectiveFrom). РЖД periodic increases
// are recorded once (tariff_indexations) and compounded here at resolve time so a
// remembered base recomputes to the current tariff without re-entry.

const PERCENT_DIVISOR = 100;

export interface IndexationLike {
  pct: number;
  effectiveFrom: Date;
  appliesToClass: number | null;
}

interface BaseLike {
  baseAmount: number;
  effectiveFrom: Date | null;
}

// An indexation applies when it is in effect on `onDate`, falls after the base's as-of
// date (so we only compound increases the base hasn't already absorbed), and either
// targets all classes (null) or matches the cargo's freight class.
function isApplicable(
  ix: IndexationLike,
  baseFrom: Date | null,
  onDate: Date,
  freightClass: number | null | undefined,
): boolean {
  if (ix.effectiveFrom.getTime() > onDate.getTime()) return false;
  if (baseFrom !== null && ix.effectiveFrom.getTime() <= baseFrom.getTime()) return false;
  if (ix.appliesToClass !== null && ix.appliesToClass !== (freightClass ?? null)) return false;
  return true;
}

function byEffectiveFromAsc(a: IndexationLike, b: IndexationLike): number {
  return a.effectiveFrom.getTime() - b.effectiveFrom.getTime();
}

// Compound base × Π(1 + pct/100) over every applicable indexation, in effective-date
// order. Rounds to the nearest ruble. A non-positive base is returned untouched.
export function applyIndexations(
  base: number,
  baseFrom: Date | null,
  indexations: readonly IndexationLike[],
  onDate: Date,
  freightClass?: number | null,
): number {
  if (base <= 0) return base;

  const factor = [...indexations]
    .filter((ix) => isApplicable(ix, baseFrom, onDate, freightClass))
    .sort(byEffectiveFromAsc)
    .reduce((acc, ix) => acc * (1 + ix.pct / PERCENT_DIVISOR), 1);

  return Math.round(base * factor);
}

// Convenience wrapper: resolve a remembered base into the indexed ₽ as of `onDate`.
export function resolveTariffBase(
  base: BaseLike,
  indexations: readonly IndexationLike[],
  onDate: Date,
  freightClass?: number | null,
): number {
  return applyIndexations(base.baseAmount, base.effectiveFrom, indexations, onDate, freightClass);
}
