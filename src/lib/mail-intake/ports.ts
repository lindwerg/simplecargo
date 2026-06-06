// PURE port + dep contracts for the intake orchestrator (MAIL_AI_INTEGRATION §4).
// The orchestrator is dependency-injected so its branching/disposition logic is
// unit-testable with fakes — no IMAP, no network, no DB in tests. The worker
// wires real implementations (classify*/extract*/resolveSenderCompany/repos).

import type { ExtractInput, ExtractionResult, RequestCreateInput } from "@/lib/requests/schema";
import type { SenderCompany } from "@/lib/partners/repository";
import type { ClassifyResult } from "./classify-schema";
import type { InvoiceResult } from "./invoice-schema";
import type { CarrierQuoteResult } from "./carrier-quote-schema";
import type { ConvertOutcome } from "./to-extract-input";
import type { QuarantineRowInsert } from "./quarantine-map";
import type { MailAttachmentInput } from "./types";

export interface InvoiceSaveInput {
  direction: "incoming" | "outgoing";
  counterpartyInn: string | null;
  counterpartyNameRaw: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // ISO
  dueDate: string | null;
  amountTotal: number | null;
  vatAmount: number | null;
  currency: string;
  purposeRaw: string | null;
  status: "pending" | "matched" | "paid" | "review";
  sourceFileId: string | null;
  extractedText: string | null;
}

export interface IntakePorts {
  systemUserId: string;
  sourceFileId: string | null; // ingestedFiles row for this email (worker creates)
  createRequest(
    input: RequestCreateInput,
    userId: string,
  ): Promise<{ id: string; requestNumber: string }>;
  saveInvoice(input: InvoiceSaveInput): Promise<{ id: string }>;
  quarantine(row: QuarantineRowInsert): Promise<{ id: string | number }>;
}

export interface IntakeDeps {
  classify(email: import("./types").ParsedEmail): Promise<ClassifyResult>;
  extractRequest(input: ExtractInput): Promise<ExtractionResult>;
  extractInvoice(input: ExtractInput): Promise<InvoiceResult>;
  extractCarrierQuote(input: ExtractInput): Promise<CarrierQuoteResult>;
  resolveSender(email: string): Promise<SenderCompany | null>;
  convertAttachment(att: MailAttachmentInput, clientHint?: string): Promise<ConvertOutcome>;
  ports: IntakePorts;
}

export interface IntakeOutcome {
  classification: ClassifyResult;
  createdRequestId: string | null;
  createdRequestNumber: string | null;
  invoiceIds: string[];
  quarantinedCount: number;
  ignored: boolean;
}
