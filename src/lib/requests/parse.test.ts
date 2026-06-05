import { describe, expect, it } from "vitest";

import { parseModelJson } from "./parse";

describe("parseModelJson", () => {
  it("parses a clean JSON object", () => {
    const out = parseModelJson('{"lines":[{"originRaw":"А","destRaw":"Б","wagonsRequested":5}]}');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.lines).toHaveLength(1);
  });

  it("strips ```json fences", () => {
    const out = parseModelJson('```json\n{"lines":[]}\n```');
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.lines).toEqual([]);
  });

  it("returns a structured failure on malformed JSON (never throws)", () => {
    const out = parseModelJson("не json вовсе");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("JSON");
  });

  it("returns a failure when the shape is invalid", () => {
    const out = parseModelJson('{"lines": "not-an-array"}');
    expect(out.ok).toBe(false);
  });
});
