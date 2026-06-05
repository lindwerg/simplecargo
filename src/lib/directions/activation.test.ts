import { describe, expect, it } from "vitest";

import { evaluateActivation, type ActivationFacts } from "./activation";

// A fully-satisfied set of facts; each test perturbs one field.
const READY: ActivationFacts = {
  clientCounterpartyId: "11111111-1111-4111-8111-111111111111",
  rateClient: 2800,
  rateOwner: 1900,
  activeOwnerBindings: 1,
  activeClientBindings: 1,
  ownerMailboxConflict: false,
};

function failedKeys(facts: ActivationFacts): string[] {
  return evaluateActivation(facts)
    .guards.filter((g) => g.status === "failed")
    .map((g) => g.key);
}

describe("evaluateActivation", () => {
  it("passes when all five prerequisites hold", () => {
    const result = evaluateActivation(READY);
    expect(result.ok).toBe(true);
    expect(result.hardWarning).toBeUndefined();
  });

  it("fails client_set when no client confirmed (D16)", () => {
    const result = evaluateActivation({ ...READY, clientCounterpartyId: null });
    expect(result.ok).toBe(false);
    expect(failedKeys({ ...READY, clientCounterpartyId: null })).toContain("client_set");
  });

  it("fails rates_confirmed when either rate is null", () => {
    expect(failedKeys({ ...READY, rateClient: null })).toContain("rates_confirmed");
    expect(failedKeys({ ...READY, rateOwner: null })).toContain("rates_confirmed");
  });

  it("hard-blocks when client rate ≤ owner rate (H1) — less-than and equal", () => {
    const less = evaluateActivation({ ...READY, rateClient: 1000, rateOwner: 1900 });
    expect(less.ok).toBe(false);
    expect(less.hardWarning).toBeTruthy();
    expect(failedKeys({ ...READY, rateClient: 1000, rateOwner: 1900 })).toContain("margin_positive");

    const equal = evaluateActivation({ ...READY, rateClient: 1900, rateOwner: 1900 });
    expect(equal.ok).toBe(false);
    expect(equal.hardWarning).toBeTruthy();
  });

  it("fails owner_binding when there is no active owner mailbox binding", () => {
    expect(failedKeys({ ...READY, activeOwnerBindings: 0 })).toContain("owner_binding");
  });

  it("fails client_forward when there is no active client forward binding", () => {
    expect(failedKeys({ ...READY, activeClientBindings: 0 })).toContain("client_forward");
  });

  it("fails mailbox_unique when the mailbox is live on another direction (M1)", () => {
    expect(failedKeys({ ...READY, ownerMailboxConflict: true })).toContain("mailbox_unique");
  });

  it("ok reflects only failed guards (a passed run lists no failures)", () => {
    expect(failedKeys(READY)).toHaveLength(0);
  });
});
