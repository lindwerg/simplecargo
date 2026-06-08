// Standalone verifier for the ТР-4 DISTANCE engine against the РЖД квитанции.
// Uses the kniga1-sections + uzel-graph algorithm (the engine that hits oracle km).
//
// Run:  npx tsx scripts/verify-distance.ts

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { computeDistance, compileGraph } from "@/lib/distance/computeDistance";
import type {
  DistanceData,
  HubEntry,
  Kniga1Row,
  UzelGraph,
} from "@/lib/distance/computeDistance";

const SEED_DIR = join(process.cwd(), "scripts", "seed-data");

function loadJson<T>(name: string): T {
  return JSON.parse(readFileSync(join(SEED_DIR, name), "utf8")) as T;
}

function runRoute(
  label: string,
  originEsr: string,
  destEsr: string,
  target: number,
  data: DistanceData,
): void {
  console.log(`\n=== ${label} : ${originEsr} → ${destEsr} (target ${target} km) ===`);

  const result = computeDistance({ originEsr, destEsr, emptyRun: false }, data);
  console.log(`  confidence: ${result.confidence}`);
  if (result.warnings.length) console.log(`  warnings: ${JSON.stringify(result.warnings)}`);
  console.log(`  legs:`);
  for (const leg of result.legs) {
    console.log(`    [${leg.kind}] ${leg.fromEsr ?? "·"} → ${leg.toEsr ?? "·"} = ${leg.km} km`);
  }

  if (result.km === null) {
    console.log(`  >>> COMPUTED: null (RED) — target ${target}  DIFF: n/a`);
  } else {
    const diff = result.km - target;
    const pct = ((diff / target) * 100).toFixed(2);
    console.log(
      `  >>> COMPUTED: ${result.km} km  | target ${target}  | DIFF ${diff >= 0 ? "+" : ""}${diff} km (${pct}%) ${Math.abs(diff) <= 1 ? "✅ EXACT" : "❌ MISMATCH"}`,
    );
  }
}

function main(): void {
  console.log("Loading seed data…");
  const kniga1 = loadJson<Kniga1Row[]>("kniga1-sections.json");
  const graph = loadJson<UzelGraph>("uzel-graph.json");
  const hubFile = loadJson<{ hubs: HubEntry[] }>("hub-distances.json");
  const specialFile = loadJson<{ overrides: Array<{ a: string; b: string; km: number }> }>(
    "special-distances.json",
  );

  console.log(`  kniga1: ${kniga1.length} rows`);
  console.log(`  graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges`);

  const compiled = compileGraph(kniga1, graph);
  const data: DistanceData = {
    kniga1,
    graph,
    hubs: hubFile.hubs ?? [],
    specials: specialFile.overrides ?? [],
    compiled,
  };

  runRoute("ROUTE A — ЭФ164189  Возрождение → Гремячая", "021609", "612709", 2444, data);
  runRoute("ROUTE B — ЭТ201459  Исеть → Набережные Челны", "771500", "648503", 699, data);
}

main();
