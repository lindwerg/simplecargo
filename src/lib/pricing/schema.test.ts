import { describe, expect, it } from "vitest";

import { createPriceProtocolSchema } from "./schema";

const baseRates = [
  { originRaw: "ДОБРЯТИНО", destRaw: "НОГИНСК", wagonType: "Полувагон", rate: 19000 },
  { originRaw: "ТЮЛЬМА", destRaw: "СОБОЛЕКОВО", wagonType: "Полувагон", rate: 48000 },
];

describe("createPriceProtocolSchema", () => {
  it("accepts a protocol with 2+ rate lines and an inline new counterparty", () => {
    const parsed = createPriceProtocolSchema.safeParse({
      rnsRole: "zakazchik",
      counterparty: { name: "ООО «Вектор Движения»" },
      rates: baseRates,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.rates).toHaveLength(2);
      // defaults applied
      expect(parsed.data.vatInclusive).toBe("yes");
      expect(parsed.data.vatRate).toBe(22);
      expect(parsed.data.rates[0].rateBasis).toBe("per_wagon");
    }
  });

  it("accepts an existing counterparty referenced by id", () => {
    const parsed = createPriceProtocolSchema.safeParse({
      rnsRole: "ispolnitel",
      counterparty: { id: "00000000-0000-0000-0000-000000000000" },
      rates: baseRates,
    });
    expect(parsed.success).toBe(true);
  });

  it("coerces stringified rates from form input", () => {
    const parsed = createPriceProtocolSchema.safeParse({
      rnsRole: "zakazchik",
      counterparty: { name: "X" },
      rates: [{ originRaw: "A", destRaw: "B", wagonType: "Полувагон", rate: "19000" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.rates[0].rate).toBe(19000);
  });

  it("rejects an empty rate table", () => {
    const parsed = createPriceProtocolSchema.safeParse({
      rnsRole: "zakazchik",
      counterparty: { name: "X" },
      rates: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a non-positive rate", () => {
    const parsed = createPriceProtocolSchema.safeParse({
      rnsRole: "zakazchik",
      counterparty: { name: "X" },
      rates: [{ originRaw: "A", destRaw: "B", wagonType: "Полувагон", rate: 0 }],
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown РНС role", () => {
    const parsed = createPriceProtocolSchema.safeParse({
      rnsRole: "nobody",
      counterparty: { name: "X" },
      rates: baseRates,
    });
    expect(parsed.success).toBe(false);
  });
});
