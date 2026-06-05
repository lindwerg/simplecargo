// Single source of truth for station-name normalization (GEO Goal 1). Used by
// BOTH the seed (to compute stations.nameNormalized + station_aliases
// .aliasNormalized) and the resolver query, so a dictated/typed name lines up
// byte-for-byte with what trigram similarity scores against. Pure, no I/O.

// Strips parenthetical qualifiers like "(ОП.)", "(ПП.)", "(эксп.)", "(б. №9З)".
const PARENTHETICAL = /\([^)]*\)/g;
// Unicode combining marks left over after NFKD decomposition.
const COMBINING_MARKS = /[̀-ͯ]/g;
// Anything that is not a Cyrillic/Latin letter, a digit, or whitespace. Covers
// hyphens, dots, slashes, «», quotes, etc. — all collapsed to a single space so
// "Москва-Сортировочная" and "Москва Сортировочная" normalize identically.
const NON_WORD = /[^\p{L}\p{N}\s]/gu;

/**
 * Collapses any run of whitespace to a single ASCII space and trims the ends.
 */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * Canonical normalization for a station name. Deterministic and idempotent:
 * normalizeStationName(normalizeStationName(x)) === normalizeStationName(x).
 *
 * Steps: trim → uppercase (ru) → Ё→Е → NFKD + strip combining marks → drop
 * parenthetical qualifiers → replace remaining punctuation with spaces → collapse
 * whitespace.
 */
export function normalizeStationName(raw: string): string {
  if (!raw) return "";

  const uppercased = raw.trim().toLocaleUpperCase("ru-RU").replace(/Ё/g, "Е");
  const decomposed = uppercased.normalize("NFKD").replace(COMBINING_MARKS, "");
  const withoutQualifiers = decomposed.replace(PARENTHETICAL, " ");
  const wordsOnly = withoutQualifiers.replace(NON_WORD, " ");

  return normalizeWhitespace(wordsOnly);
}
