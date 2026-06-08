// Server-side loader for the N8 own-полувагон tariff tables (Табл.2/5 + N8 grid).
// Mirrors the load in goldenN8.test.ts so the production calculator uses the exact
// same verbatim seed cells that reproduce both real квитанции to the ruble.
//
// Reads from process.cwd()/scripts/seed-data — present at the repo root in production
// (Railway runs `node .next/standalone/server.js` from the project root) and copied
// into the standalone bundle by the build script as belt-and-suspenders.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type {
  N8Cell,
  N8ClassCoeffBelt,
  N8K4Belt,
  N8TariffData,
} from "./computeTariffN8";

const SEED_DIR = resolve(process.cwd(), "scripts/seed-data");

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED_DIR, name), "utf8")) as T;
}

let cached: N8TariffData | null = null;

/** Load (and memoize) the N8 tariff tables. Throws if a seed file is missing. */
export function loadN8TariffData(): N8TariffData {
  if (cached) return cached;

  const n8 = loadJson<{ schemeN8_weightDist: N8Cell[] }>("tr1-n8-corrected.json");
  const cls = loadJson<{ classCoeff: N8ClassCoeffBelt[] }>(
    "tr1-class-coeff-corrected.json",
  );
  const k4 = loadJson<{ distanceCorr: N8K4Belt[] }>("tr1-k4-corrected.json");

  cached = {
    n8Grid: n8.schemeN8_weightDist,
    classCoeff: cls.classCoeff,
    k4Belts: k4.distanceCorr,
  };
  return cached;
}
