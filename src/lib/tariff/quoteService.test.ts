// End-to-end tests for the calculator orchestrator (computeRzdQuote).
// Loads the real seed-data files (no DB, no network) — same as goldenN8.test.ts.

import { describe, expect, it } from "vitest";

import { computeRzdQuote } from "./quoteService";
import { isForeignEsr } from "@/lib/distance/foreignStations";

describe("computeRzdQuote — RF golden (ЭФ164189, до рубля)", () => {
  it("Возрождение→Гремячая, own ПВ class-1 щебень, 15 wagons = 1 067 770 ₽ без НДС", async () => {
    const r = await computeRzdQuote({
      originEsr: "021609",
      destEsr: "612709",
      etsngCode: "232431",
      ownership: "own",
      wagonType: "полувагон",
      wagons: [
        { capacityT: 75, count: 9, innovative: true },
        { capacityT: 75, count: 1, innovative: false },
        { capacityT: 69.5, count: 3, innovative: false },
        { capacityT: 70.3, count: 2, innovative: false },
      ],
    });
    expect(r.scope).toBe("supported");
    expect(r.distanceKm).toBe(2444);
    expect(r.tariffClass).toBe(1);
    expect(r.wagonCount).toBe(15);
    expect(r.totalNoVat).toBe(1_067_770);
    expect(r.confidence).toBe("green");
  });
});

describe("computeRzdQuote — international guard", () => {
  it("refuses a DOMESTIC price when the destination is a foreign (CIS) station", async () => {
    const r = await computeRzdQuote({
      originEsr: "021609", // RF
      destEsr: "406513", // Одесская (Одесская ж.д. — foreign)
      etsngCode: "232431",
      ownership: "own",
      wagonType: "полувагон",
      wagons: [{ capacityT: 70, count: 1, innovative: false }],
    });
    expect(r.scope).toBe("out-of-scope");
    expect(r.totalNoVat).toBeNull();
    expect(r.warnings.some((w) => /международ/i.test(w))).toBe(true);
  });
});

describe("isForeignEsr", () => {
  it("flags a CIS station and not an RF station", () => {
    expect(isForeignEsr("406513")).toBe(true); // Одесская (CIS)
    expect(isForeignEsr("021609")).toBe(false); // Возрождение (RF)
    expect(isForeignEsr("612709")).toBe(false); // Гремячая (RF)
  });
});
