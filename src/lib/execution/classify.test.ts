import { describe, expect, it } from "vitest";

import { classifyWagon, type DirectionCtx, type MovementSnapshot } from "./classify";

const ORIGIN = "111111";
const DEST = "999999";
const CTX: DirectionCtx = { stationOriginEsr: ORIGIN, stationDestEsr: DEST };

// Snapshot builder with sane defaults; override only what a case cares about.
function snap(over: Partial<MovementSnapshot>): MovementSnapshot {
  return {
    wagonNumber: "52266772",
    operationCode: null,
    operationName: null,
    loadState: null,
    departTs: null,
    arriveTs: null,
    stationCurrentEsr: null,
    stationDestEsr: DEST,
    distRemainingKm: null,
    daysInOperation: null,
    ...over,
  };
}

describe("classifyWagon — buckets (R1–R11)", () => {
  it("R1 addressed: no snapshot → addressed, no review", () => {
    const c = classifyWagon(null, CTX, "52266772");
    expect(c.bucket).toBe("addressed");
    expect(c.needsReview).toBe(false);
    expect(c.wagonNumber).toBe("52266772");
  });

  it("R2 UNKNOWN operation → at_station + needsReview (no LLM)", () => {
    const c = classifyWagon(snap({ operationCode: "XZ99", loadState: "ПОР" }), CTX);
    expect(c.bucket).toBe("at_station");
    expect(c.needsReview).toBe(true);
    expect(c.opCategory).toBe("UNKNOWN");
  });

  it("R3 loading: LOAD op (ПОГР) → loading", () => {
    const c = classifyWagon(snap({ operationCode: "ПОГР", loadState: "ПОР" }), CTX);
    expect(c.bucket).toBe("loading");
  });

  it("R4 at_station: ARRIVE empty at origin → at_station", () => {
    const c = classifyWagon(
      snap({ operationCode: "ПРИБ", loadState: "ПОР", stationCurrentEsr: ORIGIN }),
      CTX,
    );
    expect(c.bucket).toBe("at_station");
    expect(c.needsReview).toBe(false);
  });

  it("R5 in_transit: ARRIVE loaded at dest → in_transit", () => {
    const c = classifyWagon(
      snap({ operationCode: "ПРИБ", loadState: "ГРУЖ", stationCurrentEsr: DEST }),
      CTX,
    );
    expect(c.bucket).toBe("in_transit");
  });

  it("R6 unloaded: UNLOAD op (УВПП) → unloaded", () => {
    const c = classifyWagon(snap({ operationCode: "УВПП", loadState: "ПОР" }), CTX);
    expect(c.bucket).toBe("unloaded");
  });

  it("R6 unloaded: empty at dest with no decisive op → unloaded", () => {
    const c = classifyWagon(
      snap({ operationCode: "ПРИБ", loadState: "ПОР", stationCurrentEsr: DEST }),
      CTX,
    );
    expect(c.bucket).toBe("unloaded");
  });

  it("R7 approaching: EMPTY_DISP (ПОРПР) → approaching", () => {
    const c = classifyWagon(snap({ operationCode: "ПОРПР", loadState: "ПОР" }), CTX);
    expect(c.bucket).toBe("approaching");
  });

  it("R8 in_transit: DEPART loaded (ОТПР, ГРУЖ) → in_transit", () => {
    const c = classifyWagon(snap({ operationCode: "ОТПР", loadState: "ГРУЖ" }), CTX);
    expect(c.bucket).toBe("in_transit");
  });

  it("R9 approaching: DEPART empty (ОТПР, ПОР) → approaching", () => {
    const c = classifyWagon(snap({ operationCode: "ОТПР", loadState: "ПОР" }), CTX);
    expect(c.bucket).toBe("approaching");
  });

  it("R10 loaded_waiting: ГРУЖ at origin, no decisive op → loaded_waiting", () => {
    const c = classifyWagon(
      snap({ operationCode: "ПРИБ", loadState: "ГРУЖ", stationCurrentEsr: ORIGIN }),
      CTX,
    );
    expect(c.bucket).toBe("loaded_waiting");
  });

  it("R11a fallback: ГРУЖ, unknown station, generic arrive → in_transit", () => {
    const c = classifyWagon(
      snap({ operationCode: "ПРИБ", loadState: "ГРУЖ", stationCurrentEsr: "555555" }),
      CTX,
    );
    expect(c.bucket).toBe("in_transit");
  });

  it("R11b fallback: ПОР, unknown station, generic arrive → approaching", () => {
    const c = classifyWagon(
      snap({ operationCode: "ПРИБ", loadState: "ПОР", stationCurrentEsr: "555555" }),
      CTX,
    );
    expect(c.bucket).toBe("approaching");
  });

  it("R11c fallback: UNKNOWN load + recognized but indecisive op → at_station + review", () => {
    const c = classifyWagon(
      snap({ operationCode: "ПРИБ", loadState: "UNKNOWN", stationCurrentEsr: "555555" }),
      CTX,
    );
    expect(c.bucket).toBe("at_station");
    expect(c.needsReview).toBe(true);
  });

  it("classifies by operationName when code is absent (ОТПГР → DEPART)", () => {
    const c = classifyWagon(
      snap({ operationName: "ОТПРАВЛЕНИЕ ГРУЖЁНОГО", loadState: "ГРУЖ" }),
      CTX,
    );
    expect(c.opCategory).toBe("DEPART");
    expect(c.bucket).toBe("in_transit");
  });
});

describe("classifyWagon — distance buckets", () => {
  it("≤100 km → le100 (approaching)", () => {
    const c = classifyWagon(snap({ operationCode: "ОТПР", loadState: "ПОР", distRemainingKm: 80 }), CTX);
    expect(c.bucket).toBe("approaching");
    expect(c.distBucket).toBe("le100");
  });

  it("≤300 km → le300 (in_transit)", () => {
    const c = classifyWagon(snap({ operationCode: "ОТПР", loadState: "ГРУЖ", distRemainingKm: 250 }), CTX);
    expect(c.distBucket).toBe("le300");
  });

  it("≤500 km → le500", () => {
    const c = classifyWagon(snap({ operationCode: "ОТПР", loadState: "ГРУЖ", distRemainingKm: 480 }), CTX);
    expect(c.distBucket).toBe("le500");
  });

  it(">500 km → gt500", () => {
    const c = classifyWagon(snap({ operationCode: "ОТПР", loadState: "ГРУЖ", distRemainingKm: 1200 }), CTX);
    expect(c.distBucket).toBe("gt500");
  });

  it("null distance on a moving wagon → unknown", () => {
    const c = classifyWagon(snap({ operationCode: "ОТПР", loadState: "ГРУЖ", distRemainingKm: null }), CTX);
    expect(c.distBucket).toBe("unknown");
  });

  it("distance forced to unknown for non-moving buckets (loading)", () => {
    const c = classifyWagon(snap({ operationCode: "ПОГР", loadState: "ПОР", distRemainingKm: 50 }), CTX);
    expect(c.bucket).toBe("loading");
    expect(c.distBucket).toBe("unknown");
  });
});

describe("classifyWagon — passthrough fields", () => {
  it("carries daysInOperation and loadState through", () => {
    const c = classifyWagon(
      snap({ operationCode: "ОТПР", loadState: "ГРУЖ", daysInOperation: 7 }),
      CTX,
    );
    expect(c.daysInOperation).toBe(7);
    expect(c.loadState).toBe("ГРУЖ");
  });
});
