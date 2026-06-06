import { describe, expect, it } from "vitest";

import { decideRfqDisposition } from "./thresholds";

describe("decideRfqDisposition", () => {
  it("auto-files a high-confidence client RFQ from a known client", () => {
    const r = decideRfqDisposition({ confidence: 0.92, senderRoles: ["client"], hasLines: true });
    expect(r.disposition).toBe("auto");
    expect(r.reason).toBeNull();
  });

  it("quarantines when no valid lines extracted", () => {
    const r = decideRfqDisposition({ confidence: 0.99, senderRoles: ["client"], hasLines: false });
    expect(r.disposition).toBe("quarantine");
    expect(r.reason).toBe("NO_LINES_EXTRACTED");
  });

  it("ignores very-low-confidence noise", () => {
    const r = decideRfqDisposition({ confidence: 0.4, senderRoles: ["client"], hasLines: true });
    expect(r.disposition).toBe("ignore");
  });

  it("quarantines an unknown sender", () => {
    const r = decideRfqDisposition({ confidence: 0.95, senderRoles: null, hasLines: true });
    expect(r.disposition).toBe("quarantine");
    expect(r.reason).toBe("UNKNOWN_SENDER");
  });

  it("flags a role conflict: carrier-only sender sending an RFQ", () => {
    const r = decideRfqDisposition({ confidence: 0.95, senderRoles: ["carrier"], hasLines: true });
    expect(r.disposition).toBe("quarantine");
    expect(r.reason).toBe("ROLE_KIND_CONFLICT");
  });

  it("queues a mid-confidence RFQ for review", () => {
    const r = decideRfqDisposition({ confidence: 0.7, senderRoles: ["client"], hasLines: true });
    expect(r.disposition).toBe("quarantine");
    expect(r.reason).toBe("LOW_CONFIDENCE");
  });
});
