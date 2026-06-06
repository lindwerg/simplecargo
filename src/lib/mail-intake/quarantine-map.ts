// PURE builder for quarantine_rows inserts from a mail-intake case
// (MAIL_AI_INTEGRATION §4.3). quarantineRows has NOT NULL + CHECK columns
// (tier ∈ fatal|recoverable|row_warning; severity ∈ CRITICAL|ERROR|WARNING|INFO).
// All mail cases are 'recoverable'; ruleId/reasonCode are free text. No I/O.

import type { QuarantineReason } from "./thresholds";

// Insert payload shape — matches quarantineRows columns we set. Kept structural
// (not the Drizzle InferInsert) so this module stays pure and DB-free.
export interface QuarantineRowInsert {
  sourceFileId: string | null;
  tier: "recoverable";
  severity: "ERROR" | "WARNING" | "INFO";
  ruleId: string; // E-01..E-07 (mail-intake namespace)
  reasonCode:
    | QuarantineReason
    | "CARRIER_QUOTE_MANUAL"
    | "UNSUPPORTED_ATTACHMENT"
    | "PROCESSING_ERROR";
  agentReason: string | null; // ИИ-объяснение оператору
  rawRowJson: unknown; // сериализованный черновик для дозаноса без LLM
}

type AnyReason = QuarantineRowInsert["reasonCode"];

const RULE_BY_REASON: Record<AnyReason, { ruleId: string; severity: "ERROR" | "WARNING" | "INFO" }> = {
  LOW_CONFIDENCE: { ruleId: "E-01", severity: "WARNING" },
  UNKNOWN_SENDER: { ruleId: "E-02", severity: "INFO" },
  ROLE_KIND_CONFLICT: { ruleId: "E-03", severity: "WARNING" },
  NO_LINES_EXTRACTED: { ruleId: "E-04", severity: "WARNING" },
  CARRIER_QUOTE_MANUAL: { ruleId: "E-05", severity: "INFO" },
  UNSUPPORTED_ATTACHMENT: { ruleId: "E-06", severity: "INFO" },
  // письмо упало при обработке (транзиентный сбой LLM/БД) — НЕ теряем, кладём сюда
  PROCESSING_ERROR: { ruleId: "E-07", severity: "ERROR" },
};

export function buildQuarantineRow(params: {
  reason: AnyReason;
  sourceFileId?: string | null;
  agentReason?: string | null;
  draft?: unknown;
}): QuarantineRowInsert {
  const meta = RULE_BY_REASON[params.reason];
  return {
    sourceFileId: params.sourceFileId ?? null,
    tier: "recoverable",
    severity: meta.severity,
    ruleId: meta.ruleId,
    reasonCode: params.reason,
    agentReason: params.agentReason ?? null,
    rawRowJson: params.draft ?? null,
  };
}
