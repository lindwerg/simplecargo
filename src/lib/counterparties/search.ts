// PURE fuzzy-search helpers for counterparty matching (Goal 2: "это они?").
// No DB import here on purpose — these are unit-testable without a live Postgres.

export interface CounterpartyMatch {
  id: string;
  name: string;
  roles: string[];
  score: number;
}

// Default trigram similarity cutoff for fuzzy counterparty search. Below this we
// treat a candidate as "not the same client". Overridable via env without going
// through the strict env schema (this knob is operational, not deploy-critical).
export const DEFAULT_SIMILARITY_THRESHOLD = 0.3;

// PURE: parse the env-supplied threshold into a usable number in [0, 1].
// Invalid/empty -> default; out-of-range -> clamped to the [0, 1] bounds.
export function parseThreshold(envVal: string | undefined): number {
  if (envVal === undefined || envVal.trim() === "") {
    return DEFAULT_SIMILARITY_THRESHOLD;
  }
  const parsed = Number(envVal);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SIMILARITY_THRESHOLD;
  }
  if (parsed < 0) return 0;
  if (parsed > 1) return 1;
  return parsed;
}

// PURE: normalize a dictated/typed query — trim ends, collapse internal runs of
// whitespace to a single space. Returns "" for blank input.
export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ");
}
