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

interface ByRuleOpts {
  /** Apply the §2 скоростные-линии exclusion (Москва–СПб Сапсан main-line edges). */
  readonly applySkorostnye: boolean;
  /** Merge the FULL official RZD open-data base (kniga3-official.json) as kniga3 edges. */
  readonly withOfficialBase?: boolean;
  /** Also ban the binding-shortcut Хийтola↔Окуловка edge (normally skipped — not itself HS). */
  readonly banBinding?: boolean;
}

function buildByRuleData(opts: boolean | ByRuleOpts): DistanceData {
  const o: ByRuleOpts = typeof opts === "boolean" ? { applySkorostnye: opts } : opts;
  const kniga1Base = J<Kniga1Row[]>("kniga1-sections.json");
  const transit = (tryJ<Kniga1Row[]>("kniga1-transit-attach.json") ?? []).filter(
    (r) => r && r.esr && r.uzelEsr && r.km != null,
  );
  const kniga1 = [...kniga1Base, ...transit];
  const baseGraph = J<UzelGraph>("uzel-graph.json");
  const cf = (tryJ<Array<{ aEsr?: string; bEsr?: string; km?: number }>>("uzel-graph-cisfill.json") ?? [])
    .filter((r) => r.aEsr && r.bEsr && r.km != null)
    .map((r) => ({ aEsr: String(r.aEsr), bEsr: String(r.bEsr), km: Number(r.km), uchastok: "styk", source: "kniga3" }));
  // Full official RZD open-data base — only when withOfficialBase (mirrors the gated
  // DISTANCE_KNIGA3_OFFICIAL loader in repository.ts). 99 127 directed-deduped ТП pairs.
  const official: UzelEdge[] = o.withOfficialBase ? rowsToEdges("kniga3-official.json", "kniga3", "kniga3-official") : [];
  const edges: UzelEdge[] = [
    ...baseGraph.edges,
    ...cf,
    ...rowsToEdges("kniga3-backbone-cis.priority.json", "kniga3", "cis"),
    ...rowsToEdges("kniga3-full.json", "kniga3", "k3full"),
    ...official,
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
  const skorostnye: SkorostnayaEdge[] = o.applySkorostnye
    ? (skFile?.edges ?? [])
        .filter((r) => r.aEsr && r.bEsr && (o.banBinding ? true : !r.binding_shortcut))
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

  // ── FULL official base + §2 exclusion (the prompt's KEY TEST) ───────────────────
  //
  // Wire the COMPLETE official RZD open-data base (kniga3-official.json, 99 127 ТП pairs
  // over 13 369 ТП) ON, apply the §2 скоростные-линии exclusion, and measure КС→Бологое
  // BY RULE (anchor disabled). The prompt asks: does the full base + exclusion now reach
  // ~801?  HONEST, MEASURED ANSWER: NO — it computes 539, the SAME undercut, because the
  // official base supplies BOTH the direct Хийтola(022404)↔Окуловка(053703)=429 edge AND
  // an alternate reconstruction Хийтola↔Ручьи(038101)=166 + Ручьи↔Окуловка=263 = 429, so
  // banning the Сапсан main-line edges (and even the binding shortcut) just re-routes for
  // the identical 429+70 = 539. There is NO ~801 bypass corridor even in the 13 369-ТП
  // base — exactly the VERIFICATION_CRITICAL finding in tr4-skorostnye-edges.json. Per the
  // no-fabrication / no-oracle-regression mandate the anchor 022207/050009=801 MUST STAY.
  // This test PINS that reality so a future primary-source corridor acquisition that makes
  // the rule reach 801 will visibly flip the assertion.
  it("by-RULE + FULL official base (anchor OFF): КС(022207)→Бологое(050009) still computes 539, NOT 801 — no 801-corridor exists even in 13 369 ТП", () => {
    const withBase = buildByRuleData({ applySkorostnye: true, withOfficialBase: true });
    const byRule = computeDistance({ originEsr: "022207", destEsr: "050009", emptyRun: false }, withBase);
    expect(byRule.km).toBe(539);
    expect(byRule.km).not.toBe(801);
    expect(byRule.confidence).toBe("green");

    // Banning the binding shortcut (Хийтola↔Окуловка) as well still does not reach 801 —
    // the route re-routes Хийтola→Ручьи→Окуловка for the same 429 (anti-undercut floor).
    const withBaseBan = buildByRuleData({ applySkorostnye: true, withOfficialBase: true, banBinding: true });
    const byRuleBan = computeDistance({ originEsr: "022207", destEsr: "050009", emptyRun: false }, withBaseBan);
    expect(byRuleBan.km).toBe(539);
    expect(byRuleBan.km).not.toBe(801);
  });

  // ── Official-base oracle regression guard (why the loader stays GATED OFF) ───────
  //
  // The full official base is additive shortest-per-pair. Wired live it INTRODUCES network
  // shortcuts the curated узел graph deliberately omits and REGRESSES three квитанция-verified
  // km oracles (2444→834, 3108→3095, 1432→930). This test DOCUMENTS the regression so the
  // DISTANCE_KNIGA3_OFFICIAL gate is never flipped on by accident — the engine MUST keep the
  // base OFF in production until §2 routing can be re-applied on top of it. (699 stays exact.)
  it("FULL official base REGRESSES квитанция oracles (proves the loader must stay gated OFF)", () => {
    const withBase = buildByRuleData({ applySkorostnye: true, withOfficialBase: true });
    const o2444 = computeDistance({ originEsr: "021609", destEsr: "612709", emptyRun: false }, withBase);
    const o3108 = computeDistance({ originEsr: "023202", destEsr: "528706", emptyRun: false }, withBase);
    const o1432 = computeDistance({ originEsr: "023202", destEsr: "061108", emptyRun: false }, withBase);
    const o699 = computeDistance({ originEsr: "771500", destEsr: "648503", emptyRun: false }, withBase);
    // Measured regressions — these are exactly why the official base may NOT be wired live:
    expect(o2444.km).toBeLessThan(2444); // 834 (−1610): additive shortcut
    expect(o3108.km).toBeLessThan(3108); // 3095 (−13)
    expect(o1432.km).toBeLessThan(1432); // 930 (−502)
    expect(o699.km).toBe(699); // 699 survives — the only oracle the base does not move
  });

  // ── Oracles stay EXACT in production config (official base OFF) ──────────────────
  //
  // The HARD CONSTRAINT: with the gate OFF (prod default) the 4 km oracles are all exact and
  // no route is stranded. This is the certified shipping configuration. (АЯМ/Crimea coverage
  // is asserted via the real prod loader in the two resolveDistance tests above.)
  it("PROD config (official base OFF): 4 km oracles EXACT", () => {
    const prod = buildByRuleData({ applySkorostnye: true, withOfficialBase: false });
    expect(computeDistance({ originEsr: "021609", destEsr: "612709", emptyRun: false }, prod).km).toBe(2444);
    expect(computeDistance({ originEsr: "771500", destEsr: "648503", emptyRun: false }, prod).km).toBe(699);
    expect(computeDistance({ originEsr: "023202", destEsr: "528706", emptyRun: false }, prod).km).toBe(3108);
    expect(computeDistance({ originEsr: "023202", destEsr: "061108", emptyRun: false }, prod).km).toBe(1432);
  });

});