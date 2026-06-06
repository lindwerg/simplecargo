// IMPURE orchestrator (MAIL_AI_INTEGRATION §4): one email → classify → branch
// per part → extract only what's needed → disposition → persist via injected
// ports. Dependency-injected (see ports.ts) so the flow is unit-testable with
// fakes. Knows nothing about IMAP — the worker parses and supplies a ParsedEmail.

import type { ExtractInput, ExtractionResult } from "@/lib/requests/schema";
import { resultToRequestInput } from "./result-to-request";
import { decideRfqDisposition } from "./thresholds";
import { buildQuarantineRow } from "./quarantine-map";
import type { ClassifyResult, MailPartKind } from "./classify-schema";
import type { IntakeDeps, IntakeOutcome } from "./ports";
import type { ParsedEmail } from "./types";

// Collect (kind, ExtractInput) for the body + each attachment, converting binaries
// and routing scan-PDF/unsupported attachments straight to quarantine.
async function collectParts(
  email: ParsedEmail,
  cls: ClassifyResult,
  deps: IntakeDeps,
): Promise<{ kind: MailPartKind; input: ExtractInput }[]> {
  const out: { kind: MailPartKind; input: ExtractInput }[] = [];

  if (cls.bodyKind !== "other" && email.text.trim().length > 0) {
    out.push({ kind: cls.bodyKind, input: { modality: "text", text: email.text } });
  }

  for (const ac of cls.attachments) {
    if (ac.kind === "other") continue;
    const att = email.attachments[ac.index];
    if (!att) continue;
    const conv = await deps.convertAttachment(att, cls.senderOrgGuess ?? undefined);
    if (conv.ok) {
      out.push({ kind: ac.kind, input: conv.input });
    } else {
      await deps.ports.quarantine(
        buildQuarantineRow({
          reason: conv.reason === "scan_pdf" ? "UNSUPPORTED_ATTACHMENT" : "UNSUPPORTED_ATTACHMENT",
          sourceFileId: deps.ports.sourceFileId,
          agentReason: conv.detail,
          draft: { filename: att.filename, contentType: att.contentType },
        }),
      );
    }
  }
  return out;
}

function mergeExtractions(results: ExtractionResult[]): ExtractionResult {
  const head = results.find((r) => r.lines.length > 0) ?? results[0];
  return {
    clientGuess: results.map((r) => r.clientGuess).find(Boolean) ?? null,
    wagonType: head?.wagonType ?? null,
    periodFrom: results.map((r) => r.periodFrom).find(Boolean) ?? null,
    periodTo: results.map((r) => r.periodTo).find(Boolean) ?? null,
    lines: results.flatMap((r) => r.lines),
    warnings: results.flatMap((r) => r.warnings),
  };
}

export async function processEmail(email: ParsedEmail, deps: IntakeDeps): Promise<IntakeOutcome> {
  const classification = await deps.classify(email);
  const outcome: IntakeOutcome = {
    classification,
    createdRequestId: null,
    createdRequestNumber: null,
    invoiceIds: [],
    quarantinedCount: 0,
    ignored: false,
  };

  const parts = await collectParts(email, classification, deps);
  const rfqInputs = parts.filter((p) => p.kind === "client_rfq").map((p) => p.input);
  const invoiceInputs = parts.filter((p) => p.kind === "invoice").map((p) => p.input);
  const quoteInputs = parts.filter((p) => p.kind === "carrier_quote").map((p) => p.input);

  // ── client RFQ → one request per email ──────────────────────────────────────
  if (rfqInputs.length > 0) {
    const extractions = await Promise.all(rfqInputs.map((i) => deps.extractRequest(i)));
    const merged = mergeExtractions(extractions);
    const sender = await deps.resolveSender(email.from);
    const confidence = classification.bodyConfidence || 0.7;
    const disp = decideRfqDisposition({
      confidence,
      senderRoles: sender ? sender.roles : null,
      hasLines: merged.lines.some(
        (l) => l.originRaw && l.destRaw && (l.wagonsRequested ?? 0) > 0,
      ),
    });

    if (disp.disposition === "auto") {
      const { input } = resultToRequestInput({
        extraction: merged,
        email: { messageId: email.messageId, fromName: email.fromName ?? null, date: email.date ?? null },
        sender,
        needsReview: true, // ai_email always confirmed by operator (banner), even on auto-file
      });
      if (input) {
        const created = await deps.ports.createRequest(input, deps.ports.systemUserId);
        outcome.createdRequestId = created.id;
        outcome.createdRequestNumber = created.requestNumber;
      } else {
        await deps.ports.quarantine(
          buildQuarantineRow({
            reason: "NO_LINES_EXTRACTED",
            sourceFileId: deps.ports.sourceFileId,
            agentReason: "Строки маршрутов не извлеклись",
            draft: merged,
          }),
        );
        outcome.quarantinedCount += 1;
      }
    } else if (disp.disposition === "quarantine") {
      await deps.ports.quarantine(
        buildQuarantineRow({
          reason: disp.reason ?? "LOW_CONFIDENCE",
          sourceFileId: deps.ports.sourceFileId,
          agentReason: `Запрос на проверку (${disp.reason ?? "LOW_CONFIDENCE"}), уверенность ${confidence}`,
          draft: { extraction: merged, from: email.from, subject: email.subject },
        }),
      );
      outcome.quarantinedCount += 1;
    } else {
      outcome.ignored = true;
    }
  }

  // ── invoices → save each as pending (match to a payment later) ───────────────
  for (const input of invoiceInputs) {
    const inv = await deps.extractInvoice(input);
    const saved = await deps.ports.saveInvoice({
      direction: "incoming",
      counterpartyInn: inv.supplierInn,
      counterpartyNameRaw: inv.supplierName,
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      dueDate: inv.dueDate,
      amountTotal: inv.amountTotal,
      vatAmount: inv.vatAmount,
      currency: inv.currency,
      purposeRaw: inv.purpose,
      status: "pending",
      sourceFileId: deps.ports.sourceFileId,
      extractedText: input.modality === "text" ? input.text : null,
    });
    outcome.invoiceIds.push(saved.id);
  }

  // ── carrier quotes → money-sensitive → review queue (manual link, MVP) ───────
  for (const input of quoteInputs) {
    const q = await deps.extractCarrierQuote(input);
    await deps.ports.quarantine(
      buildQuarantineRow({
        reason: "CARRIER_QUOTE_MANUAL",
        sourceFileId: deps.ports.sourceFileId,
        agentReason: `Ответ перевозчика: ставка ${q.costPerWagon ?? "?"} ₽/ваг, ref ${q.ourRequestRef ?? "—"}`,
        draft: { quote: q, from: email.from, subject: email.subject },
      }),
    );
    outcome.quarantinedCount += 1;
  }

  if (
    rfqInputs.length === 0 &&
    invoiceInputs.length === 0 &&
    quoteInputs.length === 0
  ) {
    outcome.ignored = true;
  }

  return outcome;
}
