import { describe, expect, it } from "vitest";

import {
  canTransition,
  isActive,
  isArchived,
  isTerminal,
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
