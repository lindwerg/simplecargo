import { describe, expect, test } from "vitest";

import {
  WAGON_TYPES,
  isKnownWagonType,
  normalizeWagonType,
  wagonTypeLabel,
} from "./wagon-type";

describe("WAGON_TYPES registry", () => {
  test("covers every required canonical code", () => {
    // Arrange
    const required = [
      "ПВ",
      "ПЛ",
      "ФП",
      "КР",
      "ЦС",
      "ХП",
      "ХМ",
      "ХЗ",
      "ХЦ",
      "ДМ",
      "РФ",
      "ОК",
      "ТР",
      "КН",
    ];

    // Act
    const codes = WAGON_TYPES.map((type) => type.code);

    // Assert
    for (const code of required) {
      expect(codes).toContain(code);
    }
  });

  test("has unique codes", () => {
    const codes = WAGON_TYPES.map((type) => type.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test("stores every synonym in lowercase", () => {
    for (const type of WAGON_TYPES) {
      for (const synonym of type.synonyms) {
        expect(synonym).toBe(synonym.toLowerCase());
      }
    }
  });
});

describe("normalizeWagonType — canonical resolution", () => {
  test("resolves full Russian word to its code", () => {
    expect(normalizeWagonType("полувагон")?.code).toBe("ПВ");
  });

  test("resolves the code itself", () => {
    expect(normalizeWagonType("ПВ")?.code).toBe("ПВ");
  });

  test("resolves a Russian plural", () => {
    expect(normalizeWagonType("цистерны")?.code).toBe("ЦС");
  });

  test("resolves a multi-word label", () => {
    expect(normalizeWagonType("крытый вагон")?.code).toBe("КР");
  });

  test("resolves the fitting platform label", () => {
    expect(normalizeWagonType("фитинговая платформа")?.code).toBe("ФП");
  });

  test("resolves bare платформа to ПЛ, not ФП", () => {
    expect(normalizeWagonType("платформа")?.code).toBe("ПЛ");
  });

  test("returns the canonical label alongside the code", () => {
    expect(normalizeWagonType("полувагон")).toEqual({ code: "ПВ", label: "Полувагон" });
  });
});

describe("normalizeWagonType — voice/text noise tolerance", () => {
  test("is case insensitive", () => {
    expect(normalizeWagonType("ПОЛУВАГОН")?.code).toBe("ПВ");
    expect(normalizeWagonType("пв")?.code).toBe("ПВ");
  });

  test("tolerates surrounding whitespace", () => {
    expect(normalizeWagonType("   цистерна   ")?.code).toBe("ЦС");
  });

  test("tolerates split-word dictation noise", () => {
    expect(normalizeWagonType("полу вагон")?.code).toBe("ПВ");
  });

  test("strips trailing punctuation", () => {
    expect(normalizeWagonType("крытый вагон!!")?.code).toBe("КР");
  });

  test("matches a target embedded in a longer phrase", () => {
    expect(normalizeWagonType("нужен крытый под груз")?.code).toBe("КР");
  });

  test("resolves English transliteration", () => {
    expect(normalizeWagonType("gondola")?.code).toBe("ПВ");
  });

  test("resolves a hyphenated hopper variant", () => {
    expect(normalizeWagonType("хоппер-зерновоз")?.code).toBe("ХЗ");
    expect(normalizeWagonType("зерновоз")?.code).toBe("ХЗ");
  });
});

describe("normalizeWagonType — no confident match", () => {
  test("returns null for an unrelated word", () => {
    expect(normalizeWagonType("банан")).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(normalizeWagonType("")).toBeNull();
  });

  test("returns null for whitespace-only input", () => {
    expect(normalizeWagonType("   ")).toBeNull();
  });

  test("returns null for null", () => {
    expect(normalizeWagonType(null)).toBeNull();
  });

  test("returns null for undefined", () => {
    expect(normalizeWagonType(undefined)).toBeNull();
  });

  test("returns null for punctuation-only input", () => {
    expect(normalizeWagonType("!!!")).toBeNull();
  });
});

describe("wagonTypeLabel", () => {
  test("returns the label for a known code", () => {
    expect(wagonTypeLabel("ЦС")).toBe("Цистерна");
  });

  test("returns undefined for an unknown code", () => {
    expect(wagonTypeLabel("ZZ")).toBeUndefined();
  });
});

describe("isKnownWagonType", () => {
  test("is true for a registered code", () => {
    expect(isKnownWagonType("ФП")).toBe(true);
  });

  test("is false for an unregistered code", () => {
    expect(isKnownWagonType("ZZ")).toBe(false);
  });
});
