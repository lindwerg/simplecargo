import { computeDistance, compileGraph } from "../../src/lib/distance/computeDistance";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Replicate repository.getData but WITHOUT the special override, so we see the raw
// rule-produced km for КС→Бологое (anchor temporarily disabled).
const SEED = resolve(process.cwd(), "scripts/seed-data");
const J = (n: string) => JSON.parse(readFileSync(resolve(SEED, n), "utf8"));
const tryJ = (n: string) => { try { return J(n); } catch { return null; } };

const kniga1Base = J("kniga1-sections.json");
const transitAttach = (tryJ("kniga1-transit-attach.json") ?? []).filter((r: any) => r?.esr && r?.uzelEsr && r?.km != null);
const cisSpursFile = tryJ("cis-spurs.acquired.json");
const cisSpurs: any[] = [];
for (const s of cisSpursFile?.stations ?? []) for (const sp of s.spurs ?? []) if (sp?.tpEsr && sp.km != null) cisSpurs.push({ esr: s.stationEsr, name: s.stationName, uzelEsr: sp.tpEsr, uzelName: sp.tpName, km: sp.km, uchastok: "BY" });
const crimeaFile = tryJ("kniga-crimea.json");
const crimeaLegs = (crimeaFile?.stationLegs ?? []).filter((r: any) => r?.esr && r?.uzelEsr && r?.km != null);
const kniga1 = [...kniga1Base, ...transitAttach, ...cisSpurs, ...crimeaLegs];

const baseGraph = J("uzel-graph.json");
const e: any[] = [...baseGraph.edges];
const cf = tryJ("uzel-graph-cisfill.json"); if (Array.isArray(cf)) for (const r of cf) if (r.aEsr && r.bEsr && r.km != null) e.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, uchastok: "styk", source: "kniga3" });
function pushK3(rows: any[]) { if (Array.isArray(rows)) for (const r of rows) if (r.aEsr && r.bEsr && r.km != null) e.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, uchastok: "k3", source: "kniga3" }); }
pushK3(tryJ("kniga3-backbone-cis.priority.json"));
pushK3(tryJ("kniga3-full.json"));
const gf = tryJ("uzel-graph-gapfill.json"); if (Array.isArray(gf)) for (const r of gf) e.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, uchastok: r.uchastok ?? "gf", source: r.source ?? "gapfill" });
const gf2 = tryJ("uzel-graph-gapfill2.json"); if (Array.isArray(gf2)) for (const r of gf2) e.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, uchastok: r.uchastok ?? "gf2", source: r.source ?? "gapfill2" });
const k1adj = tryJ("uzel-graph-kniga1.json"); if (Array.isArray(k1adj)) for (const r of k1adj) e.push({ aEsr: r.aEsr, bEsr: r.bEsr, km: r.km, uchastok: r.uchastok ?? "k1adj", source: r.source ?? "kniga1-uzeladj" });
const aym = tryJ("kniga3-aym.json"); if (aym?.edges) pushK3(aym.edges);
const cr = tryJ("kniga-crimea.json"); if (cr?.tpEdges) pushK3(cr.tpEdges);

const graph = { nodes: baseGraph.nodes, edges: e };
const hubFile = J("hub-distances.json");
const hubs = (hubFile.hubs ?? []).map((h: any) => ({ hub: h.hub, km: h.km, esr: h.esr, ...(h.lines ? { lines: h.lines } : {}) }));
const uzelClassFile = tryJ("tr4-uzel-class.json");
const uzelClass = new Map<string, any>();
for (const [esr, entry] of Object.entries<any>(uzelClassFile?.uzly ?? {})) if (entry?.class) uzelClass.set(esr, { class: entry.class, ...(entry.directional ? { directional: entry.directional } : {}) });

const compiled = compileGraph(kniga1, graph);
// NO specials → anchor disabled
const data: any = { kniga1, graph, hubs, specials: [], uzelClass, compiled };

const r = computeDistance({ originEsr: "022207", destEsr: "050009" } as any, data);
console.log("КС→Бологое (anchor OFF, no exclusion):", JSON.stringify(r));

const nodeName = new Map<string, string>();
for (const n of baseGraph.nodes) nodeName.set(n.esr, n.name);
console.log("Бологое(050009) kniga1 legs:");
for (const l of kniga1.filter((x: any) => x.esr === "050009")) console.log("   →", l.uzelName, l.uzelEsr, l.km);
