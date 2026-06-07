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

function ports(
  opts: { quoteMatches?: boolean } = {},
): IntakePorts & {
  created: unknown[];
  invoices: unknown[];
  quarantined: unknown[];
  quoteMatchCalls: unknown[];
} {
  const created: unknown[] = [];
  const invoices: unknown[] = [];
  const quarantined: unknown[] = [];
  const quoteMatchCalls: unknown[] = [];
  return {
    systemUserId: "system-user",
    sourceFileId: "file-1",
    created,
    invoices,
    quarantined,
    quoteMatchCalls,
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
    async matchCarrierQuote(input) {
      quoteMatchCalls.push(input);
      return opts.quoteMatches
        ? { matched: true, updatedCount: 1, requestId: "req-1" }
        : { matched: false, updatedCount: 0, requestId: null };
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

  it("attaches a carrier quote reply back to its RFQ (no quarantine)", async () => {
    const p = ports({ quoteMatches: true });
    const d = deps(
      {
        classify: async () =>
          classifyResultSchema.parse({ bodyKind: "carrier_quote", bodyConfidence: 0.9 }),
        extractCarrierQuote: async () =>
          carrierQuoteResultSchema.parse({
            ourRequestRef: "R-2026-0001",
            costPerWagon: 1900,
            wagonsOffered: 10,
            confidence: 0.9,
          }),
        resolveSender: async () => ({ companyId: "carrier-1", roles: ["carrier"] }),
      },
      p,
    );
    const out = await processEmail(
      email({ text: "Готовы дать 10 вагонов по 1900 ₽", inReplyTo: "<rfq-1@simplecargo>" }),
      d,
    );
    expect(out.carrierQuotesMatched).toBe(1);
    expect(p.quarantined).toHaveLength(0);
    expect(p.quoteMatchCalls).toHaveLength(1);
    expect((p.quoteMatchCalls[0] as { threadRefs: string[] }).threadRefs).toContain(
      "<rfq-1@simplecargo>",
    );
  });

  it("quarantines a carrier quote that can't be matched to any RFQ", async () => {
    const p = ports({ quoteMatches: false });
    const d = deps(
      {
        classify: async () =>
          classifyResultSchema.parse({ bodyKind: "carrier_quote", bodyConfidence: 0.9 }),
        extractCarrierQuote: async () =>
          carrierQuoteResultSchema.parse({ costPerWagon: 1900, confidence: 0.9 }),
        resolveSender: async () => null,
      },
      p,
    );
    const out = await processEmail(email({ text: "ставка 1900" }), d);
    expect(out.carrierQuotesMatched).toBe(0);
    expect(p.quarantined).toHaveLength(1);
    expect((p.quarantined[0] as { reasonCode: string }).reasonCode).toBe("CARRIER_QUOTE_MANUAL");
  });

  it("archives a dislocation report без извлечения (ignored, no request/invoice/quarantine)", async () => {
    const p = ports();
    const extractRequest = vi.fn();
    const extractInvoice = vi.fn();
    const convertAttachment = vi.fn();
    const d = deps(
      {
        classify: async () =>
          classifyResultSchema.parse({
            bodyKind: "dislocation",
            bodyConfidence: 0.92,
            attachments: [{ index: 0, kind: "dislocation", confidence: 0.92, reason: "сводка" }],
          }),
        extractRequest,
        extractInvoice,
        convertAttachment,
      },
      p,
    );
    const out = await processEmail(
      email({
        subject: "Дислок",
        text: "сводка по вагонам во вложении",
        attachments: [
          {
            filename: "dislocation_2026-06-01.xlsx",
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            size: 5000,
            content: Buffer.from("x"),
          },
        ],
      }),
      d,
    );
    expect(out.ignored).toBe(true);
    expect(out.classification.bodyKind).toBe("dislocation");
    expect(extractRequest).not.toHaveBeenCalled();
    expect(extractInvoice).not.toHaveBeenCalled();
    expect(convertAttachment).not.toHaveBeenCalled(); // вложение не конвертируется в извлечение
    expect(p.created).toHaveLength(0);
    expect(p.invoices).toHaveLength(0);
    expect(p.quarantined).toHaveLength(0);
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
