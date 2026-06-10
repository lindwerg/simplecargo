// ─────────────────────────────────────────────────────────────────────────────
// officialPair.ts — L3 of the layered distance-resolution policy
// (docs/planning/DISTANCE_FINAL_ARCHITECTURE.md §1-L3, §2).
//
// DIRECT lookup of an OFFICIALLY PUBLISHED ТП↔ТП pair from the RZD open-data
// base (scripts/seed-data/kniga3-official.json, 99 127 undirected pairs /
// 13 369 points, verbatim from kniga3-tp-official.csv, rlw.gov.ru).
//
// HARD RULES (no-fabrication / money):
//   • L3 fires ONLY when L2 (computeDistance) returned red (km === null) —
//     it NEVER overrides a green/normal engine result (enforced by the caller,
//     repository.ts::resolveDistance).
//   • The official base is NEVER used as graph edges here: NO Dijkstra, NO
//     transitive chaining of pairs, NO relaxation, NO "almost matched". Either
//     the (origin,dest) pair — or a (ТПo,ТПd) pair reached via published
//     Книга-1 station spurs — exists VERBATIM in the index, or L3 passes.
//   • Every returned km traces to published data: spur km are the Книга-1
//     stationLegs' own published offsets; the pair km is verbatim from the CSV.
//   • The result is confidence=YELLOW with a mandatory warning: the base is
//     dated 2023-10-12 and PREDATES Приказ Минтранса №313 (12.09.2024, обход
//     скоростных линий) — e.g. it publishes Хийтола↔Бологое=499 where real
//     billing is 801. Yellow = "official published hint, verify via R-Тариф".
//
// The graph-merge loader (repository.ts::loadKniga3Official) stays GATED OFF
// (DISTANCE_KNIGA3_OFFICIAL) — merging these pairs as edges undercuts three
// квитанция-verified oracles (2444→834, 1432→930, 3108→3095). This module is
// the only sanctioned consumer of the file: a pair MAP, not a graph.
// ─────────────────────────────────────────────────────────────────────────────

import type { DistanceData } from "./computeDistance";
import type { DistanceInput, DistanceLeg, DistanceResult } from "./schema";

/** Raw row shape of kniga3-official.json. */
export interface OfficialPairRow {
  readonly aEsr?: string;
  readonly bEsr?: string;
  readonly km?: number;
}

/** Undirected pair index: pairKey(a,b) → published km. */
export type OfficialPairIndex = ReadonlyMap<string, number>;

/** Mandatory caveat attached to every L3 (yellow) result. */
export const OFFICIAL_PAIR_WARNING =
  "официальная пара 2023 (rlw.gov.ru, до Приказа Минтранса №313 от 12.09.2024) — сверьте по R-Тариф";

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** ТР-4 rounding (same as computeDistance). */
function roundKm(km: number): number {
  return Math.floor(km + 0.5);
}

/**
 * Builds the undirected pair index from the raw official rows.
 * Duplicate pairs keep the SMALLER published km (the file is directed-deduped
 * upstream, so this is a defensive tie-break among verbatim values only —
 * never a computed/derived number).
 */
export function buildOfficialPairIndex(rows: ReadonlyArray<OfficialPairRow>): OfficialPairIndex {
  const index = new Map<string, number>();
  for (const r of rows) {
    if (!r.aEsr || !r.bEsr || r.km == null) continue;
    const key = pairKey(r.aEsr, r.bEsr);
    const prev = index.get(key);
    if (prev == null || r.km < prev) index.set(key, r.km);
  }
  return index;
}

/** One candidate attachment: station → ТП via a published Книга-1 spur (or itself, 0 km). */
interface SpurCandidate {
  readonly tpEsr: string;
  readonly km: number;
}

/**
 * Published spur candidates for a station: its compiled Книга-1 stationLegs
 * (same base L2 uses, incl. transit-attach / cis-spurs / crimea legs) PLUS the
 * degenerate self-candidate (the station IS the ТП, spur 0 km — definitionally
 * zero, no invented km; covers points like raw official ТП with no self-leg).
 */
function spurCandidates(data: DistanceData, esr: string): SpurCandidate[] {
  const out: SpurCandidate[] = [{ tpEsr: esr, km: 0 }];
  const legs = data.compiled?.stationLegs.get(esr);
  if (legs) {
    for (const l of legs) out.push({ tpEsr: l.uzelEsr, km: l.km });
  }
  return out;
}

/**
 * officialPairLookup — L3 direct lookup. Returns a YELLOW result or null.
 *
 * Mechanics (strictly per the spec — no path search):
 *   1. (originEsr, destEsr) verbatim in the index → km = pairKm.
 *   2. Else for each published origin spur `origin → ТПo (kmO)` and dest spur
 *      `dest → ТПd (kmD)`: if (ТПo, ТПd) is verbatim in the index, the combo
 *      yields kmO + pairKm + kmD. Minimum over MATCHED combos is returned
 *      (a choice among verbatim published pairs — not a path search).
 *   3. Nothing matched verbatim → null (caller falls through to L4 red).
 */
export function officialPairLookup(
  input: DistanceInput,
  data: DistanceData,
  index: OfficialPairIndex,
): DistanceResult | null {
  if (index.size === 0) return null;
  const { originEsr, destEsr } = input;
  const warnings = [OFFICIAL_PAIR_WARNING];

  // 1) Verbatim direct pair.
  const direct = index.get(pairKey(originEsr, destEsr));
  if (direct != null) {
    return {
      km: roundKm(direct),
      legs: [{ kind: "direct", fromEsr: originEsr, toEsr: destEsr, km: direct }],
      confidence: "yellow",
      warnings,
    };
  }

  // 2) Station-leg-adjusted pair: spur-origin + verbatim (ТПo,ТПd) + spur-dest.
  let bestKm = Infinity;
  let best: { readonly o: SpurCandidate; readonly d: SpurCandidate; readonly pairKm: number } | null = null;
  for (const o of spurCandidates(data, originEsr)) {
    for (const d of spurCandidates(data, destEsr)) {
      if (o.tpEsr === d.tpEsr) continue; // self-pair is never published; not a lookup
      const pairKm = index.get(pairKey(o.tpEsr, d.tpEsr));
      if (pairKm == null) continue; // verbatim or nothing — no chaining, no relaxation
      const total = o.km + pairKm + d.km;
      if (total < bestKm) {
        bestKm = total;
        best = { o, d, pairKm };
      }
    }
  }
  if (!best) return null; // 3) L3 passes → L4 red

  const legs: DistanceLeg[] = [];
  if (best.o.km > 0) {
    legs.push({ kind: "spur-origin", fromEsr: originEsr, toEsr: best.o.tpEsr, km: best.o.km });
  }
  legs.push({ kind: "direct", fromEsr: best.o.tpEsr, toEsr: best.d.tpEsr, km: best.pairKm });
  if (best.d.km > 0) {
    legs.push({ kind: "spur-dest", fromEsr: best.d.tpEsr, toEsr: destEsr, km: best.d.km });
  }
  return { km: roundKm(bestKm), legs, confidence: "yellow", warnings };
}
