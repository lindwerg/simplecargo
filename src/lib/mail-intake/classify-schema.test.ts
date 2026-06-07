import { describe, expect, it } from "vitest";

import { classifyResultSchema, effectiveEmailKind } from "./classify-schema";

describe("effectiveEmailKind", () => {
  it("uses bodyKind when the body is meaningful", () => {
    const c = classifyResultSchema.parse({ bodyKind: "client_rfq", bodyConfidence: 0.9 });
    expect(effectiveEmailKind(c)).toEqual({ kind: "client_rfq", confidence: 0.9 });
  });

  it("falls back to the attachment kind for an attachment-only email (body=other)", () => {
    const c = classifyResultSchema.parse({
      bodyKind: "other",
      bodyConfidence: 0.5,
      attachments: [{ index: 0, kind: "dislocation", confidence: 0.8, reason: "сводка" }],
    });
    expect(effectiveEmailKind(c)).toEqual({ kind: "dislocation", confidence: 0.8 });
  });

  it("picks the most frequent attachment kind, tie broken by confidence", () => {
    const c = classifyResultSchema.parse({
      bodyKind: "other",
      bodyConfidence: 0,
      attachments: [
        { index: 0, kind: "document", confidence: 0.7, reason: "" },
        { index: 1, kind: "document", confidence: 0.6, reason: "" },
        { index: 2, kind: "invoice", confidence: 0.95, reason: "" },
      ],
    });
    expect(effectiveEmailKind(c).kind).toBe("document"); // 2× document beats 1× invoice
  });

  it("stays other when nothing is typed", () => {
    const c = classifyResultSchema.parse({
      bodyKind: "other",
      bodyConfidence: 0.1,
      attachments: [{ index: 0, kind: "other", confidence: 0.2, reason: "" }],
    });
    expect(effectiveEmailKind(c).kind).toBe("other");
  });
});
