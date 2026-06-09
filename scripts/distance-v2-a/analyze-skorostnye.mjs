// One-off analysis: identify the Москва–СПб скоростное (Сапсан) ТП-chain edges in
// OUR 652-ТП графе that the КС→Бологое route uses to shortcut to 539, and test
// whether removing them leaves a legal bypass that reaches ~801.
//
// Pure read-only: replicates repository.ts edge-merge + computeDistance backbone
// Dijkstra so we can (a) print the winning kniga3 path КС→Бологое узлы, (b) try
// deleting a candidate edge set and re-run, (c) report the resulting km + path.

import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/Users/mishanikhinkirtill/Desktop/SimpleCargo";
const SEED = join(ROOT, "scripts", "seed-data");
const J = (n) => JSON.parse(readFileSync(join(SEED, n), "utf8"));
const tryJ = (n) => { try { return J(n); } catch { return null; } };

// ── Replicate repository.ts edge merge (kniga3-source edges only matter for the
//    backbone Dijkstra, which is what КС→Бологое uses). ─────────────────────────
const baseGraph = J("uzel-graph.json");
const edges = [...baseGraph.edges];

function pushRows(rows, src, ua) {
  if (!Array.isArray(rows)) return;
  for (const r of rows) {
    if (!r.aEsr || !r.bEsr || r.km == null) continue;
    edges.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, source: src, uchastok: ua });
  }
}
// cisfill (source kniga3)
const cf = tryJ("uzel-graph-cisfill.json");
if (Array.isArray(cf)) for (const r of cf) if (r.aEsr && r.bEsr && r.km != null)
  edges.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, source: "kniga3", uchastok: "styk" });
pushRows(tryJ("kniga3-backbone-cis.priority.json"), "kniga3", "cis-bb");
pushRows(tryJ("kniga3-full.json"), "kniga3", "k3full");
const gf = tryJ("uzel-graph-gapfill.json");
if (Array.isArray(gf)) for (const r of gf) edges.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, source: r.source ?? "gapfill", uchastok: r.uchastok ?? "gf" });
const gf2 = tryJ("uzel-graph-gapfill2.json");
if (Array.isArray(gf2)) for (const r of gf2) edges.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, source: r.source ?? "gapfill2", uchastok: r.uchastok ?? "gf2" });
const k1adj = tryJ("uzel-graph-kniga1.json");
if (Array.isArray(k1adj)) for (const r of k1adj) edges.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, source: r.source ?? "kniga1-uzeladj", uchastok: r.uchastok ?? "k1adj" });
const aym = tryJ("kniga3-aym.json");
if (aym?.edges) pushRows(aym.edges, "kniga3", "aym");
const cr = tryJ("kniga-crimea.json");
if (cr?.tpEdges) pushRows(cr.tpEdges, "kniga3", "crimea");

// node name map
const nodeName = new Map();
for (const n of baseGraph.nodes) nodeName.set(n.esr, n.name);

// ── Build kniga3 backbone adjacency + directBackbone (shortest published pair) ──
function pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }
const backboneAdj = new Map();
const directBackbone = new Map();
const backboneNodes = new Set();
function pushU(adj, a, b, km, ua) {
  if (!adj.has(a)) adj.set(a, []); adj.get(a).push({ to: b, km, ua });
  if (!adj.has(b)) adj.set(b, []); adj.get(b).push({ to: a, km, ua });
}
for (const e of edges) {
  if (e.source !== "kniga3") continue;
  backboneNodes.add(e.aEsr); backboneNodes.add(e.bEsr);
  const k = pairKey(e.aEsr, e.bEsr);
  const prev = directBackbone.get(k);
  if (prev == null || e.km < prev) directBackbone.set(k, e.km);
}
for (const e of edges) {
  if (e.source !== "kniga3") continue;
  pushU(backboneAdj, e.aEsr, e.bEsr, e.km, e.uchastok);
}

// Dijkstra over kniga3 edges with the anti-undercut floor (verbatim from engine),
// optionally with a banned edge set.
function backboneTerminal(a, b, banned = new Set()) {
  if (a === b) return { km: 0, path: [a] };
  // direct-AS-IS guard ONLY if that exact pair edge isn't banned
  const directKey = pairKey(a, b);
  if (!banned.has(directKey)) {
    const d = directBackbone.get(directKey);
    if (d != null) return { km: d, path: [a, b] };
  }
  const dist = new Map([[a, 0]]);
  const prev = new Map();
  const pq = [[0, a]];
  while (pq.length) {
    pq.sort((x, y) => x[0] - y[0]);
    const [d, u] = pq.shift();
    if (u === b) break;
    if (d > (dist.get(u) ?? Infinity)) continue;
    const nb = backboneAdj.get(u);
    if (!nb) continue;
    for (const { to, km } of nb) {
      if (banned.has(pairKey(u, to))) continue;
      let nd = d + km;
      const floor = banned.has(pairKey(a, to)) ? null : directBackbone.get(pairKey(a, to));
      if (floor != null && nd < floor) nd = floor;
      if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, u); pq.push([nd, to]); }
    }
  }
  const total = dist.get(b);
  if (total == null) return null;
  const path = [];
  let x = b;
  while (x) { path.unshift(x); x = prev.get(x); }
  return { km: total, path };
}

const fmt = (p) => p.map((e) => `${nodeName.get(e) ?? "?"}(${e})`).join(" → ");

// КС=022207 spurs to which узлы? Бологое-Московское=050009 is itself a ТП узел.
// КС (Красный Сокол) — look up its kniga1 legs.
const k1 = [...J("kniga1-sections.json"), ...(tryJ("kniga1-transit-attach.json") ?? [])];
const ksLegs = k1.filter((r) => r.esr === "022207");
console.log("=== КС (022207) kniga1 legs ===");
for (const l of ksLegs) console.log(`  → ${l.uzelName}(${l.uzelEsr}) ${l.km}km [${l.uchastok}]`);

const KS_UZ = [...new Set(ksLegs.map((l) => l.uzelEsr))];
const BOL = "050009";
console.log("\n=== Бологое-Московское узел in graph? ===", backboneNodes.has(BOL));

// For each КС узел, the backbone terminal to Бологое (no ban = current 539 path)
console.log("\n=== CURRENT (no exclusion) backbone terminal КС-узел → Бологое ===");
let bestNo = null;
for (const u of KS_UZ) {
  const r = backboneTerminal(u, BOL);
  if (!r) { console.log(`  ${nodeName.get(u)}(${u}) → UNREACHABLE`); continue; }
  const leg = ksLegs.find((l) => l.uzelEsr === u).km;
  console.log(`  ${nodeName.get(u)}(${u}) bb=${r.km} +leg${leg} = ${r.km + leg}  path: ${fmt(r.path)}`);
  if (!bestNo || r.km + leg < bestNo.tot) bestNo = { tot: r.km + leg, path: r.path, u, bb: r.km, leg };
}
console.log("\nBEST no-exclusion total:", bestNo?.tot, "via", nodeName.get(bestNo?.u), "\n  full path:", fmt(bestNo.path));

export { backboneTerminal, fmt, nodeName, backboneNodes, KS_UZ, ksLegs, BOL, directBackbone, backboneAdj, pairKey };

// ── BYPASS TEST: ban candidate high-speed edges, re-run КС→Бологое ─────────────
// Build station-leg map for Бологое dest узлы (it attaches to Сонково/Лихославль/
// Окуловка/Дно/Соблаго). Dest spur узлы:
const k1all = [...J("kniga1-sections.json"), ...(tryJ("kniga1-transit-attach.json") ?? [])];
const bolLegs = k1all.filter((r) => r.esr === "050009");

function bestTotal(banned) {
  let best = null;
  for (const oLeg of ksLegs) {
    for (const dLeg of bolLegs) {
      const bk = backboneTerminal(oLeg.uzelEsr, dLeg.uzelEsr, banned);
      if (!bk) continue;
      const tot = oLeg.km + bk.km + dLeg.km;
      if (!best || tot < best.tot)
        best = { tot, oU: oLeg.uzelEsr, dU: dLeg.uzelEsr, oKm: oLeg.km, dKm: dLeg.km, bb: bk.km, path: bk.path };
    }
  }
  return best;
}

const b0 = bestTotal(new Set());
console.log("\n=== ENGINE-EQUIV best (anchor OFF, no ban) ===");
console.log(`  ${b0.tot} = ${nodeName.get(b0.oU)}+${b0.oKm} | bb ${b0.bb} ${fmt(b0.path)} | +${b0.dKm} via ${nodeName.get(b0.dU)}`);

// Сапсан Москва–СПб main-line ТП chain узлы (our graph):
const HS_NODES = ["060001", "061502", "050009", "053703", "000023"];
// consecutive main-line edges:
const HS_EDGES = [
  ["060001", "061502"], ["061502", "050009"], ["050009", "053703"], ["053703", "000023"],
];
// Also the shortcut edge the route uses: Хийтола↔Окуловка (429) — is it scored a HS edge?
const banSets = {
  "ban Окуловка↔Бологое (053703-050009)": new Set([pairKey("053703", "050009")]),
  "ban Хийтола↔Окуловка (022404-053703)": new Set([pairKey("022404", "053703")]),
  "ban all 4 main-line consecutive": new Set(HS_EDGES.map(([a, b]) => pairKey(a, b))),
  "ban main-line + Хийт↔Окул": new Set([...HS_EDGES.map(([a, b]) => pairKey(a, b)), pairKey("022404", "053703")]),
  "ban ALL edges touching Окуловка(053703)": new Set(
    (backboneAdj.get("053703") ?? []).map((nb) => pairKey("053703", nb.to))
  ),
};
for (const [lbl, banned] of Object.entries(banSets)) {
  const b = bestTotal(banned);
  if (!b) { console.log(`\n[${lbl}] → UNREACHABLE`); continue; }
  console.log(`\n[${lbl}] → ${b.tot}`);
  console.log(`   ${nodeName.get(b.oU)}+${b.oKm} | bb ${b.bb}: ${fmt(b.path)} | +${b.dKm} via ${nodeName.get(b.dU)}`);
}

// ── Find the 801 route: what dest узел + path yields ~801? ─────────────────────
console.log("\n=== PER DEST-узел best (no ban) — find the legal 801 route ===");
for (const dLeg of bolLegs) {
  let best = null;
  for (const oLeg of ksLegs) {
    const bk = backboneTerminal(oLeg.uzelEsr, dLeg.uzelEsr, new Set());
    if (!bk) continue;
    const tot = oLeg.km + bk.km + dLeg.km;
    if (!best || tot < best.tot) best = { tot, oU: oLeg.uzelEsr, oKm: oLeg.km, bb: bk.km, path: bk.path };
  }
  if (best) console.log(`  via ${nodeName.get(dLeg.uzelEsr)}(${dLeg.uzelEsr})+${dLeg.km}: ${best.tot}  [${nodeName.get(best.oU)}+${best.oKm} | bb${best.bb} ${fmt(best.path)}]`);
}

// What if we ONLY ban the Окуловка↔Бологое dest-section AND the Хийт↔Окул edge,
// forcing the route to NOT terminate at Окуловка узел?
console.log("\n=== Ban Окуловка as a usable узел entirely (drop its dest leg + all its edges) ===");
function bestTotalExclDestUzel(banEdges, dropDestUzel) {
  let best = null;
  for (const oLeg of ksLegs) {
    for (const dLeg of bolLegs) {
      if (dropDestUzel.has(dLeg.uzelEsr)) continue;
      const bk = backboneTerminal(oLeg.uzelEsr, dLeg.uzelEsr, banEdges);
      if (!bk) continue;
      const tot = oLeg.km + bk.km + dLeg.km;
      if (!best || tot < best.tot) best = { tot, oU: oLeg.uzelEsr, dU: dLeg.uzelEsr, oKm: oLeg.km, dKm: dLeg.km, bb: bk.km, path: bk.path };
    }
  }
  return best;
}
const okulEdges = new Set((backboneAdj.get("053703") ?? []).map((nb) => pairKey("053703", nb.to)));
const r1 = bestTotalExclDestUzel(okulEdges, new Set(["053703"]));
console.log(`  drop Окуловка узел: ${r1?.tot} via ${nodeName.get(r1?.dU)} [${fmt(r1?.path ?? [])}] +${r1?.dKm}`);

// ── How does Хийтола reach Окуловка at 429 when bans applied? Trace neighbors ──
console.log("\n=== Окуловка(053703) backbone neighbors (edges that feed it) ===");
const okNb = (backboneAdj.get("053703") ?? []).slice().sort((a,b)=>a.km-b.km);
const seen = new Set();
for (const e of okNb) { if (seen.has(e.to)) continue; seen.add(e.to); if (e.km < 600) console.log(`  ${nodeName.get(e.to)}(${e.to}) = ${e.km}  [${e.ua}]`); }

// Ban EVERY edge into Окуловка that is <300km (high-speed adjacency) and re-test
console.log("\n=== Ban Окуловка's short (<300) edges (the Сапсан-line approaches) ===");
const shortOk = new Set();
for (const e of okNb) if (e.km < 300) shortOk.add(pairKey("053703", e.to));
const rShort = bestTotal(shortOk);
console.log(`  → ${rShort?.tot} via ${nodeName.get(rShort?.dU)} [${fmt(rShort?.path ?? [])}] bb${rShort?.bb} +${rShort?.dKm}`);

// The dest spur Окуловка→Бологое = 70 IS the Бологое–Окуловка Сапсан segment.
// Ban it as a DEST LEG (drop Окуловка dest leg only, keep Окуловка as transit узел):
console.log("\n=== Drop ONLY Окуловка dest-leg (Бологое still reachable via other узлы) ===");
const rDrop = bestTotalExclDestUzel(new Set(), new Set(["053703"]));
console.log(`  → ${rDrop?.tot} via ${nodeName.get(rDrop?.dU)} [${fmt(rDrop?.path ?? [])}] bb${rDrop?.bb} +${rDrop?.dKm}`);

// ── Final: enumerate the Москва–СПб HS main-line consecutive ТП edges in graph ──
// Chain (Сапсан, главный ход Окт.ЖД): Москва-Ховрино(060001) — Тверь(061502) —
// Бологое(050009) — Окуловка(053703) — [Мст.мост/М.Вишера/Чудово] — СПб(000023).
// Our graph has узлы for the bold ones; intermediate (Мст.мост, М.Вишера) may be
// folded. Report each consecutive pair's published km if the edge exists.
console.log("\n=== Москва–СПб HS main-line consecutive ТП edges (final inventory) ===");
const CHAIN = [
  ["060001","Москва-Ховрино"],["061502","Тверь"],["050009","Бологое-Московское"],
  ["053703","Окуловка"],["042003","Чудово-Московское"],["000023","Санкт-Петербургский узел"],
];
for (let i=0;i<CHAIN.length-1;i++){
  const [a,an]=CHAIN[i],[b,bn]=CHAIN[i+1];
  const k=pairKey(a,b);
  const km=directBackbone.get(k);
  console.log(`  ${an}(${a}) ↔ ${bn}(${b}): ${km!=null?km+" km (EDGE EXISTS)":"no direct edge"}`);
}
// Also the binding shortcut into the HS узел Окуловка from the Карелия side:
console.log("\n  Хийтола(022404) ↔ Окуловка(053703):", directBackbone.get(pairKey("022404","053703")), "km (binding 539 shortcut)");
console.log("  Бологое(050009) ↔ Окуловка(053703) [dest-spur 70 == Бологое–Окуловка HS segment]");

// Confirm: are 060001/061502/042003 узлы present?
for (const [a,an] of CHAIN) console.log(`  узел present ${an}(${a}):`, backboneNodes.has(a));
