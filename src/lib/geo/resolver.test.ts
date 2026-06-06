import { describe, it, expect } from "vitest";

import { scoreCandidates, classifyResult, type ScoringRow } from "@/lib/geo/resolver";

function row(overrides: Partial<ScoringRow> & Pick<ScoringRow, "esrCode" | "nameNormalized" | "trgmSim">): ScoringRow {
  return {
    name: overrides.name ?? overrides.nameNormalized,
    roadCode: overrides.roadCode ?? null,
    roadName: overrides.roadName ?? null,
    roadShort: overrides.roadShort ?? null,
    ...overrides,
  };
}

describe("scoreCandidates", () => {
  it("scores an exact normalized match as 1 even with a lower trigram sim", () => {
    const result = scoreCandidates("АСБЕСТ", [
      row({ esrCode: "780001", nameNormalized: "АСБЕСТ", trgmSim: 0.6 }),
    ]);
    expect(result[0].score).toBe(1);
  });

  it("uses trigram similarity as the base score for fuzzy matches", () => {
    const result = scoreCandidates("АЗБЕСТ", [
      row({ esrCode: "780001", nameNormalized: "АСБЕСТ", trgmSim: 0.73 }),
    ]);
    expect(result[0].score).toBeCloseTo(0.73, 5);
  });

  it("applies a road-hint boost capped at 1", () => {
    const result = scoreCandidates(
      "АЗБЕСТ",
      [row({ esrCode: "780001", nameNormalized: "АСБЕСТ", trgmSim: 0.73, roadName: "Свердловская" })],
      "Свердловская",
    );
    expect(result[0].score).toBeCloseTo(0.88, 5);
  });

  it("does not boost when the road hint does not match", () => {
    const result = scoreCandidates(
      "АЗБЕСТ",
      [row({ esrCode: "780001", nameNormalized: "АСБЕСТ", trgmSim: 0.73, roadName: "Московская" })],
      "Свердловская",
    );
    expect(result[0].score).toBeCloseTo(0.73, 5);
  });

  it("sorts candidates by score descending", () => {
    const result = scoreCandidates("ТЕСТ", [
      row({ esrCode: "a", nameNormalized: "ТЕСТА", trgmSim: 0.4 }),
      row({ esrCode: "b", nameNormalized: "ТЕСТ Б", trgmSim: 0.9 }),
    ]);
    expect(result.map((c) => c.esrCode)).toEqual(["b", "a"]);
  });
});

describe("classifyResult", () => {
  it("classifies a near-perfect top score as exact", () => {
    const candidates = scoreCandidates("АСБЕСТ", [
      row({ esrCode: "780001", nameNormalized: "АСБЕСТ", trgmSim: 0.6 }),
    ]);
    const result = classifyResult(candidates);
    expect(result.status).toBe("exact");
    expect(result.best?.esrCode).toBe("780001");
  });

  it("classifies a lone confident fuzzy match as exact (no runner-up)", () => {
    const candidates = scoreCandidates("АЗБЕСТ", [
      row({ esrCode: "780001", nameNormalized: "АСБЕСТ", trgmSim: 0.73 }),
    ]);
    const result = classifyResult(candidates);
    expect(result.status).toBe("exact");
  });

  it("classifies two close fuzzy matches as ambiguous", () => {
    const candidates = scoreCandidates("АЗБЕСТ", [
      row({ esrCode: "a", nameNormalized: "АСБЕСТ", trgmSim: 0.6 }),
      row({ esrCode: "b", nameNormalized: "АБЕСТ", trgmSim: 0.55 }),
    ]);
    const result = classifyResult(candidates);
    expect(result.status).toBe("ambiguous");
  });

  it("classifies a weak top score as none", () => {
    const candidates = scoreCandidates("ЗАГАДКА", [
      row({ esrCode: "a", nameNormalized: "ЗАГА", trgmSim: 0.28 }),
    ]);
    const result = classifyResult(candidates);
    expect(result.status).toBe("none");
  });

  it("classifies an empty candidate list as none", () => {
    const result = classifyResult([]);
    expect(result.status).toBe("none");
    expect(result.candidates).toEqual([]);
  });
});
