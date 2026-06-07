import { describe, expect, it } from "vitest";

import { canTransition, isTerminal, TRANSITIONS, type DealStatus } from "./lifecycle";

const ALL: DealStatus[] = ["draft", "confirmed", "active", "completed", "cancelled"];

describe("canTransition", () => {
  it("allows the forward path draft → confirmed → active → completed", () => {
    expect(canTransition("draft", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "active")).toBe(true);
    expect(canTransition("active", "completed")).toBe(true);
  });

  it("allows reverting a confirmed deal back to draft", () => {
    expect(canTransition("confirmed", "draft")).toBe(true);
  });

  it("rejects skipping straight from draft to active", () => {
    expect(canTransition("draft", "active")).toBe(false);
  });

  it("rejects reopening a completed deal", () => {
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

  it("treats draft/confirmed/active as non-terminal", () => {
    expect(isTerminal("draft")).toBe(false);
    expect(isTerminal("confirmed")).toBe(false);
    expect(isTerminal("active")).toBe(false);
  });

  it("has no exits out of terminal states", () => {
    expect(TRANSITIONS.completed).toHaveLength(0);
    expect(TRANSITIONS.cancelled).toHaveLength(0);
  });
});
