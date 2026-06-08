// Foreign (CIS / Baltic / Central-Asia) station detector.
//
// Every ESR in cis-stations-20201230.csv is a non-RF (foreign administration) station.
// The domestic ТР-1 2026 tariff engine is valid only for RF-internal routes; international
// freight is a different tariff regime (per-administration segmentation, different VAT).
// quoteService uses this to REFUSE a domestic price for a cross-border route instead of
// silently returning a wrong number — the distance may still be shown.
//
// Self-contained on purpose: the seed parser (src/lib/db/seed/stations.ts) imports the DB
// client, which calls loadEnv() and process.exit(1) without env — unusable from a request
// path. We duplicate the tiny quote-aware line parser to avoid that coupling.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SEED_DATA = resolve(process.cwd(), "scripts/seed-data");
const CIS_FILE = "cis-stations-20201230.csv";
const ESR_LENGTH = 6;
const CIS_ESR_FIELD = 3; // 0-based column index of the ESR code in the CIS CSV

/** Quote-aware single-line CSV parser (handles delimiters inside "quoted" fields). */
function parseCsvLine(line: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function toEsr6(rawCode: string): string | null {
  const digits = rawCode.trim();
  if (!digits || !/^\d{1,6}$/.test(digits)) return null;
  return digits.padStart(ESR_LENGTH, "0");
}

let cached: Set<string> | null = null;

/** Load (and memoize) the set of foreign ESR codes. Missing file → empty set (no false positives). */
export function loadForeignEsrSet(): Set<string> {
  if (cached) return cached;
  const set = new Set<string>();
  try {
    const raw = readFileSync(resolve(SEED_DATA, CIS_FILE), "utf8");
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const fields = parseCsvLine(line, ",");
      const esr = toEsr6(fields[CIS_ESR_FIELD] ?? "");
      if (esr) set.add(esr);
    }
  } catch {
    // tolerate a missing CSV — treat nothing as foreign rather than block all routes
  }
  cached = set;
  return cached;
}

/** True when the ESR belongs to a non-RF (CIS/Baltic/Central-Asia) administration. */
export function isForeignEsr(esr: string): boolean {
  return loadForeignEsrSet().has(esr.trim());
}
