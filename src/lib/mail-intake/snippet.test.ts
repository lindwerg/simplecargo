import { describe, expect, it } from "vitest";

import { makeSnippet } from "./snippet";

describe("makeSnippet", () => {
  it("возвращает текст как есть, если он короткий", () => {
    expect(makeSnippet("Добрый день! Прошу ставку.")).toBe("Добрый день! Прошу ставку.");
  });

  it("схлопывает пробелы и переносы строк", () => {
    expect(makeSnippet("Привет,\n\n   мир")).toBe("Привет, мир");
  });

  it("обрезает длинный текст с многоточием", () => {
    const long = "слово ".repeat(100);
    const out = makeSnippet(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(201); // ~200 + многоточие
    expect(out!.endsWith("…")).toBe(true);
  });

  it("использует HTML как запас, вычищая теги", () => {
    expect(makeSnippet(null, "<p>Здравствуйте,&nbsp;<b>коллеги</b></p>")).toBe("Здравствуйте, коллеги");
  });

  it("возвращает null для пустого тела", () => {
    expect(makeSnippet("", null)).toBeNull();
    expect(makeSnippet("   ", "  ")).toBeNull();
    expect(makeSnippet(null, null)).toBeNull();
  });
});
