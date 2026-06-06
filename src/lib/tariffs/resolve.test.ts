import { describe, expect, it } from "vitest";

import { applyIndexations, resolveTariffBase, type IndexationLike } from "./resolve";

const d = (iso: string): Date => new Date(iso);

function ix(pct: number, iso: string, appliesToClass: number | null = null): IndexationLike {
  return { pct, effectiveFrom: d(iso), appliesToClass };
}

describe("applyIndexations", () => {
  it("compounds a single applicable indexation", () => {
    const result = applyIndexations(50000, d("2025-01-01"), [ix(2, "2026-01-01")], d("2026-06-01"));

    // 50000 * 1.02 = 51000
    expect(result).toBe(51000);
  });

  it("compounds two indexations multiplicatively, not additively", () => {
    const indexations = [ix(2, "2026-01-01"), ix(3, "2026-07-01")];

    const result = applyIndexations(50000, d("2025-01-01"), indexations, d("2027-01-01"));

    // 50000 * 1.02 * 1.03 = 52530 (additive would give 50000 * 1.05 = 52500)
    expect(result).toBe(52530);
  });

  it("applies indexations in effective-date order regardless of input order", () => {
    const ascending = applyIndexations(
      50000,
      d("2025-01-01"),
      [ix(2, "2026-01-01"), ix(3, "2026-07-01")],
      d("2027-01-01"),
    );
    const shuffled = applyIndexations(
      50000,
      d("2025-01-01"),
      [ix(3, "2026-07-01"), ix(2, "2026-01-01")],
      d("2027-01-01"),
    );

    expect(shuffled).toBe(ascending);
  });

  it("excludes an indexation whose class does not match the cargo class", () => {
    const indexations = [ix(10, "2026-01-01", 1)];

    const result = applyIndexations(50000, d("2025-01-01"), indexations, d("2026-06-01"), 2);

    expect(result).toBe(50000);
  });

  it("includes a class-specific indexation when the class matches", () => {
    const indexations = [ix(10, "2026-01-01", 2)];

    const result = applyIndexations(50000, d("2025-01-01"), indexations, d("2026-06-01"), 2);

    expect(result).toBe(55000);
  });

  it("includes an all-classes (null) indexation regardless of cargo class", () => {
    const indexations = [ix(10, "2026-01-01", null)];

    const result = applyIndexations(50000, d("2025-01-01"), indexations, d("2026-06-01"), 3);

    expect(result).toBe(55000);
  });

  it("excludes an indexation effective after the as-of date", () => {
    const indexations = [ix(10, "2027-01-01")];

    const result = applyIndexations(50000, d("2025-01-01"), indexations, d("2026-06-01"));

    expect(result).toBe(50000);
  });

  it("excludes an indexation effective on or before the base's effectiveFrom", () => {
    const indexations = [ix(10, "2024-06-01")];

    const result = applyIndexations(50000, d("2025-01-01"), indexations, d("2026-06-01"));

    expect(result).toBe(50000);
  });

  it("includes every indexation <= onDate when baseFrom is null", () => {
    const indexations = [ix(2, "2020-01-01"), ix(3, "2024-01-01")];

    const result = applyIndexations(50000, null, indexations, d("2026-06-01"));

    // 50000 * 1.02 * 1.03 = 52530
    expect(result).toBe(52530);
  });

  it("rounds the compounded result to the nearest ruble", () => {
    const indexations = [ix(1.5, "2026-01-01")];

    const result = applyIndexations(33333, d("2025-01-01"), indexations, d("2026-06-01"));

    // 33333 * 1.015 = 33832.995 → 33833
    expect(result).toBe(33833);
  });

  it("returns a non-positive base untouched", () => {
    expect(applyIndexations(0, null, [ix(10, "2026-01-01")], d("2026-06-01"))).toBe(0);
    expect(applyIndexations(-100, null, [ix(10, "2026-01-01")], d("2026-06-01"))).toBe(-100);
  });
});

describe("resolveTariffBase", () => {
  it("resolves a remembered base to the indexed current ₽", () => {
    const base = { baseAmount: 50000, effectiveFrom: d("2025-01-01") };

    const result = resolveTariffBase(base, [ix(4, "2026-01-01")], d("2026-06-01"));

    expect(result).toBe(52000);
  });
});
