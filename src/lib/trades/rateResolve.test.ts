import { describe, expect, it } from "vitest";

import { pickRateForMonth, type MonthlyRateRow } from "./rateResolve.pure";

function row(month: string, client: string | null = null, owner: string | null = null): MonthlyRateRow {
  return { effectiveMonth: month, rateClient: client, rateOwner: owner };
}

describe("pickRateForMonth", () => {
  it("returns null for an empty set", () => {
    expect(pickRateForMonth([], "2026-05")).toBeNull();
  });

  it("picks the exact month when present", () => {
    const rows = [row("2026-04", "100"), row("2026-05", "200"), row("2026-06", "300")];
    const picked = pickRateForMonth(rows, "2026-05");
    expect(picked).not.toBeNull();
    expect(picked!.matched).toBe("exact");
    expect(picked!.row.rateClient).toBe("200");
  });

  it("carries forward the nearest earlier month when the exact month is missing", () => {
    const rows = [row("2026-01", "100"), row("2026-03", "300")];
    const picked = pickRateForMonth(rows, "2026-05");
    expect(picked).not.toBeNull();
    expect(picked!.matched).toBe("carry");
    expect(picked!.row.effectiveMonth).toBe("2026-03"); // nearest earlier, not the oldest
  });

  it("carries across a year boundary using lexicographic month order", () => {
    const rows = [row("2025-11", "110"), row("2025-12", "120")];
    const picked = pickRateForMonth(rows, "2026-02");
    expect(picked!.matched).toBe("carry");
    expect(picked!.row.effectiveMonth).toBe("2025-12");
  });

  it("returns null when every agreed row is in the future (no carry-back)", () => {
    const rows = [row("2026-07", "700"), row("2026-08", "800")];
    expect(pickRateForMonth(rows, "2026-05")).toBeNull();
  });

  it("prefers the exact month even when later months also exist", () => {
    const rows = [row("2026-05", "500"), row("2026-09", "900")];
    const picked = pickRateForMonth(rows, "2026-05");
    expect(picked!.matched).toBe("exact");
    expect(picked!.row.effectiveMonth).toBe("2026-05");
  });

  it("is order-independent (input rows unsorted)", () => {
    const rows = [row("2026-06"), row("2026-02", "200"), row("2026-04", "400")];
    const picked = pickRateForMonth(rows, "2026-05");
    expect(picked!.row.effectiveMonth).toBe("2026-04");
  });
});
