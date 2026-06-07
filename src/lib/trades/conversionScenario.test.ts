import { describe, expect, it } from "vitest";

import {
  effectiveChoice,
  hasTransportShape,
  resolveLineComponent,
  type ConvertScenario,
  type LineShape,
} from "./conversionScenario";

const transportLine: LineShape = {
  id: "a",
  originRaw: "Асбест",
  destRaw: "Тюмень",
  wagonsRequested: 10,
};

const noRouteLine: LineShape = {
  id: "b",
  originRaw: "Карьер",
  destRaw: null,
  wagonsRequested: 5,
};

const noWagonsLine: LineShape = {
  id: "c",
  originRaw: "Асбест",
  destRaw: "Тюмень",
  wagonsRequested: 0,
};

describe("hasTransportShape", () => {
  it("is true with origin, dest and a positive wagon count", () => {
    expect(hasTransportShape(transportLine)).toBe(true);
  });

  it("is false when the destination is missing", () => {
    expect(hasTransportShape(noRouteLine)).toBe(false);
  });

  it("is false when there are no wagons", () => {
    expect(hasTransportShape(noWagonsLine)).toBe(false);
  });

  it("treats whitespace-only stations as missing", () => {
    expect(hasTransportShape({ id: "d", originRaw: "  ", destRaw: "Тюмень", wagonsRequested: 3 })).toBe(
      false,
    );
  });
});

describe("resolveLineComponent", () => {
  it("respects an explicit transport choice even for a stone-shaped line", () => {
    expect(resolveLineComponent(noWagonsLine, "transport")).toBe("transport");
  });

  it("respects an explicit stone choice even for a transport-shaped line", () => {
    expect(resolveLineComponent(transportLine, "stone")).toBe("stone");
  });

  it("auto-picks transport for a route + wagons line", () => {
    expect(resolveLineComponent(transportLine, "auto")).toBe("transport");
  });

  it("auto-picks stone when the line lacks a usable route", () => {
    expect(resolveLineComponent(noRouteLine, "auto")).toBe("stone");
  });
});

describe("effectiveChoice", () => {
  const scenario: ConvertScenario = {
    default: "auto",
    perLine: { a: "stone" },
  };

  it("uses the per-line override when present", () => {
    expect(effectiveChoice(scenario, "a")).toBe("stone");
  });

  it("falls back to the default when no override exists", () => {
    expect(effectiveChoice(scenario, "z")).toBe("auto");
  });

  it("falls back to the default when perLine is absent", () => {
    expect(effectiveChoice({ default: "transport" }, "a")).toBe("transport");
  });
});
