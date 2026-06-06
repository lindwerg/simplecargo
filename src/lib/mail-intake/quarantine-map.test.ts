import { describe, expect, it } from "vitest";

import { buildQuarantineRow } from "./quarantine-map";

describe("buildQuarantineRow", () => {
  it("maps each reason to a valid tier/severity/ruleId (CHECK-safe)", () => {
    const low = buildQuarantineRow({ reason: "LOW_CONFIDENCE" });
    expect(low.tier).toBe("recoverable");
    expect(low.severity).toBe("WARNING");
    expect(low.ruleId).toBe("E-01");
    expect(low.reasonCode).toBe("LOW_CONFIDENCE");

    expect(buildQuarantineRow({ reason: "UNKNOWN_SENDER" }).severity).toBe("INFO");
    expect(buildQuarantineRow({ reason: "ROLE_KIND_CONFLICT" }).ruleId).toBe("E-03");
    expect(buildQuarantineRow({ reason: "NO_LINES_EXTRACTED" }).ruleId).toBe("E-04");
    expect(buildQuarantineRow({ reason: "CARRIER_QUOTE_MANUAL" }).ruleId).toBe("E-05");
  });

  it("never emits a tier/severity outside the schema CHECK sets", () => {
    const reasons = [
      "LOW_CONFIDENCE",
      "UNKNOWN_SENDER",
      "ROLE_KIND_CONFLICT",
      "NO_LINES_EXTRACTED",
      "CARRIER_QUOTE_MANUAL",
      "UNSUPPORTED_ATTACHMENT",
    ] as const;
    for (const reason of reasons) {
      const row = buildQuarantineRow({ reason });
      expect(["fatal", "recoverable", "row_warning"]).toContain(row.tier);
      expect(["CRITICAL", "ERROR", "WARNING", "INFO"]).toContain(row.severity);
    }
  });

  it("carries the draft and source file through for no-LLM re-intake", () => {
    const row = buildQuarantineRow({
      reason: "LOW_CONFIDENCE",
      sourceFileId: "file-1",
      draft: { lines: 3 },
      agentReason: "проверьте",
    });
    expect(row.sourceFileId).toBe("file-1");
    expect(row.rawRowJson).toEqual({ lines: 3 });
    expect(row.agentReason).toBe("проверьте");
  });
});
