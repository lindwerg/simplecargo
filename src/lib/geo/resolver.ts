// Station resolver (GEO Goal 1): turn a dictated/typed name into scored ESR
// candidates for a confirm step. Pure scoring is split from DB I/O so the
// scoring/classification can be unit-tested without a database.

import { sql } from "drizzle-orm";

import { normalizeStationName } from "@/lib/geo/normalize";

export interface StationCandidate {
  esrCode: string;
  name: string;
  nameNormalized: string;
  roadCode: number | null;
  roadName: string | null;
  roadShort: string | null; // RZD short code (e.g. "СВР") — auto-fills the road field
  score: number;
}

// Raw row shape coming out of the trigram query (before scoring/boosting).
export interface ScoringRow {
  esrCode: string;
  name: string;
  nameNormalized: string;
  roadCode: number | null;
  roadName: string | null;
  roadShort: string | null;
  trgmSim: number;
}

export interface ResolveResult {
  status: "exact" | "ambiguous" | "none";
  best?: StationCandidate;
  candidates: StationCandidate[];
}

// Scoring constants (named, not magic numbers).
const PERFECT_SCORE = 1;
const ROAD_HINT_BOOST = 0.15;
// Classification thresholds.
const EXACT_TOP_THRESHOLD = 0.95; // top alone is good enough to auto-accept
const CONFIDENT_TOP_THRESHOLD = 0.55; // top is decent…
const CONFIDENT_GAP_THRESHOLD = 0.12; // …and clearly ahead of the runner-up
const NONE_TOP_THRESHOLD = 0.3; // below this, treat as no match
// DB query tuning.
const SIMILARITY_FLOOR = 0.25; // pg_trgm similarity() cutoff
const CANDIDATE_LIMIT = 8;

function clampScore(value: number): number {
  if (value > PERFECT_SCORE) return PERFECT_SCORE;
  if (value < 0) return 0;
  return value;
}

/**
 * Scores raw trigram rows into ranked candidates. Base score is the trigram
 * similarity; an exact normalized match pins to 1; a matching road hint adds a
 * capped boost. Sorted by score descending (stable on ties via original order).
 */
export function scoreCandidates(
  queryNorm: string,
  rows: readonly ScoringRow[],
  roadHintNorm?: string,
): StationCandidate[] {
  const hint = roadHintNorm ? normalizeStationName(roadHintNorm) : "";

  const scored = rows.map((row) => {
    const isExactName = row.nameNormalized === queryNorm;
    let score = isExactName ? PERFECT_SCORE : row.trgmSim;

    if (hint && row.roadName && normalizeStationName(row.roadName) === hint) {
      score = clampScore(score + ROAD_HINT_BOOST);
    }

    return {
      esrCode: row.esrCode,
      name: row.name,
      nameNormalized: row.nameNormalized,
      roadCode: row.roadCode,
      roadName: row.roadName,
      roadShort: row.roadShort,
      score: clampScore(score),
    };
  });

  return scored.sort((a, b) => b.score - a.score);
}

/**
 * Classifies ranked candidates into exact / ambiguous / none.
 * - exact: top >= 0.95, OR top >= 0.55 and (top - second) >= 0.12
 * - none: empty list, or top < 0.30
 * - ambiguous: everything else
 */
export function classifyResult(candidates: readonly StationCandidate[]): ResolveResult {
  if (candidates.length === 0) {
    return { status: "none", candidates: [] };
  }

  const list = [...candidates];
  const top = list[0];
  const second = list[1];

  if (top.score < NONE_TOP_THRESHOLD) {
    return { status: "none", best: top, candidates: list };
  }

  const gap = top.score - (second?.score ?? 0);
  const isExact =
    top.score >= EXACT_TOP_THRESHOLD ||
    (top.score >= CONFIDENT_TOP_THRESHOLD && gap >= CONFIDENT_GAP_THRESHOLD);

  return { status: isExact ? "exact" : "ambiguous", best: top, candidates: list };
}

/**
 * Resolves a raw station name against the DB. Normalizes the input, runs a
 * trigram-similarity query (also matching exact normalized aliases), then scores
 * and classifies the candidates. The drizzle `db` instance is injected so this
 * stays testable without importing the live client.
 *
 * `db` is typed loosely (the project's drizzle db type) — callers pass
 * `@/lib/db/client`'s `db`. Kept parameterized; no string interpolation.
 */
export async function resolveStationName(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- drizzle db, injected for testability
  db: any,
  raw: string,
  roadHint?: string,
): Promise<ResolveResult> {
  const queryNorm = normalizeStationName(raw);
  if (!queryNorm) {
    return { status: "none", candidates: [] };
  }

  // Top trigram matches on station names, UNION-ed with stations reached via an
  // exact normalized alias (boosted to similarity 1 so confirmed aliases win).
  // roads is LEFT-joined for the human road name used by the road-hint boost.
  const query = sql`
    WITH matches AS (
      SELECT
        s.esr_code AS esr_code,
        s.name_etran AS name,
        s.name_normalized AS name_normalized,
        s.road_code AS road_code,
        r.full_name_ru AS road_name,
        r.short_code AS road_short,
        similarity(s.name_normalized, ${queryNorm}) AS trgm
      FROM stations s
      LEFT JOIN roads r ON r.rzd_code = s.road_code
      WHERE similarity(s.name_normalized, ${queryNorm}) > ${SIMILARITY_FLOOR}
      UNION
      SELECT
        s.esr_code AS esr_code,
        s.name_etran AS name,
        s.name_normalized AS name_normalized,
        s.road_code AS road_code,
        r.full_name_ru AS road_name,
        r.short_code AS road_short,
        1::real AS trgm
      FROM station_aliases a
      JOIN stations s ON s.esr_code = a.esr_code
      LEFT JOIN roads r ON r.rzd_code = s.road_code
      WHERE a.alias_normalized = ${queryNorm}
    )
    SELECT esr_code, name, name_normalized, road_code, road_name, road_short, MAX(trgm) AS trgm
    FROM matches
    GROUP BY esr_code, name, name_normalized, road_code, road_name, road_short
    ORDER BY trgm DESC
    LIMIT ${CANDIDATE_LIMIT}
  `;

  const result = await db.execute(query);
  const rawRows: ReadonlyArray<Record<string, unknown>> = result.rows ?? result;

  const rows: ScoringRow[] = rawRows.map((row) => ({
    esrCode: String(row.esr_code),
    name: String(row.name),
    nameNormalized: String(row.name_normalized),
    roadCode: row.road_code === null || row.road_code === undefined ? null : Number(row.road_code),
    roadName: row.road_name === null || row.road_name === undefined ? null : String(row.road_name),
    roadShort:
      row.road_short === null || row.road_short === undefined ? null : String(row.road_short),
    trgmSim: Number(row.trgm),
  }));

  const candidates = scoreCandidates(queryNorm, rows, roadHint);
  return classifyResult(candidates);
}
