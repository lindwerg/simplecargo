// Coverage assertions for the newly-wired АЯМ (ЖД Якутии) + Crimea overlays.
// These stations were UNREACHABLE before kniga3-aym.json / kniga-crimea.json were wired
// into repository.ts. The km values are confidence=yellow (CSV-«Транзитные пункты»-derived,
// not yet certified against a квитанция), so we assert COVERAGE (resolves to a finite green
// km), not a hardcoded oracle value. The 4 certified distance oracles remain in
// computeDistance.test.ts and are unaffected (these overlays are additive).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { resolveDistance } from "./repository";
import {
  compileGraph,
  computeDistance,
  type DistanceData,
  type HubEntry,
  type Kniga1Row,
  type SkorostnayaEdge,
  type UzelClass,
  type UzelEdge,
  type UzelGraph,
} from "./computeDistance";

// ── By-RULE harness: anchor temporarily DISABLED (specials=[]), скоростные-линии
//    exclusion ON. Measures КС(022207)→Бологое(050009) from the graph + rule alone,
//    replicating repository.ts's edge merge. This is the SKOROSTNYE_RULE verification:
//    does the general «в обход … скоростных линий» rule reach the verified 801 without
//    the special-distances anchor? (Documented finding below.) ────────────────────
const SEED = resolve(process.cwd(), "scripts/seed-data");
const J = <T,>(n: string): T => JSON.parse(readFileSync(resolve(SEED, n), "utf8")) as T;
const tryJ = <T,>(n: string): T | null => {
  try {
    return J<T>(n);
  } catch {
    return null;
  }
};

function rowsToEdges(n: string, src: string, ua: string): UzelEdge[] {
  const d = tryJ<unknown>(n);
  if (!d) return [];
  const arr: ReadonlyArray<Record<string, unknown>> = Array.isArray(d)
    ? (d as Record<string, unknown>[])
    : (((d as Record<string, unknown>).edges ?? (d as Record<string, unknown>).tpEdges ?? []) as Record<string, unknown>[]);
  return arr
    .filter((r) => r.aEsr && r.bEsr && r.km != null)
    .map((r) => ({
      aEsr: String(r.aEsr),
      bEsr: String(r.bEsr),
      km: Number(r.km),
      uchastok: (r.uchastok as string) ?? ua,
      source: (r.source as string) ?? src,
    }));
}

function buildByRuleData(applySkorostnye: boolean): DistanceData {
  const kniga1Base = J<Kniga1Row[]>("kniga1-sections.json");
  const transit = (tryJ<Kniga1Row[]>("kniga1-transit-attach.json") ?? []).filter(
    (r) => r && r.esr && r.uzelEsr && r.km != null,
  );
  const kniga1 = [...kniga1Base, ...transit];
  const baseGraph = J<UzelGraph>("uzel-graph.json");
  const cf = (tryJ<Array<{ aEsr?: string; bEsr?: string; km?: number }>>("uzel-graph-cisfill.json") ?? [])
    .filter((r) => r.aEsr && r.bEsr && r.km != null)
    .map((r) => ({ aEsr: String(r.aEsr), bEsr: String(r.bEsr), km: Number(r.km), uchastok: "styk", source: "kniga3" }));
  const edges: UzelEdge[] = [
    ...baseGraph.edges,
    ...cf,
    ...rowsToEdges("kniga3-backbone-cis.priority.json", "kniga3", "cis"),
    ...rowsToEdges("kniga3-full.json", "kniga3", "k3full"),
    ...rowsToEdges("uzel-graph-gapfill.json", "gapfill", "gf"),
    ...rowsToEdges("uzel-graph-gapfill2.json", "gapfill2", "gf2"),
    ...rowsToEdges("uzel-graph-kniga1.json", "kniga1-uzeladj", "k1adj"),
    ...rowsToEdges("kniga3-aym.json", "kniga3", "aym"),
    ...rowsToEdges("kniga-crimea.json", "kniga3", "crimea"),
  ];
  const graph: UzelGraph = { nodes: baseGraph.nodes, edges };
  const hubFile = J<{ hubs: HubEntry[] }>("hub-distances.json");
  const hubs = (hubFile.hubs ?? []).map((h) => ({
    hub: h.hub,
    km: h.km,
    esr: h.esr,
    ...(h.lines ? { lines: h.lines } : {}),
  }));
  const uzelClass = new Map<string, UzelClass>();
  const ucFile = tryJ<{ uzly?: Record<string, { class?: string; directional?: string }> }>("tr4-uzel-class.json");
  for (const [esr, e] of Object.entries(ucFile?.uzly ?? {})) {
    if (e && typeof e.class === "string") {
      uzelClass.set(esr, { class: e.class, ...(e.directional ? { directional: e.directional } : {}) });
    }
  }
  const skFile = tryJ<{ edges?: Array<{ aEsr?: string; bEsr?: string; binding_shortcut?: boolean }> }>(
    "tr4-skorostnye-edges.json",
  );
  const skorostnye: SkorostnayaEdge[] = applySkorostnye
    ? (skFile?.edges ?? [])
        .filter((r) => r.aEsr && r.bEsr && !r.binding_shortcut)
        .map((r) => ({ aEsr: String(r.aEsr), bEsr: String(r.bEsr) }))
    : [];
  const compiled = compileGraph(kniga1, graph, skorostnye);
  // specials=[] => ANCHOR TEMPORARILY DISABLED for the by-rule probe.
  return { kniga1, graph, hubs, specials: [], uzelClass, compiled };
}

describe("АЯМ / Crimea coverage (newly wired, additive overlays)", () => {
  it("ЖД Якутии: Нижний Бестях(913403) → Тында(910000) now resolves (was unreachable)", async () => {
    const r = await resolveDistance({ originEsr: "913403", destEsr: "910000", emptyRun: false });
    expect(r.km).toBeGreaterThan(0);
    expect(r.km).toBeLessThan(3000);
    expect(r.confidence).toBe("green");
  });

  it("Crimea: Джанкой(856200) → Соленое Озеро эксп.(856107) now resolves (was unreachable)", async () => {
    const r = await resolveDistance({ originEsr: "856200", destEsr: "856107", emptyRun: false });
    expect(r.km).toBeGreaterThan(0);
    expect(r.km).toBeLessThan(3000);
    expect(r.confidence).toBe("green");
  });

  it("Красный Сокол(022207) → Бологое-Московское(050009) = 801 km (выверенный оплатой якорь; legal freight, обход Сапсан-хода)", async () => {
    const r = await resolveDistance({ originEsr: "022207", destEsr: "050009", emptyRun: false });
    expect(r.km).toBe(801);
    expect(r.confidence).toBe("green");
  });

  // ── SKOROSTNYE_RULE by-rule verification (anchor temporarily DISABLED) ──────────
  //
  // ТР-1 2026 §I п.4 «в обход … скоростных линий» is now wired (tr4-skorostnye-edges.json
  // → CompiledGraph.skorostnyeEdges → backboneTerminal skips them). HONEST FINDING: with
  // the special-distances anchor disabled, the rule alone does NOT reach the verified 801.
  // The 539 undercut rides the PUBLISHED kniga3 ТП↔ТП edge Хийтola(022404)↔Окуловка(053703)
  // =429 (NOT itself a designated скоростная линия — excluding it would be fabrication) plus
  // a 70 km Окуловка→Бологое dest-spur. Banning the 5 genuinely-sourced Москва–СПб HS main-
  // line edges changes nothing because the 539 path does not ride them; the engine even
  // re-routes Хийтola→Ручьи→Окуловка=429 if that edge is dropped (anti-undercut floor). The
  // nearest legal in-graph alternative is 851 via Дно — there is NO ~801 corridor in the
  // current 652-ТП graph. Therefore the anchor MUST STAY as backup. This test PINS the
  // by-rule km so a future graph acquisition that introduces the real Хийтola→СПб→
  // (Дно/Новосокольники)→Бологое 801-corridor edges will visibly flip this assertion.
  it("by-RULE (anchor OFF): КС(022207)→Бологое(050009) — скоростные-линии exclusion ON, documents 539 (anchor still required for 801)", () => {
    const dataNoSk = buildByRuleData(false);
    const baseline = computeDistance({ originEsr: "022207", destEsr: "050009", emptyRun: false }, dataNoSk);
    const dataSk = buildByRuleData(true);
    const byRule = computeDistance({ originEsr: "022207", destEsr: "050009", emptyRun: false }, dataSk);

    // Documented by-rule reality: exclusion is oracle-safe but cannot reach 801 in-graph.
    expect(baseline.km).toBe(539);
    expect(byRule.km).toBe(539);
    // NOT YET 801 from the rule alone — the anchor (special-distances.json) supplies 801.
    expect(byRule.km).not.toBe(801);
    expect(byRule.confidence).toBe("green");
  });

});