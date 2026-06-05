// Direction lifecycle state machine (PRODUCT_DIRECTIONS §1.3). Pure logic, no DB
// import, so it stays unit-testable without env/Postgres.
//
// The spec diagram uses DRAFT→OPEN→ACTIVE→CLOSED/SUSPENDED; we map onto the locked
// status CHECK (P15-1: draft|open|active|paused|completed|cancelled) — CLOSED→completed,
// SUSPENDED→paused — without changing the constraint. `cancelled` is a terminal reachable
// from any non-terminal state. Only `open → active` runs the activation guard.

export type DirectionStatus =
  | "draft"
  | "open"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export const TRANSITIONS: Record<DirectionStatus, readonly DirectionStatus[]> = {
  draft: ["open", "cancelled"],
  open: ["active", "draft", "cancelled"],
  active: ["paused", "completed", "cancelled"],
  paused: ["active", "completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export function isTerminal(status: DirectionStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function canTransition(from: DirectionStatus, to: DirectionStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
