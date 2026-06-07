import { describe, expect, it } from "vitest";

import { createStoneLineSchema, updateStoneLineSchema } from "./stoneSchema";

describe("createStoneLineSchema", () => {
  it("accepts an empty payload (all fields optional)", () => {
    const r = createStoneLineSchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("coerces numeric string amounts to numbers", () => {
    const r = createStoneLineSchema.parse({
      tonnage: "1200.5",
      pricePurchase: "850",
      priceSale: "1100",
    });
    expect(r.tonnage).toBe(1200.5);
    expect(r.pricePurchase).toBe(850);
    expect(r.priceSale).toBe(1100);
  });

  it("treats empty-string amounts as undefined (left NULL)", () => {
    const r = createStoneLineSchema.parse({ tonnage: "", pricePurchase: "" });
    expect(r.tonnage).toBeUndefined();
    expect(r.pricePurchase).toBeUndefined();
  });

  it("rejects negative amounts", () => {
    const r = createStoneLineSchema.safeParse({ priceSale: "-5" });
    expect(r.success).toBe(false);
  });

  it("accepts a quarry by id", () => {
    const r = createStoneLineSchema.safeParse({
      quarry: { id: "3f2504e0-4f89-41d3-9a0c-0305e82c3301" },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a quarry by name for find-or-create", () => {
    const r = createStoneLineSchema.parse({ quarry: { name: "Карьер Асбест" } });
    expect(r.quarry).toEqual({ name: "Карьер Асбест" });
  });

  it("validates a 6-digit ESR and rejects malformed ones", () => {
    expect(createStoneLineSchema.safeParse({ locationEsr: "812308" }).success).toBe(true);
    expect(createStoneLineSchema.safeParse({ locationEsr: "12" }).success).toBe(false);
  });

  it("validates report month format", () => {
    expect(createStoneLineSchema.safeParse({ reportMonth: "2026-08" }).success).toBe(true);
    expect(createStoneLineSchema.safeParse({ reportMonth: "2026-13" }).success).toBe(false);
  });

  it("normalizes blank optional text to undefined", () => {
    const r = createStoneLineSchema.parse({ fraction: "  ", locationRaw: "" });
    expect(r.fraction).toBeUndefined();
    expect(r.locationRaw).toBeUndefined();
  });
});

describe("updateStoneLineSchema", () => {
  it("accepts a status value", () => {
    const r = updateStoneLineSchema.safeParse({ status: "active" });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown status", () => {
    const r = updateStoneLineSchema.safeParse({ status: "shipped" });
    expect(r.success).toBe(false);
  });
});
