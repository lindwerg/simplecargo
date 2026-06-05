import type { PscSide } from "./side";

// Pure rate-selection logic. Kept free of any DB import so it stays unit-testable
// without env/Postgres (the live query lives in ./lookup).

// A candidate rate line joined with its protocol's versioning metadata. `rate` stays
// a string (Postgres NUMERIC) — recency selection never inspects the amount.
export interface CandidateRate {
  protocolId: string;
  rate: string;
  status: string; // 'active' | 'superseded'
  validFrom: Date | null;
  protocolDate: Date | null;
}

export interface ResolveRateCriteria {
  counterpartyId: string;
  side: PscSide;
  originRaw: string;
  destRaw: string;
  wagonType: string;
  onDate?: Date;
}

export interface ResolvedRate {
  protocolId: string;
  rate: number;
}

function effectiveDate(c: CandidateRate): number {
  const d = c.validFrom ?? c.protocolDate;
  return d ? d.getTime() : 0;
}

// From candidates already matched on (counterparty, side, route, wagon_type), pick
// the applicable line. Prefer status='active'; among those honor an optional as-of
// date (skip lines whose validFrom is in the future); pick the newest by
// validFrom/protocolDate. Returns null when nothing applies.
export function selectApplicableRate(
  candidates: readonly CandidateRate[],
  opts: { onDate?: Date } = {},
): CandidateRate | null {
  const onMs = opts.onDate ? opts.onDate.getTime() : undefined;

  const eligible = candidates.filter((c) => {
    if (c.status !== "active") return false;
    if (onMs !== undefined && c.validFrom && c.validFrom.getTime() > onMs) return false;
    return true;
  });
  if (eligible.length === 0) return null;

  return eligible.reduce((best, c) => (effectiveDate(c) > effectiveDate(best) ? c : best));
}
