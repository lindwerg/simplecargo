import { describe, expect, it, vi } from "vitest";

import type { ExtractionResult } from "@/lib/requests/schema";
import { processEmail } from "./orchestrator";
import type { IntakeDeps, IntakePorts } from "./ports";
import type { ParsedEmail } from "./types";
import { classifyResultSchema } from "./classify-schema";
import { invoiceResultSchema } from "./invoice-schema";
import { carrierQuoteResultSchema } from "./carrier-quote-schema";

function email(partial: Partial<ParsedEmail>): ParsedEmail {
  return {
    from: "ivan@client.ru",
    fromName: "Иван",
    subject: "Заявка на вагоны",
    text: "Нужны вагоны Качканар — Дёма, 10 шт",
    messageId: "<m1@mail.ru>",
    date: new Date("2026-06-01T08:00:00Z"),
    attachments: [],
    ...partial,
  };
}

function emptyExtraction(lines: ExtractionResult["lines"] = []): ExtractionResult {
  return { clientGuess: null, wagonType: "ПВ", periodFrom: null, periodTo: null, lines, warnings: [] };
}

function ports(): IntakePorts & {
  created: unknown[];
  invoices: unknown[];
  quarantined: unknown[];
} {
  const created: unknown[] = [];
  const invoices: unknown[] = [];
  const quarantined: unknown[] = [];
  return {
    systemUserId: "system-user",
    sourceFileId: "file-1",
    created,
    invoices,
    quarantined,
    async createRequest(input) {
      created.push(input);
      return { id: "req-1", requestNumber: "R-2026-0001" };
    },
    async saveInvoice(input) {
      invoices.push(input);
      return { id: `inv-${invoices.length}` };
    },
    async quarantine(row) {
      quarantined.push(row);
      return { id: quarantined.length };
    },
  };
}

function deps(over: Partial<IntakeDeps>, p: IntakePorts): IntakeDeps {
  return {
    classify: async () => classifyResultSchema.parse({ bodyKind: "other", bodyConfidence: 0 }),
    extractRequest: async () => emptyExtraction(),
    extractInvoice: async () => invoiceResultSchema.parse({ confidence: 0 }),
    extractCarrierQuote: async () => carrierQuoteResultSchema.parse({ confidence: 0 }),
    resolveSender: async () => null,
    convertAttachment: async () => ({ ok: false, reason: "unsupported", detail: "n/a" }),
    ports: p,
    ...over,
  };
}

describe("processEmail orchestrator", () => {
  it("auto-files a high-confidence RFQ from a known client", async () => {
    const p = ports();
    const d = deps(
      {
        classify: async () =>
          classifyResultSchema.parse({ bodyKind: "client_rfq", bodyConfidence: 0.95 }),
        extractRequest: async () =>
          emptyExtraction([
            {
              originRaw: "Качканар",
              destRaw: "Дёма",
              wagonsRequested: 10,
              originRoadRaw: null,
              destRoadRaw: null,
              cargoName: null,
              etsngCode: null,
              tonnagePerWagon: null,
              targetRatePerWagon: null,
              targetRateRaw: null,
              wagonType: null,
              targetRateKind: null,
              targetRateMarkupPct: null,
              targetTariffClass: null,
              targetTariffRef: null,
            },
          ]),
        resolveSender: async () => ({ companyId: "cp-1", roles: ["client"] }),
      },
      p,
    );
    const out = await processEmail(email({}), d);
    expect(out.createdRequestId).toBe("req-1");
    expect(p.created).toHaveLength(1);
    expect(p.quarantined).toHaveLength(0);
  });

  it("quarantines an RFQ from an unknown sender (cannot auto-link, D16)", async () => {
    const p = ports();
    const d = deps(
      {
        classify: async () =>
          classifyResultSchema.parse({ bodyKind: "client_rfq", bodyConfidence: 0.95 }),
        extractRequest: async () =>
          emptyExtraction([
            {
              originRaw: "A",
              destRaw: "B",
              wagonsRequested: 3,
              originRoadRaw: null,
              destRoadRaw: null,
              cargoName: null,
              etsngCode: null,
              tonnagePerWagon: null,
              targetRatePerWagon: null,
              targetRateRaw: null,
              wagonType: null,
              targetRateKind: null,
              targetRateMarkupPct: null,
              targetTariffClass: null,
              targetTariffRef: null,
            },
          ]),
        resolveSender: async () => null,
      },
      p,
    );
    const out = await processEmail(email({}), d);
    expect(out.createdRequestId).toBeNull();
    expect(p.quarantined).toHaveLength(1);
    expect((p.quarantined[0] as { reasonCode: string }).reasonCode).toBe("UNKNOWN_SENDER");
  });

  it("saves an invoice attachment as a pending invoice", async () => {
    const p = ports();
    const d = deps(
      {
        classify: async () =>
          classifyResultSchema.parse({
            bodyKind: "other",
            bodyConfidence: 0.9,
            attachments: [{ index: 0, kind: "invoice", confidence: 0.9, reason: "счёт" }],
          }),
        convertAttachment: async () => ({
          ok: true,
          input: { modality: "text", text: "Счёт № 245 на 120000" },
        }),
        extractInvoice: async () =>
          invoiceResultSchema.parse({
            invoiceNumber: "245",
            supplierInn: "7701234567",
            amountTotal: 120000,
            confidence: 0.9,
          }),
      },
      p,
    );
    const out = await processEmail(
      email({
        text: "во вложении счёт",
        attachments: [
          { filename: "schet.pdf", contentType: "application/pdf", size: 100, content: Buffer.from("x") },
        ],
      }),
      d,
    );
    expect(out.invoiceIds).toHaveLength(1);
    expect((p.invoices[0] as { invoiceNumber: string }).invoiceNumber).toBe("245");
  });

  it("ignores a plain 'thank you' email (no LLM extraction calls)", async () => {
    const p = ports();
    const extractRequest = vi.fn();
    const d = deps(
      {
        classify: async () => classifyResultSchema.parse({ bodyKind: "other", bodyConfidence: 0.1 }),
        extractRequest,
      },
      p,
    );
    const out = await processEmail(email({ text: "Спасибо!" }), d);
    expect(out.ignored).toBe(true);
    expect(extractRequest).not.toHaveBeenCalled();
    expect(p.created).toHaveLength(0);
    expect(p.quarantined).toHaveLength(0);
  });
});
