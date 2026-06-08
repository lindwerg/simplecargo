// Parses the «Транзитные пункты» column (field[4]) of the station CSVs into a
// discriminated union (design doc §3.2, §5). The field is a CONFIRMED clean
// union — never a mix — of exactly two shapes:
//
//   • the literal "ТП"            → this station IS a transit point (no neighbors)
//   • a comma-list of "Name-km"   → nearest ТП(s) + radial spur km, e.g.
//                                    "Кандалакша-91, Кола-171"
//
// Pure, no I/O. The CALLER is responsible for splitting the raw CSV row with the
// repo's quote-aware `parseCsvLine` (src/lib/db/seed/stations.ts) BEFORE handing
// field[4] here — that parser already protects the 627 CIS ТП rows whose
// administration names embed commas (e.g. ЗАО "Южно-Кавказская железная дорога").
// We only need `normalizeStationName` for the spur endpoint names.

import { normalizeStationName } from "@/lib/geo/normalize";

/** The literal token that flags a row as a transit point itself. */
const TP_LITERAL = "ТП";

/** Splits the comma-list of spur tokens; whitespace around items is tolerated. */
const SPUR_SEPARATOR = ",";

/** Last hyphen splits a (possibly multi-hyphen) name from its trailing km. */
const NAME_KM_SPLIT = "-";

/** One radial spur edge: a nearest transit point and the km to reach it. */
export interface Spur {
  /** Normalized station name of the transit point (via normalizeStationName). */
  readonly name: string;
  /** Spur distance in km. `-0` («own ТП») yields 0. Always >= 0. */
  readonly km: number;
}

/** This station is itself a transit point — it carries no neighbor list. */
export interface TransitPointField {
  readonly kind: "tp";
}

/** This station has a radial spur list to one or more nearest transit points. */
export interface SpursField {
  readonly kind: "spurs";
  readonly spurs: readonly Spur[];
}

/** Discriminated result of parsing field[4]. */
export type TransitField = TransitPointField | SpursField;

/**
 * Splits a single "Name-km" token on its LAST hyphen, so multi-hyphen station
 * names survive intact: "Комсомольск-Сортировочный-216" → name
 * "Комсомольск-Сортировочный", km 216. "Кандалакша-0" → km 0 (own ТП).
 *
 * Returns `null` for tokens that do not end in `-<integer>` so the caller can
 * skip them rather than fabricate a km. Negative km is rejected; "-0" is the
 * only zero-form and is treated as km 0.
 */
function parseNameKmToken(token: string): Spur | null {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const lastHyphen = trimmed.lastIndexOf(NAME_KM_SPLIT);
  if (lastHyphen <= 0 || lastHyphen === trimmed.length - 1) return null;

  const rawName = trimmed.slice(0, lastHyphen);
  const rawKm = trimmed.slice(lastHyphen + 1);

  // km must be a non-negative integer; anything else is corrupt → skip.
  if (!/^\d+$/.test(rawKm)) return null;
  const km = Number.parseInt(rawKm, 10);

  const name = normalizeStationName(rawName);
  if (!name) return null;

  return { name, km };
}

/**
 * Parse the already-split field[4] of a station CSV row.
 *
 * - `"ТП"` (any surrounding whitespace) → { kind: 'tp' }.
 * - a comma-list of `Name-km` tokens → { kind: 'spurs', spurs }, with every
 *   well-formed token normalized; malformed tokens are dropped defensively.
 * - empty / blank / all-malformed input → { kind: 'spurs', spurs: [] } so the
 *   caller (seed) can branch on `spurs.length === 0` and quarantine the ~10,660
 *   residual rows that carry neither a spur list nor the ТП flag.
 */
export function parseTransitField(field4: string | null | undefined): TransitField {
  const raw = (field4 ?? "").trim();

  if (raw === TP_LITERAL) return { kind: "tp" };

  const spurs = raw
    .split(SPUR_SEPARATOR)
    .map(parseNameKmToken)
    .filter((spur): spur is Spur => spur !== null);

  return { kind: "spurs", spurs };
}
