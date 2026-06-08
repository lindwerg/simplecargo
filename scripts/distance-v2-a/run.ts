// ─────────────────────────────────────────────────────────────────────────────
// distance-v2-a/run.ts
//
// Loads the seed datasets, compiles the ТР-4 graph, and proves the engine hits
// the oracle квитанции to the kilometre:
//   Route A  Возрождение(021609) → Гремячая(612709)   = 2444 km
//   Route B  Исеть(771500)       → Набережные Челны(648503) = 699 km
// plus 4 more kniga1-derivable pairs of varied distance.
//
// Run:  npx tsx scripts/distance-v2-a/run.ts
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compileGraph,
  computeDistance,
  type CompiledGraph,
  type HubDistances,
  type Kniga1Row,
  type SpecialDistances,
  type UzelGraph,
} from "./engine";

const SEED = resolve(__dirname, "../seed-data");

function load<T>(name: string): T {
  return JSON.parse(readFileSync(resolve(SEED, name), "utf8")) as T;
}

const kniga1 = load<Kniga1Row[]>("kniga1-sections.json");
const graph = load<UzelGraph>("uzel-graph.json");
const hub = load<HubDistances>("hub-distances.json");
const special = load<SpecialDistances>("special-distances.json");

const g: CompiledGraph = compileGraph(kniga1, graph);

const stationName = new Map<string, string>();
for (const r of kniga1) if (!stationName.has(r.esr)) stationName.set(r.esr, r.name);

interface OracleCase {
  label: string;
  oEsr: string;
  dEsr: string;
  expect?: number;
}

const CASES: OracleCase[] = [
  { label: "Route A: Возрождение → Гремячая", oEsr: "021609", dEsr: "612709", expect: 2444 },
  { label: "Route B: Исеть → Набережные Челны", oEsr: "771500", dEsr: "648503", expect: 699 },
];

// 4 more kniga1-derivable pairs of varied distance (self-check, no official oracle).
const EXTRA: OracleCase[] = [
  { label: "Возрождение → Каменногорск (same участок)", oEsr: "021609", dEsr: "021702" },
  { label: "Исеть → Смычка (same участок)", oEsr: "771500", dEsr: "770005" },
  { label: "Кивнет → Амурская (same участок Бурея–Райчихинск)", oEsr: "956339", dEsr: "956502" },
  { label: "Возрождение → Исеть (long cross-network)", oEsr: "021609", dEsr: "771500" },
];

function runOne(c: OracleCase): { ok: boolean; km: number } {
  const oName = stationName.get(c.oEsr);
  const dName = stationName.get(c.dEsr);
  const r = computeDistance(g, hub, special, c.oEsr, c.dEsr, oName, dName);
  console.log(`\n── ${c.label}`);
  console.log(`   ${oName}(${c.oEsr}) → ${dName}(${c.dEsr})`);
  if (!r) {
    console.log("   RESULT: null (could not route)");
    return { ok: false, km: -1 };
  }
  console.log(`   COMPUTED = ${r.km} km   [method: ${r.method}]`);
  console.log(
    `   breakdown: leg1=${r.leg1} +bridgeO=${r.bridgeOrigin} +backbone=${r.backboneKm} +bridgeD=${r.bridgeDest} +leg3=${r.leg3} +adder=${r.adder}`
  );
  console.log(`   origin узел=${r.originUzel}  dest узел=${r.destUzel}`);
  if (c.expect != null) {
    const diff = r.km - c.expect;
    const ok = Math.abs(diff) <= 1;
    console.log(
      `   EXPECT = ${c.expect} km   DIFF = ${diff >= 0 ? "+" : ""}${diff}   ${ok ? "✅ EXACT" : "❌ MISMATCH"}`
    );
    if (c.label.startsWith("Route A")) {
      console.log(`   узел-path (Route A): ${r.backbonePath.join(" → ")}`);
    }
    return { ok, km: r.km };
  }
  return { ok: true, km: r.km };
}

console.log("═══════════════════ ORACLE ROUTES ═══════════════════");
const a = runOne(CASES[0]);
const b = runOne(CASES[1]);

console.log("\n═══════════════════ EXTRA SELF-CHECK PAIRS ═══════════════════");
const extras = EXTRA.map(runOne);

console.log("\n═══════════════════ SUMMARY ═══════════════════");
console.log(`Route A = ${a.km} km (target 2444) → ${a.ok ? "EXACT" : "FAIL"}`);
console.log(`Route B = ${b.km} km (target 699)  → ${b.ok ? "EXACT" : "FAIL"}`);
EXTRA.forEach((c, i) => console.log(`Extra: ${c.label} = ${extras[i].km} km`));
