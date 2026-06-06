import { describe, expect, it } from "vitest";

import type { ExtractedLine, ExtractionResult } from "@/lib/requests/schema";
import { resultToRequestInput } from "./result-to-request";

function line(partial: Partial<ExtractedLine>): ExtractedLine {
  return {
    originRaw: null,
    originRoadRaw: null,
    destRaw: null,
    destRoadRaw: null,
    cargoName: null,
    etsngCode: null,
    wagonsRequested: null,
    tonnagePerWagon: null,
    targetRatePerWagon: null,
    targetRateRaw: null,
    wagonType: null,
    targetRateKind: null,
    targetRateMarkupPct: null,
    targetTariffClass: null,
    targetTariffRef: null,
    ...partial,
  };
}

function result(lines: ExtractedLine[], head: Partial<ExtractionResult> = {}): ExtractionResult {
  return {
    clientGuess: null,
    wagonType: null,
    periodFrom: null,
    periodTo: null,
    warnings: [],
    lines,
    ...head,
  };
}

const email = { messageId: "<msg-1@mail.ru>", fromName: "Иван", date: new Date("2026-06-01T08:00:00Z") };

describe("resultToRequestInput", () => {
  it("maps a valid line to an email-channel ai_email request needing review", () => {
    const ext = result([line({ originRaw: "Качканар", destRaw: "Дёма", wagonsRequested: 10 })], {
      wagonType: "ПВ",
    });
    const { input, droppedLines } = resultToRequestInput({
      extraction: ext,
      email,
      sender: { companyId: "cp-1", roles: ["client"] },
      needsReview: true,
    });
    expect(droppedLines).toBe(0);
    expect(input).not.toBeNull();
    expect(input!.channel).toBe("email");
    expect(input!.intakeSource).toBe("ai_email");
    expect(input!.needsReview).toBe(true);
    expect(input!.clientSuggestedId).toBe("cp-1");
    expect(input!.sourceRef).toBe("<msg-1@mail.ru>");
    expect(input!.lines).toHaveLength(1);
    expect(input!.lines[0].wagonsRequested).toBe(10);
  });

  it("drops lines missing origin/dest/wagons and returns null when none remain", () => {
    const ext = result([
      line({ originRaw: "Качканар", destRaw: null, wagonsRequested: 5 }), // no dest
      line({ originRaw: "X", destRaw: "Y", wagonsRequested: 0 }), // zero wagons
    ]);
    const { input, droppedLines } = resultToRequestInput({
      extraction: ext,
      email,
      sender: null,
      needsReview: true,
    });
    expect(droppedLines).toBe(2);
    expect(input).toBeNull();
  });

  it("falls back to clientGuess / fromName for clientRaw when sender unresolved", () => {
    const ext = result([line({ originRaw: "A", destRaw: "B", wagonsRequested: 1 })], {
      clientGuess: "ООО Ромашка",
    });
    const { input } = resultToRequestInput({ extraction: ext, email, sender: null, needsReview: true });
    expect(input!.clientSuggestedId).toBeUndefined();
    expect(input!.clientRaw).toBe("ООО Ромашка");
  });
});
