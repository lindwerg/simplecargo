// ─────────────────────────────────────────────────────────────────────────────
// validate-rtariff.ts — R-Тариф validation harness.
//
// Reads scripts/seed-data/rtariff-validation.template.json (after the operator has
// pasted R-Тариф's провозная плата / с НДС / км into the ref_* fields), runs OUR
// engine per case, and prints a diff table:  км diff | ₽ diff (без НДС, с НДС) | verdict.
//
// Distance: real ТР-4 engine (resolveDistance), file-backed, no DB.
// Tariff:   the PROVEN own-ПВ class-1 N8 pure path (computeQuoteN8) for cases the
//           engine can certify; honest "engine cannot model yet" for the rest.
//
// Run:  npx tsx scripts/validate-rtariff.ts
//       npx tsx scripts/validate-rtariff.ts --only C01,C14    (subset)
//       npx tsx scripts/validate-rtariff.ts --proven           (proven coverage only)
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { resolveDistance } from "@/lib/distance/repository";
import {
  computeQuoteN8,
  type N8Cell,
  type N8ClassCoeffBelt,
  type N8K4Belt,
  type N8TariffData,
  type N8WagonInput,
} from "@/lib/tariff/computeTariffN8";

// ── Tolerances ────────────────────────────────────────────────────────────────

/** «В рубль»: per-wagon без-НДС diff at or below this is a PASS. */
const RUBLE_TOLERANCE = 0.5;
/** Distance tolerance (km). The engine returns integer km; R-Тариф is integer too. */
const KM_TOLERANCE = 0;
/** VAT rate for domestic traffic (ТР-1 2026). */
const VAT_DOMESTIC = 1.22;

// ── Template shapes ─────────────────────────────────────────────────────────────

interface CaseStation {
  name: string;
  esr: string;
  road?: string;
}

interface ValidationCase {
  id: string;
  group: string;
  engineCoverage: "proven" | "fitted" | "gap";
  lever: string | null;
  origin: CaseStation;
  dest: CaseStation;
  cargo: string;
  etsngCode: string;
  freightClass: number;
  wagonType: string;
  ownership: "own" | "rzd";
  wagonModel: string;
  shipmentType: "wagon" | "group" | "route";
  wagonCount: number;
  weightTonsPerWagon: number;
  axles: number;
  asOfDate: string;
  traffic: "domestic" | "export" | "import";
  note: string;
  ref_distanceKm: number | null;
  ref_perWagonProvoznaya_noVat: number | null;
  ref_perWagonWithVat: number | null;
  ref_per1tNoVat: number | null;
  ref_notes: string;
}

interface Template {
  _meta: unknown;
  cases: ValidationCase[];
}

// ── Seed-data loaders for the N8 pure path ──────────────────────────────────────

const SEED = resolve(process.cwd(), "scripts/seed-data");

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED, name), "utf8")) as T;
}

function loadN8Data(): N8TariffData {
  const n8 = loadJson<{ schemeN8_weightDist: N8Cell[] }>("tr1-n8-corrected.json");
  const k1 = loadJson<{ classCoeff: N8ClassCoeffBelt[] }>("tr1-k1-full.json");
  // K4 belts live under distanceCorr in the corrected file (same shape the engine tests use).
  const k4 = loadJson<{ distanceCorr: N8K4Belt[] }>("tr1-k4-corrected.json");
  return {
    n8Grid: n8.schemeN8_weightDist,
    classCoeff: k1.classCoeff,
    k4Belts: k4.distanceCorr,
  };
}

// ── Innovative model lookup (mirrors the engine's 0.9595 list) ───────────────────

function loadInnovativeModels(): Set<string> {
  try {
    const raw = loadJson<unknown>("tr1-innovative-models.json");
    const models = new Set<string>();
    const collect = (v: unknown): void => {
      if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === "string") models.add(item);
          else if (item && typeof item === "object") {
            const m = (item as { model?: string }).model;
            if (m) models.add(m);
          }
        }
      } else if (v && typeof v === "object") {
        for (const val of Object.values(v as Record<string, unknown>)) collect(val);
      }
    };
    collect(raw);
    return models;
  } catch {
    return new Set();
  }
}

// ── Whether the proven N8 path applies to a case ────────────────────────────────

function isProvenN8(c: ValidationCase): boolean {
  return c.ownership === "own" && c.wagonType === "ПВ" && c.freightClass === 1;
}

// ── Engine run result ───────────────────────────────────────────────────────────

interface EngineRun {
  km: number | null;
  kmConfidence: string;
  modeled: boolean; // true → we produced a number to compare
  perWagonNoVat: number | null;
  perWagonWithVat: number | null;
  k4Fitted: boolean;
  reason: string; // why not modeled, or provenance note
}

function runEngineTariff(c: ValidationCase, n8: N8TariffData, innovative: Set<string>, km: number): EngineRun {
  if (!isProvenN8(c)) {
    return {
      km, kmConfidence: "green", modeled: false,
      perWagonNoVat: null, perWagonWithVat: null, k4Fitted: false,
      reason: `engine N8 path не покрывает ${c.ownership}/${c.wagonType}/class${c.freightClass} (gap)`,
    };
  }
  const isInnovative = innovative.has(c.wagonModel.trim());
  const wagons: N8WagonInput[] = Array.from({ length: c.wagonCount }, (_, i) => ({
    wagonNo: `${c.id}-${i + 1}`,
    capacityT: c.weightTonsPerWagon,
    innovative: isInnovative,
  }));
  try {
    const quote = computeQuoteN8(wagons, n8, km);
    const perWagonNoVat = quote.wagons[0]?.tariffRub ?? 0;
    const k4Fitted = quote.wagons.some((w) => w.k4Fitted);
    return {
      km, kmConfidence: "green", modeled: true,
      perWagonNoVat,
      perWagonWithVat: Math.round(perWagonNoVat * VAT_DOMESTIC * 100) / 100,
      k4Fitted,
      reason: isInnovative ? "N8 proven (innovative 0.9595)" : "N8 proven",
    };
  } catch (err) {
    return {
      km, kmConfidence: "green", modeled: false,
      perWagonNoVat: null, perWagonWithVat: null, k4Fitted: false,
      reason: `N8 lookup failed: ${(err as Error).message}`,
    };
  }
}

// ── Diff + verdict ──────────────────────────────────────────────────────────────

type Verdict = "PASS" | "FAIL" | "PENDING" | "GAP" | "NO-DIST";

interface CaseReport {
  id: string;
  group: string;
  coverage: string;
  lever: string | null;
  route: string;
  distEngine: number | null;
  distRef: number | null;
  kmDiff: number | null;
  refNoVat: number | null;
  engNoVat: number | null;
  rubDiffNoVat: number | null;
  k4Fitted: boolean;
  verdict: Verdict;
  detail: string;
}

function buildReport(c: ValidationCase, eng: EngineRun): CaseReport {
  const route = `${c.origin.name}→${c.dest.name}`;
  const kmDiff =
    eng.km !== null && c.ref_distanceKm !== null ? eng.km - c.ref_distanceKm : null;

  let verdict: Verdict;
  let detail = eng.reason;
  let rubDiffNoVat: number | null = null;

  if (eng.km === null) {
    verdict = "NO-DIST";
    detail = `distance unresolved (${eng.kmConfidence}) — ${eng.reason}`;
  } else if (!eng.modeled) {
    verdict = "GAP";
  } else if (c.ref_perWagonProvoznaya_noVat === null) {
    verdict = "PENDING";
    detail = "ref_perWagonProvoznaya_noVat not filled — paste R-Тариф value";
  } else {
    rubDiffNoVat = eng.perWagonNoVat! - c.ref_perWagonProvoznaya_noVat;
    const kmOk = kmDiff !== null && Math.abs(kmDiff) <= KM_TOLERANCE;
    const rubOk = Math.abs(rubDiffNoVat) <= RUBLE_TOLERANCE;
    verdict = kmOk && rubOk ? "PASS" : "FAIL";
    detail =
      `${eng.reason}${eng.k4Fitted ? " [K4 FITTED]" : ""}` +
      (!kmOk ? ` | KM off by ${kmDiff}` : "") +
      (!rubOk ? ` | ₽ off by ${rubDiffNoVat.toFixed(2)}` : "");
  }

  return {
    id: c.id,
    group: c.group,
    coverage: c.engineCoverage,
    lever: c.lever,
    route,
    distEngine: eng.km,
    distRef: c.ref_distanceKm,
    kmDiff,
    refNoVat: c.ref_perWagonProvoznaya_noVat,
    engNoVat: eng.perWagonNoVat,
    rubDiffNoVat,
    k4Fitted: eng.k4Fitted,
    verdict,
    detail,
  };
}

// ── Table printing ──────────────────────────────────────────────────────────────

function pad(s: string | number | null, n: number): string {
  const str = s === null ? "—" : String(s);
  return str.length >= n ? str.slice(0, n) : str.padEnd(n);
}
function padL(s: string | number | null, n: number): string {
  const str = s === null ? "—" : String(s);
  return str.length >= n ? str.slice(0, n) : str.padStart(n);
}

function printTable(reports: CaseReport[]): void {
  const head =
    pad("ID", 5) + pad("cov", 7) + pad("route", 26) +
    padL("kmEng", 6) + padL("kmRef", 6) + padL("kmΔ", 5) + " " +
    padL("engₐ", 9) + padL("refₐ", 9) + padL("₽Δ", 9) + " " +
    pad("verdict", 8) + "detail";
  console.log(head);
  console.log("─".repeat(head.length > 140 ? 140 : head.length));
  for (const r of reports) {
    console.log(
      pad(r.id, 5) + pad(r.coverage, 7) + pad(r.route, 26) +
      padL(r.distEngine, 6) + padL(r.distRef, 6) + padL(r.kmDiff, 5) + " " +
      padL(r.engNoVat, 9) + padL(r.refNoVat, 9) +
      padL(r.rubDiffNoVat !== null ? r.rubDiffNoVat.toFixed(2) : null, 9) + " " +
      pad(r.verdict, 8) + r.detail,
    );
  }
}

function printSummary(reports: CaseReport[]): void {
  const tally: Record<Verdict, number> = { PASS: 0, FAIL: 0, PENDING: 0, GAP: 0, "NO-DIST": 0 };
  for (const r of reports) tally[r.verdict]++;
  console.log("\n── SUMMARY ──────────────────────────────────────────────");
  console.log(
    `PASS ${tally.PASS}  FAIL ${tally.FAIL}  PENDING ${tally.PENDING}  ` +
    `GAP ${tally.GAP}  NO-DIST ${tally["NO-DIST"]}  (total ${reports.length})`,
  );
  const fails = reports.filter((r) => r.verdict === "FAIL");
  if (fails.length) {
    console.log("\nFAILs (need attention):");
    for (const r of fails) console.log(`  ${r.id} ${r.route}: ${r.detail}`);
  }
  // Fitted-lever status: of the proven/fitted cases that have refs, how many PASS?
  const fitted = reports.filter((r) => r.coverage !== "gap" && (r.verdict === "PASS" || r.verdict === "FAIL"));
  if (fitted.length) {
    const ok = fitted.filter((r) => r.verdict === "PASS").length;
    console.log(`\nFitted-lever certification: ${ok}/${fitted.length} verifiable cases PASS «в рубль».`);
  } else {
    console.log("\nFitted-lever certification: 0 ref values filled yet — fill ref_* in the template, then re-run.");
  }
}

// ── Main ────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const onlyArg = args.find((a) => a.startsWith("--only="));
  const onlyIds = onlyArg ? new Set(onlyArg.split("=")[1].split(",").map((s) => s.trim())) : null;
  const provenOnly = args.includes("--proven");

  const tpl = loadJson<Template>("rtariff-validation.template.json");
  const n8 = loadN8Data();
  const innovative = loadInnovativeModels();

  let cases = tpl.cases;
  if (onlyIds) cases = cases.filter((c) => onlyIds.has(c.id));
  if (provenOnly) cases = cases.filter((c) => c.engineCoverage === "proven");

  const reports: CaseReport[] = [];
  for (const c of cases) {
    const dist = await resolveDistance({
      originEsr: c.origin.esr,
      destEsr: c.dest.esr,
      emptyRun: false,
    });
    const eng =
      dist.km === null
        ? {
            km: null, kmConfidence: dist.confidence, modeled: false,
            perWagonNoVat: null, perWagonWithVat: null, k4Fitted: false,
            reason: dist.warnings[0] ?? "no route",
          }
        : runEngineTariff(c, n8, innovative, dist.km);
    reports.push(buildReport(c, eng));
  }

  printTable(reports);
  printSummary(reports);
}

main().catch((err) => {
  console.error("validate-rtariff failed:", err);
  process.exit(1);
});
