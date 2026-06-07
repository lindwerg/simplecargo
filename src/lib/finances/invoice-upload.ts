import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { ingestedFiles } from "@/lib/db/schema/ingest";
import { inboundInvoices } from "@/lib/db/schema/inboundInvoices";
import { DEFAULT_VAT_RATE } from "@/lib/format";
import { saveIngestedAttachment } from "@/lib/mail-intake/attachments-repo";
import { attachmentToExtractInput } from "@/lib/mail-intake/to-extract-input";
import { extractInvoice } from "@/lib/mail-intake/invoice-extract";
import { saveInboundInvoice } from "@/lib/mail/intake-repo";
import { buildPaymentPurpose } from "./payment-purpose";
import { getInvoiceRemaining } from "./payments";

// Загруженный вручную счёт → распознавание ИИ → черновик-префилл платежа. Файл
// храним как ingested_files (идемпотентность по sha256) + ingested_attachments.
// Повторная загрузка того же файла переиспользует уже созданный счёт (для остатка).

export interface PaymentPrefill {
  inboundInvoiceId: string;
  counterpartyName: string | null;
  counterpartyInn: string | null;
  counterpartyKpp: string | null;
  counterpartyAccount: string | null;
  counterpartyBankBic: string | null;
  counterpartyCorrAccount: string | null;
  amount: number; // остаток к оплате (на первой загрузке = сумма счёта)
  amountTotal: number | null;
  remaining: number | null;
  invoiceNumber: string | null;
  invoiceDate: string | null; // ISO
  contractNumber: string | null;
  contractDate: string | null; // ISO
  serviceDescription: string | null;
  vatRate: number | null;
  vatIncluded: boolean | null;
  purpose: string;
  warnings: string[];
  confidence: number;
}

function isoDate(d: Date | string | null): string | null {
  if (!d) return null;
  const date = typeof d === "string" ? d : d.toISOString();
  return date.slice(0, 10);
}

function detectMime(filename: string, given: string): string {
  if (given && given !== "application/octet-stream") return given;
  const n = filename.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".webp")) return "image/webp";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  if (n.endsWith(".xlsx") || n.endsWith(".xls")) return "application/vnd.ms-excel";
  return "application/octet-stream";
}

/** Получить остаток + ISO-сумму к оплате для уже сохранённого счёта. */
async function remainingFor(invoiceId: string, amountTotal: number | null): Promise<number> {
  const r = await getInvoiceRemaining(invoiceId);
  return r ? r.remaining : (amountTotal ?? 0);
}

export class InvoiceUploadError extends Error {
  constructor(
    public readonly status: 415 | 422,
    message: string,
  ) {
    super(message);
    this.name = "InvoiceUploadError";
  }
}

/**
 * Сохранить загруженный счёт, распознать его и вернуть префилл платежа.
 * Повторная загрузка того же файла → переиспользуем существующий счёт (остаток).
 */
export async function processUploadedInvoice(
  filename: string,
  mimeIn: string,
  buffer: Buffer,
): Promise<PaymentPrefill> {
  if (buffer.length === 0) throw new InvoiceUploadError(422, "Пустой файл");
  const mime = detectMime(filename, mimeIn);
  const sha = createHash("sha256").update(buffer).digest("hex");

  // ingested_files идемпотентен по sha256: вставляем или берём существующий.
  await db
    .insert(ingestedFiles)
    .values({ contentSha256: sha, filename, sourceType: "U", status: "committed" })
    .onConflictDoNothing({ target: ingestedFiles.contentSha256 });
  const [file] = await db
    .select({ id: ingestedFiles.id })
    .from(ingestedFiles)
    .where(eq(ingestedFiles.contentSha256, sha));
  const sourceFileId = file.id;

  // Уже загружали этот счёт? Переиспользуем (для остатка), без повторного ИИ.
  const [existing] = await db
    .select()
    .from(inboundInvoices)
    .where(eq(inboundInvoices.sourceFileId, sourceFileId))
    .orderBy(desc(inboundInvoices.createdAt))
    .limit(1);
  if (existing) {
    return toPrefill(existing, await remainingFor(existing.id, Number(existing.amountTotal ?? 0)), []);
  }

  // Новый счёт: сохранить байты → распознать → создать запись.
  await saveIngestedAttachment({ sourceFileId, kind: "attachment", filename, mimeType: mime, content: buffer });

  const outcome = await attachmentToExtractInput({ filename, contentType: mime, size: buffer.length, content: buffer });
  if (!outcome.ok) {
    throw new InvoiceUploadError(415, outcome.detail);
  }
  const inv = await extractInvoice(outcome.input);

  const saved = await saveInboundInvoice({
    direction: "incoming",
    counterpartyInn: inv.supplierInn,
    counterpartyNameRaw: inv.supplierName,
    invoiceNumber: inv.invoiceNumber,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    amountTotal: inv.amountTotal,
    vatAmount: inv.vatAmount,
    vatRate: inv.vatRate,
    vatIncluded: inv.vatIncluded,
    serviceDescription: inv.serviceDescription,
    supplierKpp: inv.supplierKpp,
    supplierAccount: inv.supplierAccount,
    supplierBankBic: inv.supplierBankBic,
    supplierCorrAccount: inv.supplierCorrAccount,
    supplierBankName: inv.supplierBankName,
    contractNumber: inv.contractNumber,
    contractDate: inv.contractDate,
    currency: inv.currency,
    purposeRaw: inv.purpose,
    status: "pending",
    source: "upload",
    sourceFileId,
    extractedText: outcome.input.modality === "text" ? outcome.input.text : null,
  });

  const [row] = await db.select().from(inboundInvoices).where(eq(inboundInvoices.id, saved.id));
  return toPrefill(row, Number(inv.amountTotal ?? 0), inv.warnings ?? [], inv.confidence);
}

type InvoiceRow = typeof inboundInvoices.$inferSelect;

function toPrefill(
  row: InvoiceRow,
  remaining: number,
  warnings: string[],
  confidence = 1,
): PaymentPrefill {
  const amountTotal = row.amountTotal == null ? null : Number(row.amountTotal);
  const vatRate = row.vatRate == null ? null : Number(row.vatRate);
  // Разумные значения НДС по умолчанию, если счёт не дал их явно.
  const effRate = vatRate ?? (row.vatIncluded === false ? 0 : DEFAULT_VAT_RATE);
  const effIncluded = row.vatIncluded ?? true;
  const allWarnings = [...warnings];
  if (vatRate == null && row.vatIncluded !== false) {
    allWarnings.push("Ставка НДС не распознана — поставил 22% «в т.ч.», проверьте.");
  }
  if (!row.supplierAccount || !row.supplierBankBic) {
    allWarnings.push("Не распознаны р/с или БИК получателя — заполните вручную.");
  }

  const purpose = buildPaymentPurpose({
    invoiceNumber: row.invoiceNumber,
    invoiceDate: isoDate(row.invoiceDate),
    contractNumber: row.contractNumber,
    contractDate: isoDate(row.contractDate),
    serviceDescription: row.serviceDescription,
    amount: remaining > 0 ? remaining : amountTotal ?? 0,
    vatRate: effRate,
    vatIncluded: effIncluded,
  });

  return {
    inboundInvoiceId: row.id,
    counterpartyName: row.counterpartyNameRaw,
    counterpartyInn: row.counterpartyInn,
    counterpartyKpp: row.supplierKpp,
    counterpartyAccount: row.supplierAccount,
    counterpartyBankBic: row.supplierBankBic,
    counterpartyCorrAccount: row.supplierCorrAccount,
    amount: remaining > 0 ? remaining : amountTotal ?? 0,
    amountTotal,
    remaining,
    invoiceNumber: row.invoiceNumber,
    invoiceDate: isoDate(row.invoiceDate),
    contractNumber: row.contractNumber,
    contractDate: isoDate(row.contractDate),
    serviceDescription: row.serviceDescription,
    vatRate: effRate,
    vatIncluded: effIncluded,
    purpose,
    warnings: allWarnings,
    confidence,
  };
}
