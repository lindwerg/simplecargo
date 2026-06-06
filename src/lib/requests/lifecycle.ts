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

// ── DIRECTION (request_line) lifecycle ───────────────────────────────────────
// Lifecycle now lives on the DIRECTION so a single leg can be quoted or withdrawn
// independently. The line state set is identical to the request's, but the line
// machine is intentionally MORE PERMISSIVE about withdrawal: the operator may pull
// ("не беремся" → no_bid, with a reason) or cancel a leg from any active state,
// without first walking it through sourcing. Forward sales path mirrors the request.
export const LINE_TRANSITIONS: Readonly<Record<RequestStatus, readonly RequestStatus[]>> = {
  new: ["sourcing", "quoted", "no_bid", "cancelled", "expired"],
  sourcing: ["quoted", "won", "lost", "no_bid", "cancelled", "expired"],
  quoted: ["won", "lost", "no_bid", "cancelled", "expired"],
  won: [],
  lost: [],
  no_bid: [],
  expired: [],
  cancelled: [],
};

export function canTransitionLine(from: RequestStatus, to: RequestStatus): boolean {
  return (LINE_TRANSITIONS[from] as readonly string[]).includes(to);
}

// Active progress ordering (most → least advanced) and terminal priority — used to
// roll N line statuses up into ONE header status for the board bucket + card.
const ACTIVE_PROGRESS: readonly RequestStatus[] = ["quoted", "sourcing", "new"];
const TERMINAL_PRIORITY: readonly RequestStatus[] = [
  "won",
  "lost",
  "no_bid",
  "expired",
  "cancelled",
];

/**
 * Derive the request header status from its directions' statuses.
 *   - Active while ANY line is active → reports the MOST-advanced active line
 *     (quoted > sourcing > new), so the board shows the furthest-along bucket.
 *   - All lines terminal → reports the highest-priority terminal
 *     (won > lost > no_bid > expired > cancelled). [default tie-break — DECISION]
 *   - No lines (edge) → "new".
 */
export function rollupRequestStatus(
  lineStatuses: readonly RequestStatus[],
): RequestStatus {
  if (lineStatuses.length === 0) return "new";
  const hasActive = lineStatuses.some((s) => ACTIVE_STATUSES.has(s));
  if (hasActive) {
    for (const s of ACTIVE_PROGRESS) {
      if (lineStatuses.includes(s)) return s;
    }
    return "new";
  }
  for (const s of TERMINAL_PRIORITY) {
    if (lineStatuses.includes(s)) return s;
  }
  return "cancelled";
}
