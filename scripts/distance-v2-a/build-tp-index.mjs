// Build the COMPLETE ТР-4 Книга-3 transit-point (ТП) index.
// Source 1: tr4.info per-railway ТП lists (/tp/rw/<id>) — links are /tp/<esr6> with name.
// Source 2: distinct ТП ESRs already present in kniga3-backbone.json (UNION).
// No fabrication: ESR + name are copied verbatim from the fetched HTML.
// Output: scripts/seed-data/kniga3-tp-index.json = compact [{esr,name,inBackboneAlready}]

import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const ROOT = "/Users/mishanikhinkirtill/Desktop/SimpleCargo";
const BACKBONE = join(ROOT, "scripts", "seed-data", "kniga3-backbone.json");
const OUT = join(ROOT, "scripts", "seed-data", "kniga3-tp-index.json");

// 41 railways from https://tr4.info/tp/
const RW_IDS = [1, 85, 84, 83, 58, 51, 82, 80, 76, 63, 88, 91, 97, 96, 10, 94,
  89, 17, 24, 28, 92, 61, 13, 32, 35, 48, 40, 43, 45, 39, 12, 9, 8, 68, 57, 73,
  55, 56, 70, 74, 75];

const LINK_RE = /\/tp\/(\d{6})"\s+class="[^"]*">([^<]+)<\/a>/g;

function fetchRailway(id) {
  const url = `https://tr4.info/tp/rw/${id}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const html = execSync(`curl -s --max-time 50 ${JSON.stringify(url)}`, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      });
      const pairs = [];
      let m;
      LINK_RE.lastIndex = 0;
      while ((m = LINK_RE.exec(html)) !== null) {
        pairs.push({ esr: m[1], name: m[2].trim() });
      }
      if (pairs.length > 0) return { id, pairs, ok: true };
      // empty -> retry
    } catch (e) {
      // retry
    }
  }
  return { id, pairs: [], ok: false };
}

// ── 1. backbone ТП set ────────────────────────────────────────────────
const backbone = JSON.parse(readFileSync(BACKBONE, "utf8"));
const backboneEsr = new Map(); // esr -> name
for (const e of backbone) {
  if (e.aEsr) backboneEsr.set(e.aEsr, e.a);
  if (e.bEsr) backboneEsr.set(e.bEsr, e.b);
}
console.error(`backbone distinct ТП: ${backboneEsr.size}`);

// ── 2. tr4.info enumeration ───────────────────────────────────────────
const tpMap = new Map(); // esr -> name (prefer tr4.info name)
const failed = [];
for (const id of RW_IDS) {
  const r = fetchRailway(id);
  if (!r.ok) {
    failed.push(id);
    console.error(`rw/${id}: FAILED`);
    continue;
  }
  for (const p of r.pairs) {
    if (!tpMap.has(p.esr)) tpMap.set(p.esr, p.name);
  }
  console.error(`rw/${id}: ${r.pairs.length} ТП (running total ${tpMap.size})`);
}

// ── 3. UNION with backbone ────────────────────────────────────────────
let addedFromBackbone = 0;
for (const [esr, name] of backboneEsr) {
  if (!tpMap.has(esr)) {
    tpMap.set(esr, name);
    addedFromBackbone++;
  }
}
console.error(`added from backbone (not on tr4.info lists): ${addedFromBackbone}`);

// ── 4. emit compact ───────────────────────────────────────────────────
const out = [...tpMap.entries()]
  .map(([esr, name]) => ({ esr, name, inBackboneAlready: backboneEsr.has(esr) }))
  .sort((a, b) => a.esr.localeCompare(b.esr));

writeFileSync(OUT, JSON.stringify(out));
console.error(`\nTOTAL ТП: ${out.length}`);
console.error(`inBackboneAlready: ${out.filter((t) => t.inBackboneAlready).length}`);
console.error(`new (not in backbone): ${out.filter((t) => !t.inBackboneAlready).length}`);
console.error(`failed railways: ${failed.length ? failed.join(",") : "none"}`);
console.error(`wrote ${OUT}`);
