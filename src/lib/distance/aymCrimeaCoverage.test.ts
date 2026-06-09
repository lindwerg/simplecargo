// Coverage assertions for the newly-wired АЯМ (ЖД Якутии) + Crimea overlays.
// These stations were UNREACHABLE before kniga3-aym.json / kniga-crimea.json were wired
// into repository.ts. The km values are confidence=yellow (CSV-«Транзитные пункты»-derived,
// not yet certified against a квитанция), so we assert COVERAGE (resolves to a finite green
// km), not a hardcoded oracle value. The 4 certified distance oracles remain in
// computeDistance.test.ts and are unaffected (these overlays are additive).
import { describe, it, expect } from "vitest";
import { resolveDistance } from "./repository";

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
});
