import { describe, expect, it } from "vitest";

import { canTransition, isTerminal, TRANSITIONS, type DirectionStatus } from "./lifecycle";

const ALL: DirectionStatus[] = ["draft", "open", "active", "paused", "completed", "cancelled"];

describe("canTransition", () => {
  it("allows the documented forward path draft → open → active", () => {
    expect(canTransition("draft", "open")).toBe(true);
    expect(canTransition("open", "active")).toBe(true);
  });

  it("allows suspend/close from active and reactivate from paused", () => {
    expect(canTransition("active", "paused")).toBe(true);
    expect(canTransition("active", "completed")).toBe(true);
    expect(canTransition("paused", "active")).toBe(true);
  });

  it("rejects skipping straight from draft to active", () => {
    expect(canTransition("draft", "active")).toBe(false);
  });

  it("rejects reopening a completed direction", () => {
    expect(canTransition("completed", "active")).toBe(false);
  });
});

describe("cancellation", () => {
  it("is reachable from every non-terminal state", () => {
    for (const s of ALL) {
      if (isTerminal(s)) continue;
      expect(canTransition(s, "cancelled")).toBe(true);
    }
  });
});

describe("isTerminal", () => {
  it("treats completed and cancelled as terminal", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
  });

  it("treats draft/open/active/paused as non-terminal", () => {
    expect(isTerminal("draft")).toBe(false);
    expect(isTerminal("open")).toBe(false);
    expect(isTerminal("active")).toBe(false);
    expect(isTerminal("paused")).toBe(false);
  });

  it("has no exits out of terminal states", () => {
    expect(TRANSITIONS.completed).toHaveLength(0);
    expect(TRANSITIONS.cancelled).toHaveLength(0);
  });
});
