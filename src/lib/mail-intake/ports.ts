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
  status: "pending" | "partial" | "matched" | "paid" | "review";
  sourceFileId: string | null;
  extractedText: string | null;
  // реквизиты получателя + договор + НДС для формирования платежа (опционально)
  vatRate?: number | null;
  vatIncluded?: boolean | null;
  serviceDescription?: string | null;
  supplierKpp?: string | null;
  supplierAccount?: string | null;
  supplierBankBic?: string | null;
  supplierCorrAccount?: string | null;
  supplierBankName?: string | null;
  contractNumber?: string | null;
  contractDate?: string | null; // ISO
  source?: "mail" | "upload";
}

// A carrier's quote reply, ready to be matched back to the polled
// request_owner_quotes rows it answers (Message-ID thread → our R-номер fallback).
export interface CarrierQuoteMatchInput {
  senderCompanyId: string | null; // resolved carrier (owner) from the From address
  ourRequestRef: string | null; // R-YYYY-NNNN extracted from the reply body
  threadRefs: string[]; // In-Reply-To + References Message-IDs of the reply
  replyMessageId: string; // the reply's own Message-ID
  costPerWagon: number | null;
  wagonsOffered: number | null;
  currency: string;
  validTo: string | null; // ISO
}

export interface CarrierQuoteMatchResult {
  matched: boolean;
  updatedCount: number;
  requestId: string | null;
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
  // Close the sourcing loop: attach an inbound carrier quote to the polled
  // request_owner_quotes rows it answers. matched=false → caller quarantines.
  matchCarrierQuote(input: CarrierQuoteMatchInput): Promise<CarrierQuoteMatchResult>;
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
  carrierQuotesMatched: number;
  quarantinedCount: number;
  ignored: boolean;
}
