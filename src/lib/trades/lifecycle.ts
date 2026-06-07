// Deal (orders) lifecycle state machine (PRODUCT_DIRECTIONS §1.2). Mirrors the
// orders.status CHECK: draft|confirmed|active|completed|cancelled. Pure logic, no
// DB import, so it stays unit-testable. Modelled on directions/lifecycle.ts.
//
// A deal starts as a draft (proactive) or confirmed (converted from a won RFQ).
// `cancelled` is a terminal reachable from any non-terminal state.

export type DealStatus = "draft" | "confirmed" | "active" | "completed" | "cancelled";

export const TRANSITIONS: Record<DealStatus, readonly DealStatus[]> = {
  draft: ["confirmed", "cancelled"],
  confirmed: ["active", "draft", "cancelled"],
  active: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isTerminal(status: DealStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function canTransition(from: DealStatus, to: DealStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
