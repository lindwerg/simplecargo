// PURE disposition logic (MAIL_AI_INTEGRATION §4.3). Decides whether a recognized
// client RFQ is auto-filed or routed to the operator's confirmation queue. No I/O.

import type { PartnerRole } from "@/lib/partners/schema";

// Operator decision #1: auto-file at high confidence, else queue.
export const AUTO_INTAKE_MIN_CONFIDENCE = 0.85;

export type RfqDisposition = "auto" | "quarantine" | "ignore";

export type QuarantineReason =
  | "LOW_CONFIDENCE"
  | "UNKNOWN_SENDER"
  | "ROLE_KIND_CONFLICT"
  | "NO_LINES_EXTRACTED";

export interface RfqDispositionInput {
  confidence: number;
  senderRoles: PartnerRole[] | null; // null = sender not resolved to a company
  hasLines: boolean; // at least one valid request line extracted
}

export interface RfqDispositionResult {
  disposition: RfqDisposition;
  reason: QuarantineReason | null;
}

// For a client_rfq: roles should contain "client" (carrier-only sender sending an
// RFQ is a red flag → review). Sender unknown → review (can't auto-link, D16).
export function decideRfqDisposition(input: RfqDispositionInput): RfqDispositionResult {
  if (!input.hasLines) {
    return { disposition: "quarantine", reason: "NO_LINES_EXTRACTED" };
  }
  if (input.confidence < 0.6) {
    return { disposition: "ignore", reason: null };
  }
  if (input.senderRoles === null) {
    return { disposition: "quarantine", reason: "UNKNOWN_SENDER" };
  }
  const isClient = input.senderRoles.includes("client");
  const isCarrierOnly =
    input.senderRoles.includes("carrier") && !isClient;
  if (isCarrierOnly) {
    return { disposition: "quarantine", reason: "ROLE_KIND_CONFLICT" };
  }
  if (input.confidence >= AUTO_INTAKE_MIN_CONFIDENCE && isClient) {
    return { disposition: "auto", reason: null };
  }
  // 0.6..0.85, or resolved company without an explicit client role
  return { disposition: "quarantine", reason: "LOW_CONFIDENCE" };
}
