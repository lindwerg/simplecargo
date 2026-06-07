// Pure month-picking logic for per-month direction rates (plan §4). Kept free of any DB
// import so it stays unit-testable without env/Postgres — the live query lives in
// ./rateResolve. Mirrors the pricing/resolve (pure) vs pricing/lookup (DB) split.

// A confirmed monthly-rate candidate. Rates stay strings (Postgres NUMERIC); the picker
// only compares months, never the amounts. Callers must pass only `agreed` rows.
export interface MonthlyRateRow {
  effectiveMonth: string; // "2026-05"
  rateClient: string | null;
  rateOwner: string | null;
}

export type RateSource = "monthly_exact" | "monthly_carry" | "direction_legacy" | "psc" | "none";

export interface ResolvedDirectionRate {
  rateClient: number | null;
  rateOwner: number | null;
  source: RateSource;
  effectiveMonth: string | null; // the month the rate was taken from (monthly sources only)
}

// PURE. From the AGREED rows of one direction, pick the row that applies to `month`: the
// exact month if present, else the nearest earlier month (carry-forward — a rate stays in
// force until a newer month supersedes it). Returns the picked row plus whether it was an
// exact or carried match, or null when no agreed row is at or before `month`.
export function pickRateForMonth(
  rows: readonly MonthlyRateRow[],
  month: string,
): { row: MonthlyRateRow; matched: "exact" | "carry" } | null {
  let best: MonthlyRateRow | null = null;
  for (const r of rows) {
    if (r.effectiveMonth === month) {
      return { row: r, matched: "exact" };
    }
    // string comparison is correct for "YYYY-MM" (lexicographic == chronological)
    if (r.effectiveMonth < month) {
      if (best === null || r.effectiveMonth > best.effectiveMonth) best = r;
    }
  }
  return best ? { row: best, matched: "carry" } : null;
}
