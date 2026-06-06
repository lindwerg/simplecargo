import { describe, it, expect } from "vitest";

import { resolveRoad, cleanRoadName, ROAD_REGISTRY, ALL_ROADS } from "@/lib/geo/roads";

describe("resolveRoad", () => {
  it("resolves a known RF road to its authoritative code", () => {
    expect(resolveRoad("Свердловская")?.rzdCode).toBe(76);
  });

  it("resolves Горьковская to 24 (matches schema comment)", () => {
    expect(resolveRoad("Горьковская")?.rzdCode).toBe(24);
  });

  it("resolves the Latvian typo via the known fix", () => {
    expect(resolveRoad("Латвийска")?.rzdCode).toBe(106);
  });

  it("resolves a legal-wrapped CIS road name", () => {
    expect(resolveRoad('ЗАО "Южно-Кавказская железная дорога"')?.rzdCode).toBe(115);
  });

  it("resolves the Якутская operator wrapper", () => {
    expect(resolveRoad('ОАО АК "Железные дороги Якутии"')?.rzdCode).toBe(98);
  });

  it("resolves «ФГУП \"КЖД\"» to Крымская", () => {
    expect(resolveRoad('ФГУП "КЖД"')?.rzdCode).toBe(99);
  });

  it("returns null for an unknown road", () => {
    expect(resolveRoad("Мелитопольская")).toBeNull();
    expect(resolveRoad('ООО "Рубикон"')).toBeNull();
    expect(resolveRoad("")).toBeNull();
  });
});

describe("cleanRoadName", () => {
  it("strips legal wrapper and quotes from a CIS road", () => {
    expect(cleanRoadName('ЗАО "Южно-Кавказская железная дорога"')).toBe("Южно-Кавказская");
  });

  it("fixes the Латвийска typo", () => {
    expect(cleanRoadName("Латвийска")).toBe("Латвийская");
  });

  it("leaves a clean RF name untouched", () => {
    expect(cleanRoadName("Свердловская")).toBe("Свердловская");
  });
});

describe("ROAD_REGISTRY", () => {
  it("is keyed by lowercased canonical name", () => {
    expect(ROAD_REGISTRY.get("свердловская")?.shortCode).toBe("СВР");
  });

  it("contains all canonical roads with unique codes", () => {
    const codes = new Set(ALL_ROADS.map((r) => r.rzdCode));
    expect(codes.size).toBe(ALL_ROADS.length);
  });
});
