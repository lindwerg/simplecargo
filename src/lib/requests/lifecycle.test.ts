import { describe, expect, it } from "vitest";

import {
  canTransition,
  canTransitionLine,
  isActive,
  isArchived,
  isTerminal,
  rollupRequestStatus,
  validateTransitionMeta,
} from "./lifecycle";

describe("request lifecycle", () => {
  it("allows new → sourcing and new → cancelled", () => {
    expect(canTransition("new", "sourcing")).toBe(true);
    expect(canTransition("new", "cancelled")).toBe(true);
  });

  it("forbids skipping straight to won", () => {
    expect(canTransition("new", "won")).toBe(false);
    expect(canTransition("sourcing", "won")).toBe(false);
  });

  it("allows quoted → won / lost / expired", () => {
    expect(canTransition("quoted", "won")).toBe(true);
    expect(canTransition("quoted", "lost")).toBe(true);
    expect(canTransition("quoted", "expired")).toBe(true);
  });

  it("treats terminals as dead-ends", () => {
    expect(canTransition("won", "cancelled")).toBe(false);
    expect(canTransition("lost", "sourcing")).toBe(false);
  });

  it("classifies terminal vs active vs archived", () => {
    expect(isTerminal("won")).toBe(true);
    expect(isTerminal("new")).toBe(false);
    expect(isActive("sourcing")).toBe(true);
    expect(isActive("expired")).toBe(false);
    expect(isArchived("lost")).toBe(true);
    expect(isArchived("quoted")).toBe(false);
  });

  it("requires a loss reason for lost / no_bid only", () => {
    expect(validateTransitionMeta("lost", undefined).ok).toBe(false);
    expect(validateTransitionMeta("no_bid", undefined).ok).toBe(false);
    expect(validateTransitionMeta("lost", "price").ok).toBe(true);
    expect(validateTransitionMeta("cancelled", undefined).ok).toBe(true);
    expect(validateTransitionMeta("won", undefined).ok).toBe(true);
  });
});

describe("direction (line) lifecycle", () => {
  it("lets a line be withdrawn (no_bid) directly from new — more permissive than the request", () => {
    expect(canTransitionLine("new", "no_bid")).toBe(true);
    expect(canTransitionLine("new", "cancelled")).toBe(true);
    // the request machine forbids new → no_bid; the line machine allows it
    expect(canTransition("new", "no_bid")).toBe(false);
  });

  it("allows the forward sales path and withdrawal from quoted", () => {
    expect(canTransitionLine("new", "quoted")).toBe(true);
    expect(canTransitionLine("quoted", "won")).toBe(true);
    expect(canTransitionLine("quoted", "no_bid")).toBe(true);
  });

  it("treats line terminals as dead-ends", () => {
    expect(canTransitionLine("no_bid", "sourcing")).toBe(false);
    expect(canTransitionLine("won", "lost")).toBe(false);
  });
});

describe("rollupRequestStatus", () => {
  it("reports the most-advanced ACTIVE line while any is active", () => {
    expect(rollupRequestStatus(["new", "sourcing", "quoted"])).toBe("quoted");
    expect(rollupRequestStatus(["new", "sourcing"])).toBe("sourcing");
    expect(rollupRequestStatus(["new", "new"])).toBe("new");
  });

  it("keeps a request active even if some legs are already terminal", () => {
    // 1 quoted + 2 withdrawn legs → still active (quoted), NOT archived
    expect(rollupRequestStatus(["quoted", "no_bid", "cancelled"])).toBe("quoted");
    expect(rollupRequestStatus(["sourcing", "lost"])).toBe("sourcing");
  });

  it("archives only when every leg is terminal, by terminal priority", () => {
    expect(rollupRequestStatus(["won", "lost", "cancelled"])).toBe("won");
    expect(rollupRequestStatus(["lost", "no_bid"])).toBe("lost");
    expect(rollupRequestStatus(["cancelled", "expired"])).toBe("expired");
    expect(rollupRequestStatus(["cancelled", "cancelled"])).toBe("cancelled");
  });

  it("falls back to new for an empty line set", () => {
    expect(rollupRequestStatus([])).toBe("new");
  });
});
