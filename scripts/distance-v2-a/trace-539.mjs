// Trace the actual 539 via the real engine, then find which kniga3 edges the
// winning path uses. Uses the compiled repository so it matches production exactly.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { register } from "node:module";

const ROOT = "/Users/mishanikhinkirtill/Desktop/SimpleCargo";
const SEED = join(ROOT, "scripts", "seed-data");

// Direct edge lookups around the key узлы to understand the chain.
const baseGraph = JSON.parse(readFileSync(join(SEED, "uzel-graph.json"), "utf8"));
const tryJ = (n) => { try { return JSON.parse(readFileSync(join(SEED, n), "utf8")); } catch { return null; } };
const nodeName = new Map();
for (const n of baseGraph.nodes) nodeName.set(n.esr, n.name);

const edges = [...baseGraph.edges];
function pushRows(rows) { if (!Array.isArray(rows)) return; for (const r of rows) if (r.aEsr && r.bEsr && r.km != null) edges.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, source: "kniga3" }); }
const cf = tryJ("uzel-graph-cisfill.json"); if (Array.isArray(cf)) for (const r of cf) if (r.aEsr && r.bEsr && r.km != null) edges.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, source: "kniga3" });
pushRows(tryJ("kniga3-backbone-cis.priority.json"));
pushRows(tryJ("kniga3-full.json"));
const aym = tryJ("kniga3-aym.json"); if (aym?.edges) pushRows(aym.edges);
const cr = tryJ("kniga-crimea.json"); if (cr?.tpEdges) pushRows(cr.tpEdges);

function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
const adj = new Map();
const direct = new Map();
for (const e of edges) {
  if (e.source !== "kniga3") continue;
  const k = pairKey(e.aEsr, e.bEsr);
  if (!direct.has(k) || e.km < direct.get(k)) direct.set(k, e.km);
}
for (const e of edges) {
  if (e.source !== "kniga3") continue;
  if (!adj.has(e.aEsr)) adj.set(e.aEsr, []); adj.get(e.aEsr).push({ to: e.bEsr, km: e.km });
  if (!adj.has(e.bEsr)) adj.set(e.bEsr, []); adj.get(e.bEsr).push({ to: e.aEsr, km: e.km });
}

// What узлы neighbor Хийтола(022404)? And what is the chain south toward Бологое?
function nbrs(esr) {
  const out = (adj.get(esr) ?? []).map((e) => `${nodeName.get(e.to) ?? "?"}(${e.to})=${e.km}`);
  return out.sort();
}
for (const esr of ["022404", "050009", "053703", "061502", "060001", "022207"]) {
  console.log(`\n${nodeName.get(esr) ?? esr}(${esr}) neighbors:\n  ${nbrs(esr).join("\n  ")}`);
}

// Specific edges of interest along Москва–СПб main line (Сапсан):
const PAIRS = [
  ["022404", "053703", "Хийтола↔Окуловка"],
  ["022404", "050009", "Хийтола↔Бологое"],
  ["050009", "053703", "Бологое↔Окуловка"],
  ["050009", "061502", "Бологое↔Тверь"],
  ["061502", "060001", "Тверь↔Москва-Ховрино"],
  ["050009", "060001", "Бологое↔Москва"],
  ["053703", "000023", "Окуловка↔СПб-узел"],
  ["050009", "000023", "Бологое↔СПб-узел"],
];
console.log("\n=== KEY PAIR EDGES (published kniga3 km) ===");
for (const [a, b, lbl] of PAIRS) {
  const k = pairKey(a, b);
  console.log(`  ${lbl}: ${direct.has(k) ? direct.get(k) + " km" : "NO DIRECT EDGE"}`);
}
