// PURE: map an ExtractionResult (from the existing extractor) + resolved sender
// + email metadata → a RequestCreateInput for createRequestWithLines
// (MAIL_AI_INTEGRATION §5.2). No DB. Drops lines missing required fields
// (origin/dest/wagons); returns null when nothing valid remains → quarantine.

import type { RequestCreateInput, RequestLineInput, ExtractionResult } from "@/lib/requests/schema";
import type { SenderCompany } from "@/lib/partners/repository";

function undef<T>(v: T | null | undefined): T | undefined {
  return v === null || v === undefined ? undefined : v;
}

export interface EmailMeta {
  messageId: string;
  fromName?: string | null;
  date?: Date | null;
}

export interface ResultToRequestOutcome {
  input: RequestCreateInput | null; // null → no valid lines
  droppedLines: number;
}

export function resultToRequestInput(params: {
  extraction: ExtractionResult;
  email: EmailMeta;
  sender: SenderCompany | null;
  needsReview: boolean;
}): ResultToRequestOutcome {
  const { extraction, email, sender, needsReview } = params;

  const lines: RequestLineInput[] = [];
  let dropped = 0;

  for (const [i, l] of extraction.lines.entries()) {
    const wagons = l.wagonsRequested;
    if (!l.originRaw || !l.destRaw || wagons == null || wagons <= 0) {
      dropped += 1;
      continue;
    }
    lines.push({
      originRaw: l.originRaw,
      originRoadRaw: undef(l.originRoadRaw),
      destRaw: l.destRaw,
      destRoadRaw: undef(l.destRoadRaw),
      cargoName: undef(l.cargoName),
      etsngCode: undef(l.etsngCode),
      wagonsRequested: Math.round(wagons),
      tonnagePerWagon: undef(l.tonnagePerWagon),
      targetRatePerWagon: undef(l.targetRatePerWagon),
      targetRateRaw: undef(l.targetRateRaw),
      wagonType: undef(l.wagonType),
      targetRateKind: undef(l.targetRateKind) as RequestLineInput["targetRateKind"],
      targetRateMarkupPct: undef(l.targetRateMarkupPct),
      targetTariffClass: undef(l.targetTariffClass),
      targetTariffRef: undef(l.targetTariffRef),
      sortOrder: i,
    });
  }

  if (lines.length === 0) {
    return { input: null, droppedLines: dropped };
  }

  const input: RequestCreateInput = {
    clientSuggestedId: sender?.companyId,
    clientRaw: undef(extraction.clientGuess) ?? undef(email.fromName),
    channel: "email",
    intakeSource: "ai_email",
    needsReview,
    wagonType: undef(extraction.wagonType),
    cargoName: undefined,
    periodFrom: undef(extraction.periodFrom),
    periodTo: undef(extraction.periodTo),
    receivedAt: email.date ? email.date.toISOString() : undefined,
    validUntil: undefined,
    sourceRef: email.messageId,
    notes: undefined,
    lines,
  };

  return { input, droppedLines: dropped };
}
