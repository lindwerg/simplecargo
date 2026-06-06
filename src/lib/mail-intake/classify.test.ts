import { describe, expect, it } from "vitest";

import { parseClassifyJson } from "./classify";

describe("parseClassifyJson", () => {
  it("parses a clean JSON object", () => {
    const r = parseClassifyJson('{"bodyKind":"invoice","bodyConfidence":0.9}');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.bodyKind).toBe("invoice");
  });

  it("strips ```json fences", () => {
    const r = parseClassifyJson('```json\n{"bodyKind":"client_rfq"}\n```');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.bodyKind).toBe("client_rfq");
  });

  it("defaults missing fields to safe values", () => {
    const r = parseClassifyJson("{}");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.bodyKind).toBe("other");
      expect(r.value.attachments).toEqual([]);
    }
  });

  it("rejects non-JSON", () => {
    const r = parseClassifyJson("извините, не могу");
    expect(r.ok).toBe(false);
  });

  it("rejects an out-of-enum kind", () => {
    const r = parseClassifyJson('{"bodyKind":"spam"}');
    expect(r.ok).toBe(false);
  });
});
