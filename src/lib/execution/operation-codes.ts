// Operation-code → semantic category normalizer for the execution pipeline.
// Pure logic, no DB import. Movement rows carry a free-form `operationCode`
// (mnemonic, e.g. "УВПП") and/or `operationName` (e.g. "ВЫГРУЗКА НА ПП"). We
// collapse both into a small closed set of categories that the deterministic
// classifier (classify.ts) reasons over. Grounded in DOMAIN_MODEL §8 triggers.

export type OpCategory =
  | "DEPART" // ОТПР / ОТПГР — dispatch (S4→S5)
  | "ARRIVE" // ПРИБ — arrival at a station (S1→S2, S5→S6)
  | "LOAD" // ПОГР — loading (S2/S3→S4)
  | "UNLOAD" // ВЫГР / УВПП — unloading (S6/S7→S8)
  | "EMPTY_DISP" // ПОРПР — empty wagon disposal/forwarding (S9)
  | "UNKNOWN"; // unrecognized — operator review, never silently guessed

// Exact mnemonic codes (after upper+trim). Source A/B/C/D mnemonics from §3.x.
const CODE_MAP: Record<string, OpCategory> = {
  ОТПР: "DEPART",
  ОТПГР: "DEPART",
  ПРИБ: "ARRIVE",
  ПОГР: "LOAD",
  ВЫГР: "UNLOAD",
  УВПП: "UNLOAD",
  ПОРПР: "EMPTY_DISP",
};

// Ordered substring rules for the operationName fallback. Longer/more specific
// markers must precede shorter ones (ОТПГР before ОТПР; ВЫГР/УВПП before generic).
const NAME_RULES: ReadonlyArray<readonly [string, OpCategory]> = [
  ["ОТПГР", "DEPART"],
  ["ОТПР", "DEPART"],
  ["ПОРПР", "EMPTY_DISP"],
  ["ПРИБ", "ARRIVE"],
  ["ПОГР", "LOAD"],
  ["УВПП", "UNLOAD"],
  ["ВЫГР", "UNLOAD"],
];

/**
 * Resolve an operation category. Mnemonic `code` wins (it is canonical); only
 * when it is absent or unrecognized do we scan the human `name` for markers.
 * Returns UNKNOWN when neither yields a match — callers route those to review.
 */
export function categorizeOperation(
  code: string | null | undefined,
  name: string | null | undefined,
): OpCategory {
  const c = code?.trim().toUpperCase();
  if (c && CODE_MAP[c]) return CODE_MAP[c];

  const n = name?.trim().toUpperCase();
  if (n) {
    for (const [marker, category] of NAME_RULES) {
      if (n.includes(marker)) return category;
    }
  }

  return "UNKNOWN";
}
