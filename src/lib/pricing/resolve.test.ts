import { describe, expect, it } from "vitest";

import { selectApplicableRate, type CandidateRate } from "./resolve";

function row(over: Partial<CandidateRate>): CandidateRate {
  return {
    protocolId: "p",
    rate: "1000",
    status: "active",
    validFrom: null,
    protocolDate: null,
    ...over,
  };
}

describe("selectApplicableRate", () => {
  it("returns null when there are no candidates", () => {
    expect(selectApplicableRate([])).toBeNull();
  });

  it("ignores superseded protocols even if newer", () => {
    const candidates = [
      row({ protocolId: "old", status: "active", validFrom: new Date("2025-01-01") }),
      row({ protocolId: "new", status: "superseded", validFrom: new Date("2026-01-01") }),
    ];
    expect(selectApplicableRate(candidates)?.protocolId).toBe("old");
  });

  it("prefers the newest active line by validFrom", () => {
    const candidates = [
      row({ protocolId: "a", validFrom: new Date("2025-01-01") }),
      row({ protocolId: "b", validFrom: new Date("2026-03-01") }),
      row({ protocolId: "c", validFrom: new Date("2025-06-01") }),
    ];
    expect(selectApplicableRate(candidates)?.protocolId).toBe("b");
  });

  it("falls back to protocolDate when validFrom is absent", () => {
    const candidates = [
      row({ protocolId: "a", protocolDate: new Date("2025-01-01") }),
      row({ protocolId: "b", protocolDate: new Date("2026-01-01") }),
    ];
    expect(selectApplicableRate(candidates)?.protocolId).toBe("b");
  });

  it("excludes lines whose validFrom is after the as-of date", () => {
    const candidates = [
      row({ protocolId: "current", validFrom: new Date("2025-01-01") }),
      row({ protocolId: "future", validFrom: new Date("2026-12-01") }),
    ];
    const onDate = new Date("2026-06-01");
    expect(selectApplicableRate(candidates, { onDate })?.protocolId).toBe("current");
  });

  it("returns null when every candidate is superseded", () => {
    const candidates = [row({ status: "superseded" }), row({ status: "superseded" })];
    expect(selectApplicableRate(candidates)).toBeNull();
  });
});
