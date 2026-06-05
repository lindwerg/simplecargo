// Request lifecycle state machine (REQUESTS_SOURCING §1.1–1.3). PURE — no DB
// import, fully unit-testable. Status set:
//   new | sourcing | quoted | won | lost | no_bid | expired | cancelled
// Board buckets: АКТУАЛЬНЫЕ = {new, sourcing, quoted}; АРХИВ = terminal statuses.

export type RequestStatus =
  | "new"
  | "sourcing"
  | "quoted"
  | "won"
  | "lost"
  | "no_bid"
  | "expired"
  | "cancelled";

export const REQUEST_STATUSES: readonly RequestStatus[] = [
  "new",
  "sourcing",
  "quoted",
  "won",
  "lost",
  "no_bid",
  "expired",
  "cancelled",
];

export const ACTIVE_STATUSES: ReadonlySet<RequestStatus> = new Set([
  "new",
  "sourcing",
  "quoted",
]);

export const TERMINAL_STATUSES: ReadonlySet<RequestStatus> = new Set([
  "won",
  "lost",
  "no_bid",
  "expired",
  "cancelled",
]);

// One-way transitions only; terminals have no forward edges. Mirrors the
// directions lifecycle TRANSITIONS table idiom.
export const TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  new: ["sourcing", "cancelled"],
  sourcing: ["quoted", "no_bid", "expired", "cancelled"],
  quoted: ["won", "lost", "expired"],
  won: [],
  lost: [],
  no_bid: [],
  expired: [],
  cancelled: [],
};

// Loss reason is required when closing as lost or no_bid (REQUESTS_SOURCING §1.3).
const LOSS_REASON_REQUIRED: ReadonlySet<RequestStatus> = new Set(["lost", "no_bid"]);

export function isTerminal(status: RequestStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isActive(status: RequestStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

/** Board bucket predicate — АРХИВ when terminal, АКТУАЛЬНЫЕ otherwise. */
export function isArchived(status: RequestStatus): boolean {
  return isTerminal(status);
}

export function canTransition(from: RequestStatus, to: RequestStatus): boolean {
  return (TRANSITIONS[from] as readonly string[]).includes(to);
}

export interface TransitionGuardResult {
  ok: boolean;
  reason?: string;
}

/** Validate transition metadata: lost/no_bid require a structured loss reason. */
export function validateTransitionMeta(
  to: RequestStatus,
  lossReason: string | undefined,
): TransitionGuardResult {
  if (LOSS_REASON_REQUIRED.has(to) && !lossReason) {
    return { ok: false, reason: "Укажите причину закрытия" };
  }
  return { ok: true };
}
