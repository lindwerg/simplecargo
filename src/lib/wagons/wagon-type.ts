/**
 * Canonical wagon-type registry + recognizer (Goal 3: wagon type is a first-class,
 * voice/text-recognized field on every ПСЦ row and заявка line).
 *
 * The registry is the single source of truth for the closed set of rolling-stock
 * types this forwarder books. `normalizeWagonType` collapses noisy operator input —
 * typed shorthand, dictated voice transcripts, English transliterations, plurals,
 * stray punctuation — down to one canonical { code, label }.
 *
 * Conventions:
 *  - `code` is a short uppercase Cyrillic mnemonic (e.g. "ПВ"), stable enough to
 *    live in a DB `text` column guarded by a CHECK over these codes.
 *  - `synonyms` are stored lowercased; matching is case/space/punctuation tolerant.
 *  - No DB, no I/O — pure functions, safe to call from server, client, or AI intake.
 */

/** One canonical rolling-stock type and the noisy strings that should resolve to it. */
export interface WagonType {
  /** Short uppercase Cyrillic mnemonic, e.g. "ПВ". Stable DB-facing identifier. */
  readonly code: string;
  /** Human-facing Russian label, e.g. "Полувагон". */
  readonly label: string;
  /** Lowercased synonyms, abbreviations, plurals, and voice-likely misspellings. */
  readonly synonyms: readonly string[];
}

/**
 * The closed set of wagon types. Order matters only for tie-breaking on `includes`
 * matches: earlier entries win, so the broad/common types lead.
 */
export const WAGON_TYPES: readonly WagonType[] = [
  {
    code: "ПВ",
    label: "Полувагон",
    synonyms: ["пв", "полувагон", "полу вагон", "полувагоны", "полувагона", "gondola"],
  },
  {
    code: "ПЛ",
    label: "Платформа",
    synonyms: ["пл", "платформа", "платформы", "платформу", "platform", "flatcar"],
  },
  {
    code: "ФП",
    label: "Фитинговая платформа",
    synonyms: [
      "фп",
      "фитинг",
      "фитинговая",
      "фитинговая платформа",
      "фитинговый",
      "фитинговая платформы",
      "fitting platform",
    ],
  },
  {
    code: "КР",
    label: "Крытый вагон",
    synonyms: ["кр", "крытый", "крытый вагон", "крыт", "крытые", "крытый вагоны", "covered", "boxcar"],
  },
  {
    code: "ЦС",
    label: "Цистерна",
    synonyms: ["цс", "цистерна", "цистерны", "цистерну", "cisterna", "tank", "нефтебензиновая"],
  },
  {
    code: "ХП",
    label: "Хоппер",
    synonyms: ["хп", "хоппер", "хопперы", "хоппера", "хопер", "hopper"],
  },
  {
    code: "ХМ",
    label: "Хоппер-минераловоз",
    synonyms: ["хм", "минераловоз", "хоппер минераловоз", "хоппер-минераловоз", "минераловозы"],
  },
  {
    code: "ХЗ",
    label: "Хоппер-зерновоз",
    synonyms: ["хз", "зерновоз", "хоппер зерновоз", "хоппер-зерновоз", "зерновозы", "зерновик"],
  },
  {
    code: "ХЦ",
    label: "Хоппер-цементовоз",
    synonyms: ["хц", "цементовоз", "хоппер цементовоз", "хоппер-цементовоз", "цементовозы"],
  },
  {
    code: "ДМ",
    label: "Думпкар",
    synonyms: ["дм", "думпкар", "думпкары", "вагон самосвал", "вагон-самосвал", "самосвал", "dumpcar"],
  },
  {
    code: "РФ",
    label: "Рефрижератор",
    synonyms: ["рф", "рефрижератор", "реф", "рефы", "рефрижераторы", "рефвагон", "reefer"],
  },
  {
    code: "ОК",
    label: "Окатышевоз",
    synonyms: ["ок", "окатышевоз", "окатыш", "окатышевозы", "think-tank", "think tank"],
  },
  {
    code: "ТР",
    label: "Транспортёр",
    synonyms: ["тр", "транспортер", "транспортёр", "транспортеры", "транспортёры", "transporter"],
  },
  {
    code: "КН",
    label: "Контейнеровоз",
    synonyms: ["кн", "контейнеровоз", "контейнеровозы", "контейнерная", "container car", "containervoz"],
  },
] as const;

/** Punctuation/symbol characters stripped before matching (kept Cyrillic + Latin + digits + space). */
const PUNCTUATION = /[^\p{L}\p{N}\s]+/gu;

/** Collapse runs of whitespace to a single space. */
const WHITESPACE = /\s+/g;

/**
 * Lowercase, drop punctuation, and collapse whitespace.
 * `"  Крытый вагон!! "` → `"крытый вагон"`. Cyrillic-safe.
 */
function canonicalize(raw: string): string {
  return raw
    .toLowerCase()
    .replace(PUNCTUATION, " ")
    .replace(WHITESPACE, " ")
    .trim();
}

/** All match targets for one type: its lowercased code plus every synonym. */
function matchTargets(type: WagonType): readonly string[] {
  return [type.code.toLowerCase(), ...type.synonyms];
}

/**
 * Resolve noisy operator/voice input to a canonical wagon type, or `null`.
 *
 * Matching is layered, strictest first, so confident hits beat loose substring noise:
 *   1. exact match against the code or any synonym
 *   2. a target that the input starts with (e.g. "полувагон 4 шт" → ПВ)
 *   3. the input contains a target (e.g. "нужен крытый под груз" → КР)
 *
 * Returns `null` (no confident match) for empty/blank input, `null`/`undefined`,
 * or anything that hits no target ("банан" → null). The full record is intentionally
 * not returned — callers persist the canonical { code, label } pair only.
 */
export function normalizeWagonType(
  raw: string | null | undefined,
): { code: string; label: string } | null {
  if (raw === null || raw === undefined) return null;

  const text = canonicalize(raw);
  if (text.length === 0) return null;

  // 1. exact match on code or synonym.
  for (const type of WAGON_TYPES) {
    if (matchTargets(type).includes(text)) {
      return { code: type.code, label: type.label };
    }
  }

  // 2. input begins with a known target — guard against 1-char false positives.
  for (const type of WAGON_TYPES) {
    for (const target of matchTargets(type)) {
      if (target.length >= 2 && text.startsWith(target)) {
        return { code: type.code, label: type.label };
      }
    }
  }

  // 3. input contains a known target somewhere — only for substantial targets.
  for (const type of WAGON_TYPES) {
    for (const target of matchTargets(type)) {
      if (target.length >= 3 && text.includes(target)) {
        return { code: type.code, label: type.label };
      }
    }
  }

  return null;
}

/** Canonical label for a code, or `undefined` if the code is not registered. */
export function wagonTypeLabel(code: string): string | undefined {
  return WAGON_TYPES.find((type) => type.code === code)?.label;
}

/** Whether `code` is one of the registered canonical wagon-type codes. */
export function isKnownWagonType(code: string): boolean {
  return WAGON_TYPES.some((type) => type.code === code);
}
