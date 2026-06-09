// ─────────────────────────────────────────────────────────────────────────────
// gen-rf-station-attach.mjs — derive Книга-1 attach legs for RF stations that
// currently have NO участок leg, using ONLY the station CSV's own published
// «Транзитные пункты» column (field[4]) — never an invented km/ESR.
//
// Two source-traceable mechanisms (RF only; Crimea/exclave roads skipped):
//
//   1. SELF-ТП:  a station whose transit column is the literal "ТП" AND which is
//      itself a Книга-3 backbone узел (its ESR appears as a kniga3 node) gets a
//      0-km self-leg {uzelEsr = own ESR}. The station IS the транзитный пункт, so
//      its distance to the узел is 0 km by definition — no number is invented.
//
//   2. TRANSIT-SPUR: a station whose transit column lists "Name-km" tokens (the
//      CSV's published nearest-ТП offsets, e.g. "Кандалакша-91, Кола-171") gets
//      one attach leg per token whose target NAME resolves to a station ESR that
//      is itself a usable узел anchor (has a kniga1 leg OR is a backbone node).
//      km is the CSV's own published offset — not invented.
//
// Output: scripts/seed-data/kniga1-transit-attach.json  (compact single-line),
// shape [{esr,name,uzelEsr,uzelName,km,uchastok,source}].  Loaded additively by
// repository.ts as extra stationLegs; it adds resolution for the new station ONLY
// and never creates a узел↔узел graph edge, so it cannot move any existing route.
//
// RUN: node scripts/distance-v2-a/gen-rf-station-attach.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/Users/mishanikhinkirtill/Desktop/SimpleCargo";
const SEED = join(ROOT, "scripts", "seed-data");
const RF_CSV = join(SEED, "rzd-stations-20231230.csv");
const OUT = join(SEED, "kniga1-transit-attach.json");

const ESR_LEN = 6;
const TP_LITERAL = "ТП";
const KM_ROUND_BAND = 1; // ТР-4 1 km band — not used to fabricate, only a guard

// Roads structurally outside the RF ТР-4 backbone (flagged OUT of scope).
const OUT_OF_SCOPE_ROADS = new Set([
  'ФГУП "КЖД"', // Crimea
  "Крымская",
  "Мелитопольская",
  'ООО "Рубикон"',
]);

// ── quote-aware CSV line parser (verbatim port of parseCsvLine) ──────────────
function parseCsvLine(line, delimiter) {
  const fields = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delimiter) { fields.push(cur); cur = ""; }
    else cur += ch;
  }
  fields.push(cur);
  return fields;
}

// normalizeStationName — mirror of src/lib/geo/normalize.ts (RU uppercase, Ё→Е,
// NFKD strip, drop parentheticals, punctuation→space, collapse ws).
const PARENTHETICAL = /\([^)]*\)/g;
const COMBINING = /[̀-ͯ]/g;
const NON_WORD = /[^\p{L}\p{N}\s]/gu;
function normalizeStationName(raw) {
  if (!raw) return "";
  const up = raw.trim().toLocaleUpperCase("ru-RU").replace(/Ё/g, "Е");
  const dec = up.normalize("NFKD").replace(COMBINING, "");
  const noParen = dec.replace(PARENTHETICAL, " ");
  const words = noParen.replace(NON_WORD, " ");
  return words.replace(/\s+/g, " ").trim();
}

// parseNameKmToken — port of parseTransit.ts (split on LAST hyphen, km = int).
function parseNameKmToken(token) {
  const t = token.trim();
  if (!t) return null;
  const lh = t.lastIndexOf("-");
  if (lh <= 0 || lh === t.length - 1) return null;
  const rawName = t.slice(0, lh);
  const rawKm = t.slice(lh + 1);
  if (!/^\d+$/.test(rawKm)) return null;
  const name = normalizeStationName(rawName);
  if (!name) return null;
  return { rawName: rawName.trim(), name, km: Number.parseInt(rawKm, 10) };
}

// ── load existing kniga1 legs + backbone узел set ────────────────────────────
const kniga1 = JSON.parse(readFileSync(join(SEED, "kniga1-sections.json"), "utf8"));
const hasLeg = new Set(kniga1.map((r) => r.esr));

const graph = JSON.parse(readFileSync(join(SEED, "uzel-graph.json"), "utf8"));
const backboneNodes = new Set();
const allGraphNodes = new Set(graph.nodes.map((n) => n.esr));
for (const e of graph.edges) {
  if (e.source === "kniga3") { backboneNodes.add(e.aEsr); backboneNodes.add(e.bEsr); }
}

// ── parse RF CSV ─────────────────────────────────────────────────────────────
const csv = readFileSync(RF_CSV, "utf8").split(/\r?\n/);
const rows = [];
const nameToEsr = new Map();        // any RF station
const nameToAnchor = new Map();     // RF station that is a usable узел anchor
for (const line of csv) {
  if (!line.trim()) continue;
  const f = parseCsvLine(line, ";");
  const name = (f[0] ?? "").trim();
  if (name === "Наименование") continue;
  const code = (f[3] ?? "").trim().padStart(ESR_LEN, "0");
  if (!name || !/^\d{6}$/.test(code)) continue;
  const road = (f[2] ?? "").trim();
  const transit = (f[4] ?? "").trim();
  rows.push({ name, esr: code, road, transit });
  const norm = normalizeStationName(name);
  if (norm) {
    if (!nameToEsr.has(norm)) nameToEsr.set(norm, code);
    if ((hasLeg.has(code) || backboneNodes.has(code)) && !nameToAnchor.has(norm)) {
      nameToAnchor.set(norm, code);
    }
  }
}
const distinct = new Map();
for (const r of rows) if (!distinct.has(r.esr)) distinct.set(r.esr, r);

// ── build attach legs ────────────────────────────────────────────────────────
const out = [];
const stats = {
  totalDistinctRf: distinct.size,
  noLeg: 0,
  selfTp: 0,
  transitAttachStations: 0,
  transitAttachLegs: 0,
  skippedOutOfScope: 0,
  skippedTpNotBackbone: 0,
  skippedNoResolvableTarget: 0,
};

for (const [esr, r] of distinct) {
  if (hasLeg.has(esr)) continue;
  stats.noLeg++;
  if (OUT_OF_SCOPE_ROADS.has(r.road)) { stats.skippedOutOfScope++; continue; }

  const raw = r.transit;
  if (raw === TP_LITERAL) {
    // SELF-ТП: only when the station itself is a backbone узел (km 0 by definition).
    if (backboneNodes.has(esr)) {
      out.push({ esr, name: r.name, uzelEsr: esr, uzelName: r.name, km: 0, uchastok: `SELF-ТП ${r.name}`, source: "csv-tp-self" });
      stats.selfTp++;
    } else {
      stats.skippedTpNotBackbone++;
    }
    continue;
  }

  // TRANSIT-SPUR: parse "Name-km" tokens, attach to resolvable узел anchors.
  const tokens = raw.split(",").map(parseNameKmToken).filter((s) => s !== null);
  if (tokens.length === 0) { stats.skippedNoResolvableTarget++; continue; }
  const legs = [];
  for (const tk of tokens) {
    const tEsr = nameToAnchor.get(tk.name) ?? nameToEsr.get(tk.name);
    if (!tEsr) continue;
    if (tEsr === esr) continue; // never self via a name token here
    legs.push({ esr, name: r.name, uzelEsr: tEsr, uzelName: tk.rawName, km: tk.km, uchastok: `TRANSIT ${r.name}`, source: "csv-transit-spur" });
  }
  if (legs.length === 0) { stats.skippedNoResolvableTarget++; continue; }
  out.push(...legs);
  stats.transitAttachStations++;
  stats.transitAttachLegs += legs.length;
}

// Deterministic order (esr, then uzelEsr) so the file is reproducible.
out.sort((a, b) => (a.esr === b.esr ? a.uzelEsr.localeCompare(b.uzelEsr) : a.esr.localeCompare(b.esr)));

writeFileSync(OUT, JSON.stringify(out), "utf8");
console.log(JSON.stringify({ ...stats, outputLegs: out.length, distinctAttachedEsr: new Set(out.map((o) => o.esr)).size, file: OUT }, null, 1));
