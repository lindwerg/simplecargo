import { describe, expect, it } from "vitest";

import { optimisticReducer, type OptimisticState } from "./useOptimisticStatus";

type Status = "sourcing" | "won";

const initial: OptimisticState<Status> = { value: "sourcing", isPending: false, error: null };

describe("optimisticReducer", () => {
  it("apply flips the value optimistically, marks pending, clears any error", () => {
    // Arrange
    const dirty: OptimisticState<Status> = { value: "sourcing", isPending: false, error: "boom" };

    // Act
    const next = optimisticReducer(dirty, { type: "apply", next: "won" });

    // Assert
    expect(next).toEqual({ value: "won", isPending: true, error: null });
  });

  it("settle keeps the optimistic value and clears pending", () => {
    const applied = optimisticReducer(initial, { type: "apply", next: "won" });

    const settled = optimisticReducer(applied, { type: "settle" });

    expect(settled).toEqual({ value: "won", isPending: false, error: null });
  });

  it("rollback reverts the value AND sets the error in a single transition", () => {
    const applied = optimisticReducer(initial, { type: "apply", next: "won" });

    const rolled = optimisticReducer(applied, {
      type: "rollback",
      previous: "sourcing",
      error: "Не удалось сохранить — изменение отменено",
    });

    // One render cycle: row reverts to "sourcing" and the error is visible together.
    expect(rolled.value).toBe("sourcing");
    expect(rolled.isPending).toBe(false);
    expect(rolled.error).toBe("Не удалось сохранить — изменение отменено");
  });

  it("dismiss clears the error without touching value or pending", () => {
    const errored: OptimisticState<Status> = { value: "won", isPending: false, error: "boom" };

    const dismissed = optimisticReducer(errored, { type: "dismiss" });

    expect(dismissed).toEqual({ value: "won", isPending: false, error: null });
  });

  it("does not mutate the input state (immutability)", () => {
    const frozen = Object.freeze({ ...initial });

    expect(() => optimisticReducer(frozen, { type: "apply", next: "won" })).not.toThrow();
    expect(frozen.value).toBe("sourcing");
  });
});
