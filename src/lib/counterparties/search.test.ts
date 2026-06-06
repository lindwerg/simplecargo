import { describe, expect, it } from "vitest";

import {
  DEFAULT_SIMILARITY_THRESHOLD,
  normalizeQuery,
  parseThreshold,
} from "./search";

// PURE unit tests only — no DB. searchCounterparties/addNameVariant need a live
// Postgres with pg_trgm and are covered by integration, not here.

describe("parseThreshold", () => {
  it("parses a valid decimal string", () => {
    // Arrange
    const raw = "0.5";

    // Act
    const result = parseThreshold(raw);

    // Assert
    expect(result).toBe(0.5);
  });

  it("falls back to the default for undefined input", () => {
    expect(parseThreshold(undefined)).toBe(DEFAULT_SIMILARITY_THRESHOLD);
    expect(DEFAULT_SIMILARITY_THRESHOLD).toBe(0.3);
  });

  it("falls back to the default for an empty or blank string", () => {
    expect(parseThreshold("")).toBe(0.3);
    expect(parseThreshold("   ")).toBe(0.3);
  });

  it("falls back to the default for a non-numeric string", () => {
    expect(parseThreshold("abc")).toBe(0.3);
    expect(parseThreshold("NaN")).toBe(0.3);
  });

  it("clamps values above 1 down to 1", () => {
    expect(parseThreshold("1.5")).toBe(1);
    expect(parseThreshold("42")).toBe(1);
  });

  it("clamps negative values up to 0", () => {
    expect(parseThreshold("-0.2")).toBe(0);
  });

  it("keeps the boundary values 0 and 1 unchanged", () => {
    expect(parseThreshold("0")).toBe(0);
    expect(parseThreshold("1")).toBe(1);
  });
});

describe("normalizeQuery", () => {
  it("trims leading and trailing whitespace", () => {
    expect(normalizeQuery("  Ураласбест  ")).toBe("Ураласбест");
  });

  it("collapses internal whitespace runs to a single space", () => {
    expect(normalizeQuery("Урал   асбест")).toBe("Урал асбест");
  });

  it("collapses tabs and newlines as whitespace", () => {
    expect(normalizeQuery("Урал\t\nасбест")).toBe("Урал асбест");
  });

  it("returns an empty string for a blank query", () => {
    expect(normalizeQuery("")).toBe("");
    expect(normalizeQuery("   ")).toBe("");
  });

  it("leaves an already-normalized query untouched", () => {
    expect(normalizeQuery("ТД Ресурс")).toBe("ТД Ресурс");
  });
});
