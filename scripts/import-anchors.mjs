#!/usr/bin/env node
// import-anchors.mjs — bulk importer of operator-verified distance anchors
// into scripts/seed-data/special-distances.json (L1 of the layered distance
// policy, see docs/planning/DISTANCE_FINAL_ARCHITECTURE.md).
//
// Usage:
//   node scripts/import-anchors.mjs <file.tsv|file.csv> [--dry-run] [--force]
//
// Input rows: origin <sep> dest <sep> km <sep> note
//   - origin/dest: 6-digit ESR code OR exact station name
//     (resolved via scripts/seed-data/rzd-stations-20231230.csv)
//   - km: positive integer (тарифное расстояние, км)
//   - note: free text — cite the source (квитанция / R-Тариф screenshot)
// Separator auto-detected per file: TAB > ";" > ",". Quoted CSV fields OK.
// A header row (non-numeric km) is skipped automatically.
//
// Behaviour:
//   - validates EVERYTHING first; any error aborts with NO write (no partial import)
//   - APPENDS {a,b,km,note,source:"operator-import-<date>"} to overrides
//   - idempotent: same (a,b) pair (any direction) with same km → skipped;
//     different km → km/note/source updated with a loud WARN
//   - curated/payment-verified rows (source not starting with "operator-import")
//     are NEVER overwritten without --force (e.g. Бологое 801 anchor)
//   - file is written compact (JSON.stringify), byte-stable roundtrip
//
// NO-FABRICATION: only import km you can defend with a квитанция or an
// R-Тариф calculation. An anchor overrides every other layer of the engine.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SEED_DIR = path.join(__dirname, "seed-data");
const SPECIAL_PATH = path.join(SEED_DIR, "special-distances.json");
const STATIONS_PATH = path.join(SEED_DIR, "rzd-stations-20231230.csv");

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const files = args.filter((a) => !a.startsWith("--"));
const isDryRun = flags.has("--dry-run");
const isForce = flags.has("--force");

if (files.length !== 1) {
  console.error("Usage: node scripts/import-anchors.mjs <file.tsv|file.csv> [--dry-run] [--force]");
  process.exit(1);
}
const inputPath = path.resolve(files[0]);
if (!fs.existsSync(inputPath)) {
  console.error(`ERROR: input file not found: ${inputPath}`);
  process.exit(1);
}

// ── helpers ───────────────────────────────────────────────────────────────────
const normName = (s) =>
  s
    .trim()
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/\s+/g, " ");

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Parse one delimited line with double-quote escaping ("" inside quotes). */
function parseLine(line, sep) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

// ── load station registry (ESR validation + name → code resolution) ──────────
const stationsRaw = fs.readFileSync(STATIONS_PATH, "utf8");
const stationLines = stationsRaw.split(/\r?\n/).filter((l) => l.length > 0);
const knownCodes = new Set();
const nameToCodes = new Map(); // normName → [{code, road, name}]
for (let i = 1; i < stationLines.length; i++) {
  const f = parseLine(stationLines[i], ";");
  const name = (f[0] ?? "").trim();
  const road = (f[2] ?? "").trim();
  const code = (f[3] ?? "").trim();
  if (!/^\d{6}$/.test(code)) continue;
  knownCodes.add(code);
  const key = normName(name);
  if (!nameToCodes.has(key)) nameToCodes.set(key, []);
  nameToCodes.get(key).push({ code, road, name });
}
console.log(`Station registry: ${knownCodes.size} ESR codes, ${nameToCodes.size} names`);

/** Resolve a station field (6-digit ESR or exact name) to an ESR code. */
function resolveStation(field, rowNo, errors) {
  const v = field.trim();
  if (/^\d{6}$/.test(v)) {
    if (!knownCodes.has(v)) {
      errors.push(`row ${rowNo}: ESR ${v} not found in station registry`);
      return null;
    }
    return { code: v, label: v };
  }
  const hits = nameToCodes.get(normName(v)) ?? [];
  if (hits.length === 0) {
    errors.push(`row ${rowNo}: station name «${v}» not found (exact match required; or use the 6-digit ESR)`);
    return null;
  }
  if (hits.length > 1) {
    const list = hits.map((h) => `${h.code} (${h.road})`).join(", ");
    errors.push(`row ${rowNo}: station name «${v}» is ambiguous → ${list}; use the 6-digit ESR`);
    return null;
  }
  return { code: hits[0].code, label: `${v} → ${hits[0].code}` };
}

// ── parse + validate input file (no writes yet) ──────────────────────────────
const inputRaw = fs.readFileSync(inputPath, "utf8");
const rawLines = inputRaw.split(/\r?\n/).filter((l) => l.trim().length > 0);
if (rawLines.length === 0) {
  console.error("ERROR: input file is empty");
  process.exit(1);
}
const sep = rawLines[0].includes("\t") ? "\t" : rawLines[0].includes(";") ? ";" : ",";
console.log(`Input: ${inputPath} (${rawLines.length} lines, sep=${JSON.stringify(sep)})`);

const errors = [];
const rows = [];
const seenPairs = new Map(); // pairKey → first row number
rawLines.forEach((line, idx) => {
  const rowNo = idx + 1;
  const f = parseLine(line, sep);
  if (idx === 0 && f[2] !== undefined && !/^\d+([.,]\d+)?$/.test(f[2].trim())) {
    console.log(`  (row 1 looks like a header — skipped: ${f.slice(0, 3).join(" | ")})`);
    return;
  }
  if (f.length < 3) {
    errors.push(`row ${rowNo}: expected at least 3 columns (origin, dest, km), got ${f.length}`);
    return;
  }
  const origin = resolveStation(f[0], rowNo, errors);
  const dest = resolveStation(f[1], rowNo, errors);
  const kmStr = f[2].trim();
  const note = (f[3] ?? "").trim();
  if (!/^\d+$/.test(kmStr)) {
    errors.push(`row ${rowNo}: km «${kmStr}» must be a positive integer`);
    return;
  }
  const km = Number(kmStr);
  if (km <= 0) {
    errors.push(`row ${rowNo}: km must be > 0, got ${km}`);
    return;
  }
  if (!origin || !dest) return; // resolveStation already pushed the error
  if (origin.code === dest.code) {
    errors.push(`row ${rowNo}: origin and dest resolve to the same station ${origin.code}`);
    return;
  }
  const key = pairKey(origin.code, dest.code);
  if (seenPairs.has(key)) {
    errors.push(`row ${rowNo}: duplicate pair ${origin.code}↔${dest.code} (first at row ${seenPairs.get(key)})`);
    return;
  }
  seenPairs.set(key, rowNo);
  rows.push({ rowNo, origin, dest, km, note });
});

if (errors.length > 0) {
  console.error(`\nABORTED — ${errors.length} validation error(s), nothing written:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
if (rows.length === 0) {
  console.log("Nothing to import (no data rows).");
  process.exit(0);
}

// ── merge into special-distances.json ────────────────────────────────────────
const specialRaw = fs.readFileSync(SPECIAL_PATH, "utf8");
const special = JSON.parse(specialRaw);
if (!Array.isArray(special.overrides)) {
  console.error("ERROR: special-distances.json has no overrides[] array");
  process.exit(1);
}
// Safety: the writer must be byte-stable for untouched content.
if (JSON.stringify(JSON.parse(specialRaw)) !== specialRaw) {
  console.error("ERROR: special-distances.json is not in compact JSON.stringify form; refusing to rewrite it. Normalize it first.");
  process.exit(1);
}

const existing = new Map(); // pairKey → override object (live reference)
for (const o of special.overrides) existing.set(pairKey(o.a, o.b), o);

const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const source = `operator-import-${today}`;
const summary = { added: [], updated: [], unchanged: [], refused: [] };

for (const r of rows) {
  const key = pairKey(r.origin.code, r.dest.code);
  const prev = existing.get(key);
  const label = `${r.origin.label} ↔ ${r.dest.label}`;
  if (!prev) {
    const entry = { a: r.origin.code, b: r.dest.code, km: r.km, note: r.note, source };
    special.overrides.push(entry);
    existing.set(key, entry);
    summary.added.push(`+ ${label} = ${r.km} км${r.note ? ` (${r.note})` : ""}`);
    continue;
  }
  if (prev.km === r.km) {
    summary.unchanged.push(`= ${label} = ${r.km} км (already present, source: ${prev.source ?? "?"})`);
    continue;
  }
  const isCurated = !(prev.source ?? "").startsWith("operator-import");
  if (isCurated && !isForce) {
    summary.refused.push(
      `! ${label}: existing ${prev.km} км is CURATED/VERIFIED (source: ${prev.source ?? "?"}), import says ${r.km} км — REFUSED. Re-run with --force only if the new figure is quittance-verified.`
    );
    continue;
  }
  summary.updated.push(
    `~ ${label}: ${prev.km} км → ${r.km} км (was: ${prev.source ?? "?"})${isCurated ? " [--force over curated row!]" : ""}`
  );
  prev.km = r.km;
  if (r.note) prev.note = r.note;
  prev.source = source;
}

// ── report + write ────────────────────────────────────────────────────────────
console.log("\n=== Import summary ===");
for (const [k, lines] of Object.entries(summary)) {
  console.log(`${k}: ${lines.length}`);
  for (const l of lines) console.log(`  ${l}`);
}
if (summary.refused.length > 0) {
  console.log("\nWARNING: refused rows above were NOT applied (curated anchors protected).");
}

const hasChanges = summary.added.length + summary.updated.length > 0;
if (!hasChanges) {
  console.log("\nNo changes — special-distances.json left untouched.");
  process.exit(summary.refused.length > 0 ? 2 : 0);
}
if (isDryRun) {
  console.log("\n--dry-run: changes shown above were NOT written.");
  process.exit(0);
}
fs.writeFileSync(SPECIAL_PATH, JSON.stringify(special));
console.log(`\nWritten: ${SPECIAL_PATH} (overrides: ${special.overrides.length})`);
console.log("Reminder: restart the app / clear the distance cache so the new anchors load.");
process.exit(summary.refused.length > 0 ? 2 : 0);
