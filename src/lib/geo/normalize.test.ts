import { describe, it, expect } from "vitest";

import { normalizeStationName, normalizeWhitespace } from "@/lib/geo/normalize";

describe("normalizeStationName", () => {
  it("uppercases a simple Cyrillic name", () => {
    expect(normalizeStationName("Асбест")).toBe("АСБЕСТ");
  });

  it("strips a parenthetical qualifier and joins hyphenated parts with a space", () => {
    expect(normalizeStationName("Москва-Сортировочная (ОП.)")).toBe("МОСКВА СОРТИРОВОЧНАЯ");
  });

  it("normalizes Ё to Е", () => {
    expect(normalizeStationName("Орёл")).toBe("ОРЕЛ");
    expect(normalizeStationName("ёлкино")).toBe("ЕЛКИНО");
  });

  it("strips multiple parenthetical groups and collapses whitespace", () => {
    expect(normalizeStationName("Тест (б. №9З) (эксп.)")).toBe("ТЕСТ");
  });

  it("trims leading/trailing whitespace from raw source rows", () => {
    expect(normalizeStationName(" 1268 км (БП.)")).toBe("1268 КМ");
  });

  it("is idempotent", () => {
    const once = normalizeStationName("Москва-Сортировочная (ОП.)");
    expect(normalizeStationName(once)).toBe(once);
  });

  it("returns empty string for empty input", () => {
    expect(normalizeStationName("")).toBe("");
  });

  it("replaces non-word punctuation with spaces", () => {
    expect(normalizeStationName("Ростов/Дон")).toBe("РОСТОВ ДОН");
  });
});

describe("normalizeWhitespace", () => {
  it("collapses runs of whitespace and trims", () => {
    expect(normalizeWhitespace("  a   b\tc  ")).toBe("a b c");
  });
});
