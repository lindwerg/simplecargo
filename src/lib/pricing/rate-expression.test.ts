import { describe, expect, it } from "vitest";

import {
  formatRateExpression,
  resolveAmount,
  type RateExpression,
} from "./rate-expression";

describe("resolveAmount", () => {
  it("resolves a flat_rub expression to its own amount", () => {
    const expr: RateExpression = { kind: "flat_rub", flatAmount: 30000 };

    const result = resolveAmount(expr);

    expect(result).toEqual({ amount: 30000, resolvable: true });
  });

  it("reports flat_rub unresolvable when no flat amount is present", () => {
    const expr: RateExpression = { kind: "flat_rub", flatAmount: null };

    const result = resolveAmount(expr);

    expect(result).toEqual({ amount: null, resolvable: false, reason: "no flat amount" });
  });

  it("reports flat_rub unresolvable when amount is zero or negative", () => {
    expect(resolveAmount({ kind: "flat_rub", flatAmount: 0 }).resolvable).toBe(false);
    expect(resolveAmount({ kind: "flat_rub", flatAmount: -100 }).resolvable).toBe(false);
  });

  it("requires a tariff base for an indicative expression", () => {
    const expr: RateExpression = { kind: "tariff_indicative", markupPct: 10 };

    const result = resolveAmount(expr);

    expect(result).toEqual({ amount: null, resolvable: false, reason: "no tariff base" });
  });

  it("requires a positive tariff base for a tariff_plus_markup expression", () => {
    const expr: RateExpression = { kind: "tariff_plus_markup", markupPct: 5 };

    expect(resolveAmount(expr, 0).resolvable).toBe(false);
    expect(resolveAmount(expr, null).resolvable).toBe(false);
  });

  it("applies +10% over a 50000 tariff base to get 55000", () => {
    const expr: RateExpression = { kind: "tariff_indicative", markupPct: 10 };

    const result = resolveAmount(expr, 50000);

    expect(result).toEqual({ amount: 55000, resolvable: true });
  });

  it("returns the base unchanged when markup is 0", () => {
    const expr: RateExpression = { kind: "tariff_plus_markup", markupPct: 0 };

    const result = resolveAmount(expr, 50000);

    expect(result).toEqual({ amount: 50000, resolvable: true });
  });

  it("treats a null markup as 0", () => {
    const expr: RateExpression = { kind: "tariff_indicative", markupPct: null };

    const result = resolveAmount(expr, 42000);

    expect(result.amount).toBe(42000);
  });

  it("supports a negative markup (discount to tariff)", () => {
    const expr: RateExpression = { kind: "tariff_plus_markup", markupPct: -20 };

    const result = resolveAmount(expr, 50000);

    expect(result).toEqual({ amount: 40000, resolvable: true });
  });

  it("rounds the resulting amount to the nearest ruble", () => {
    const expr: RateExpression = { kind: "tariff_indicative", markupPct: 7.5 };

    // 33333 * 1.075 = 35832.975 → 35833
    const result = resolveAmount(expr, 33333);

    expect(result.amount).toBe(35833);
  });
});

// Normalize the locale's non-breaking thousands separator to a plain space so the
// assertion is readable and not tied to the exact whitespace codepoint Intl emits.
function normalizeSpaces(value: string): string {
  return value.replace(/ /g, " ");
}

describe("formatRateExpression", () => {
  it("formats a flat amount as ₽/ваг", () => {
    expect(normalizeSpaces(formatRateExpression({ kind: "flat_rub", flatAmount: 30000 }))).toBe(
      "30 000 ₽/ваг",
    );
  });

  it("formats an indicative markup as +X% к тарифу", () => {
    expect(formatRateExpression({ kind: "tariff_indicative", markupPct: 10 })).toBe(
      "+10% к тарифу 10-01",
    );
  });

  it("formats a zero markup as по тарифу", () => {
    expect(formatRateExpression({ kind: "tariff_plus_markup", markupPct: 0 })).toBe(
      "по тарифу 10-01",
    );
  });

  it("formats a null markup as по тарифу", () => {
    expect(formatRateExpression({ kind: "tariff_indicative" })).toBe("по тарифу 10-01");
  });

  it("formats a negative markup with its sign", () => {
    expect(formatRateExpression({ kind: "tariff_plus_markup", markupPct: -15 })).toBe(
      "-15% к тарифу 10-01",
    );
  });
});
