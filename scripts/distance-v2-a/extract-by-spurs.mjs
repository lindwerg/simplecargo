// One-off extractor: Belarus (БЧ / "Белорусская") station→ТП spur edges from the
// CIS station CSV. Reuses the exact quote-aware parse + name-km token logic from
// src/lib/db/seed/stations.ts and src/lib/distance/parseTransit.ts.
//
// Output: JSON array [{stationEsr, stationName, spurs:[{tpName, tpEsr, km}]}]
// Spur target names resolved to ESR against the SAME CSV (whole-file name index,
// ТП-flagged rows preferred for homonyms). Unresolved targets are kept with
// tpEsr=null and counted, never fabricated.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/Users/mishanikhinkirtill/Desktop/SimpleCargo";
const CIS_FILE = join(ROOT, "scripts", "seed-data", "cis-stations-20201230.csv");
const RF_FILE = join(ROOT, "scripts", "seed-data", "rzd-stations-20231230.csv");
const OUT_FILE = join(ROOT, "scripts", "seed-data", "acq-by-spurs.json");
const RF_HEADER_FIELD = "Наименование";

const BY_ROAD = "Белорусская";
const TP_LITERAL = "ТП";
const ESR_LENGTH = 6;

// ── quote-aware CSV line parser (verbatim port of parseCsvLine) ───────────────
function parseCsvLine(line, delimiter) {
  const fields = [];
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

function toEsr6(rawCode) {
  const digits = (rawCode ?? "").trim();
  if (!digits || !/^\d{1,6}$/.test(digits)) return null;
  return digits.padStart(ESR_LENGTH, "0");
}

// normalizeStationName equivalent: lowercase, strip parenthetical suffixes &
// punctuation noise, collapse spaces, ё→е. Mirrors the repo normalizer closely
// enough for spur-name resolution against the same file. We keep it conservative.
function normalizeStationName(raw) {
  if (!raw) return "";
  let s = String(raw).toLowerCase().replace(/ё/g, "е");
  // drop trailing parenthetical markers like "(ОП.)", "(. 1З58 км) (ПП.)"
  s = s.replace(/\([^()]*\)/g, " ");
  s = s.replace(/[«»"'`]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}

// ── name-km token parser (port of parseNameKmToken) ──────────────────────────
function parseNameKmToken(token) {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const lastHyphen = trimmed.lastIndexOf("-");
  if (lastHyphen <= 0 || lastHyphen === trimmed.length - 1) return null;
  const rawName = trimmed.slice(0, lastHyphen);
  const rawKm = trimmed.slice(lastHyphen + 1);
  if (!/^\d+$/.test(rawKm)) return null;
  const km = Number.parseInt(rawKm, 10);
  const name = normalizeStationName(rawName);
  if (!name) return null;
  return { rawName: rawName.trim(), name, km };
}

function parseTransitField(field4) {
  const raw = (field4 ?? "").trim();
  if (raw === TP_LITERAL) return { kind: "tp", spurs: [] };
  const spurs = raw.split(",").map(parseNameKmToken).filter((s) => s !== null);
  return { kind: "spurs", spurs };
}

// ── parse a station file into rows ───────────────────────────────────────────
function parseFile(path, delimiter, hasHeader) {
  const raw = readFileSync(path, "utf8");
  const lines = raw.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const f = parseCsvLine(line, delimiter);
    const name = (f[0] ?? "").trim();
    if (hasHeader && name === RF_HEADER_FIELD) continue;
    const road = (f[2] ?? "").trim();
    const esr6 = toEsr6(f[3] ?? "");
    if (!name || !esr6) continue;
    const transitRaw = (f[4] ?? "").trim();
    const isTp = transitRaw === TP_LITERAL;
    out.push({ name, road, esr6, transitRaw, isTp });
  }
  return out;
}

// CIS rows carry the Belarus spur source; RF rows are added ONLY to resolve
// cross-border ТП targets (e.g. Санкт-Петербург-Тов.-Витебский on Октябрьская).
const cisRows = parseFile(CIS_FILE, ",", false);
const rfRows = parseFile(RF_FILE, ";", true);
const allRows = [...cisRows, ...rfRows];

// ── whole-file name → ESR index (ТП-flagged wins homonym tie-break) ──────────
const anyEsrByName = new Map();
const tpEsrByName = new Map();
for (const r of allRows) {
  const norm = normalizeStationName(r.name);
  if (!norm) continue;
  if (!anyEsrByName.has(norm)) anyEsrByName.set(norm, r.esr6);
  if (r.isTp && !tpEsrByName.has(norm)) tpEsrByName.set(norm, r.esr6);
}
const nameIndex = new Map([...anyEsrByName, ...tpEsrByName]);

// ── filter to Belarus rows (CIS only), build spur edges ──────────────────────
const byRows = cisRows.filter((r) => r.road === BY_ROAD);

const result = [];
let totalTokens = 0;
let resolved = 0;
let unresolved = 0;
let tpCount = 0;
let spurStations = 0;
const unresolvedSamples = new Set();

for (const r of byRows) {
  const field = parseTransitField(r.transitRaw);
  if (field.kind === "tp") {
    tpCount += 1;
    // station IS a transit point — emit with empty spurs + self-flag
    result.push({ stationEsr: r.esr6, stationName: r.name, isTp: true, spurs: [] });
    continue;
  }
  if (field.spurs.length === 0) continue; // no usable spur list
  const spurs = [];
  for (const sp of field.spurs) {
    totalTokens += 1;
    const tpEsr = nameIndex.get(sp.name) ?? null;
    if (tpEsr) resolved += 1;
    else {
      unresolved += 1;
      if (unresolvedSamples.size < 20) unresolvedSamples.add(sp.rawName);
    }
    spurs.push({ tpName: sp.rawName, tpEsr, km: sp.km });
  }
  if (spurs.length > 0) {
    spurStations += 1;
    result.push({ stationEsr: r.esr6, stationName: r.name, isTp: false, spurs });
  }
}

writeFileSync(OUT_FILE, JSON.stringify(result, null, 2), "utf8");

console.log(JSON.stringify({
  byRowsTotal: byRows.length,
  tpStations: tpCount,
  spurStations,
  totalSpurTokens: totalTokens,
  resolvedSpurTargets: resolved,
  unresolvedSpurTargets: unresolved,
  resolvedPct: totalTokens ? +(100 * resolved / totalTokens).toFixed(1) : 0,
  outputRecords: result.length,
  unresolvedSamples: [...unresolvedSamples],
  sampleSpurStation: result.find((x) => !x.isTp && x.spurs.length > 0),
  sampleTpStation: result.find((x) => x.isTp),
}, null, 2));
