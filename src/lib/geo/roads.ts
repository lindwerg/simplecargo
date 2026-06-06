// Canonical railway-road registry (GEO Goal 1). Maps every distinct road name
// found in the two seed CSVs to a stable { rzdCode, shortCode, fullNameRu }.
// RF codes are authoritative (Горьковская=24 matches schema comment). CIS codes
// are project-stable, assigned from 100 sorted by name. Pure, no I/O.

export interface RoadEntry {
  rzdCode: number;
  shortCode: string;
  fullNameRu: string;
}

// Authoritative RF roads + the two RF-operator entries (Якутская, Крымская).
const RF_ROADS: readonly RoadEntry[] = [
  { rzdCode: 1, shortCode: "ОКТ", fullNameRu: "Октябрьская" },
  { rzdCode: 10, shortCode: "КЛГ", fullNameRu: "Калининградская" },
  { rzdCode: 17, shortCode: "МСК", fullNameRu: "Московская" },
  { rzdCode: 24, shortCode: "ГОР", fullNameRu: "Горьковская" },
  { rzdCode: 28, shortCode: "СЕВ", fullNameRu: "Северная" },
  { rzdCode: 51, shortCode: "СКВ", fullNameRu: "Северо-Кавказская" },
  { rzdCode: 58, shortCode: "ЮВС", fullNameRu: "Юго-Восточная" },
  { rzdCode: 61, shortCode: "ПРВ", fullNameRu: "Приволжская" },
  { rzdCode: 63, shortCode: "КБШ", fullNameRu: "Куйбышевская" },
  { rzdCode: 76, shortCode: "СВР", fullNameRu: "Свердловская" },
  { rzdCode: 80, shortCode: "ЮУР", fullNameRu: "Южно-Уральская" },
  { rzdCode: 83, shortCode: "ЗСБ", fullNameRu: "Западно-Сибирская" },
  { rzdCode: 88, shortCode: "КРС", fullNameRu: "Красноярская" },
  { rzdCode: 92, shortCode: "ВСБ", fullNameRu: "Восточно-Сибирская" },
  { rzdCode: 94, shortCode: "ЗБК", fullNameRu: "Забайкальская" },
  { rzdCode: 96, shortCode: "ДВС", fullNameRu: "Дальневосточная" },
  { rzdCode: 98, shortCode: "ЯКТ", fullNameRu: "Якутская" },
  { rzdCode: 99, shortCode: "КРМ", fullNameRu: "Крымская" },
];

// CIS/Baltic roads, codes from 100 sorted by Russian name (per spec).
const CIS_ROADS: readonly RoadEntry[] = [
  { rzdCode: 100, shortCode: "АЗ", fullNameRu: "Азербайджанская" },
  { rzdCode: 101, shortCode: "БЧ", fullNameRu: "Белорусская" },
  { rzdCode: 102, shortCode: "ГР", fullNameRu: "Грузинская" },
  { rzdCode: 103, shortCode: "ДОН", fullNameRu: "Донецкая" },
  { rzdCode: 104, shortCode: "КЗХ", fullNameRu: "Казахстанская" },
  { rzdCode: 105, shortCode: "КРГ", fullNameRu: "Кыргызская" },
  { rzdCode: 106, shortCode: "ЛДЗ", fullNameRu: "Латвийская" },
  { rzdCode: 107, shortCode: "ЛГ", fullNameRu: "Литовская" },
  { rzdCode: 108, shortCode: "ЛЬВ", fullNameRu: "Львовская" },
  { rzdCode: 109, shortCode: "МЛД", fullNameRu: "Молдавская" },
  { rzdCode: 110, shortCode: "ОД", fullNameRu: "Одесская" },
  { rzdCode: 111, shortCode: "ПРД", fullNameRu: "Приднепровская" },
  { rzdCode: 112, shortCode: "ТДЖ", fullNameRu: "Таджикская" },
  { rzdCode: 113, shortCode: "ТРК", fullNameRu: "Туркменская" },
  { rzdCode: 114, shortCode: "УЗБ", fullNameRu: "Узбекская" },
  { rzdCode: 115, shortCode: "ЮКЖД", fullNameRu: "Южно-Кавказская" },
  { rzdCode: 116, shortCode: "ЭВР", fullNameRu: "Эстонская" },
  { rzdCode: 117, shortCode: "ЮЖН", fullNameRu: "Южная" },
  { rzdCode: 118, shortCode: "ЮЗ", fullNameRu: "Юго-Западная" },
];

/** Lookup keyed by cleaned, lowercased road name → canonical entry. */
const REGISTRY_BY_NAME: ReadonlyMap<string, RoadEntry> = new Map(
  [...RF_ROADS, ...CIS_ROADS].map((entry) => [entry.fullNameRu.toLowerCase(), entry]),
);

/** Public registry (name → entry), consumed by the seed to upsert roads. */
export const ROAD_REGISTRY: ReadonlyMap<string, RoadEntry> = REGISTRY_BY_NAME;

/** All canonical entries (for the seed's distinct-road upsert). */
export const ALL_ROADS: readonly RoadEntry[] = [...RF_ROADS, ...CIS_ROADS];

// Legal-form wrappers that prefix some raw road names ("ЗАО", "ОАО АК", …).
// Matched as whole tokens via surrounding whitespace/string-edge lookarounds —
// JS `\b` is ASCII-only and does not fire around Cyrillic letters.
const LEGAL_WRAPPER = /(?<=^|\s)(ЗАО|ОАО|ООО|ГП|ФГУП|АК)(?=\s|$)/gi;
// Quote characters used around the entity name inside legal wrappers.
const QUOTES = /[«»"'"„“”]/g;

// Known raw-name → canonical-name fixes that cleaning alone cannot derive.
const NAME_FIXES: ReadonlyMap<string, string> = new Map([
  ["латвийска", "Латвийская"], // registry typo in source CSV
  ["кжд", "Крымская"], // «ФГУП "КЖД"» is the Crimean road
  ["железные дороги якутии", "Якутская"],
  ["южно-кавказская железная дорога", "Южно-Кавказская"],
]);

/**
 * Strips legal-form wrappers and quotes from a raw road name and applies known
 * fixes. Returns a trimmed display-ish name; resolveRoad does the final lookup.
 */
export function cleanRoadName(raw: string): string {
  if (!raw) return "";

  const stripped = raw
    .replace(QUOTES, " ")
    .replace(LEGAL_WRAPPER, " ")
    .replace(/\s+/g, " ")
    .trim();

  const key = stripped.toLowerCase();
  const fixed = NAME_FIXES.get(key);
  if (fixed) return fixed;

  // Drop a trailing "железная дорога" suffix if it survived ("… железная дорога").
  return stripped.replace(/\s*железная дорога\s*$/i, "").trim();
}

/**
 * Resolves a raw road name (as found in the CSV) to a canonical registry entry,
 * or null when the road is unknown. Callers map null → station.roadCode = null.
 */
export function resolveRoad(rawName: string): RoadEntry | null {
  if (!rawName) return null;
  const cleaned = cleanRoadName(rawName);
  return REGISTRY_BY_NAME.get(cleaned.toLowerCase()) ?? null;
}
