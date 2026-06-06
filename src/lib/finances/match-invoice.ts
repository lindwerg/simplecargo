// PURE matcher: link an inbound invoice (from mail) to a booked Tochka payment
// (MAIL_AI_INTEGRATION §6.4). Built on top of match-purpose.ts. No DB — the
// caller supplies candidate transactions; this picks a unique confident match.

import { extractInns, purposeMentionsInvoice } from "./match-purpose";

export interface InvoiceMatchCandidate {
  id: string;
  counterpartyInn: string | null;
  purposeRaw: string | null;
  amount: number | null; // absolute value
}

export interface InvoiceToMatch {
  counterpartyInn: string | null;
  invoiceNumber: string | null;
  amountTotal: number | null;
}

export interface InvoiceMatch {
  txId: string;
  confidence: number; // 0.95 inn+number+amount; 0.8 inn+number; 0.6 inn+amount
}

const AMOUNT_EPSILON = 0.01;

function innMatches(invoiceInn: string | null, tx: InvoiceMatchCandidate): boolean {
  if (!invoiceInn) return false;
  if (tx.counterpartyInn && tx.counterpartyInn === invoiceInn) return true;
  return extractInns(tx.purposeRaw).includes(invoiceInn);
}

function amountMatches(a: number | null, b: number | null): boolean {
  if (a == null || b == null) return false;
  return Math.abs(Math.abs(a) - Math.abs(b)) < AMOUNT_EPSILON;
}

/** Return a unique confident match, or null if none / ambiguous (>1 candidate). */
export function matchInvoiceToTransactions(
  invoice: InvoiceToMatch,
  txs: InvoiceMatchCandidate[],
): InvoiceMatch | null {
  const scored: InvoiceMatch[] = [];
  for (const tx of txs) {
    const inn = innMatches(invoice.counterpartyInn, tx);
    if (!inn) continue;
    const num = purposeMentionsInvoice(tx.purposeRaw, invoice.invoiceNumber);
    const amt = amountMatches(tx.amount, invoice.amountTotal);
    if (num && amt) scored.push({ txId: tx.id, confidence: 0.95 });
    else if (num) scored.push({ txId: tx.id, confidence: 0.8 });
    else if (amt) scored.push({ txId: tx.id, confidence: 0.6 });
  }
  if (scored.length === 0) return null;
  // unique-best: take the highest confidence only if it is unambiguous
  scored.sort((a, b) => b.confidence - a.confidence);
  const top = scored[0];
  const tie = scored.filter((s) => s.confidence === top.confidence);
  if (tie.length > 1) return null; // ambiguous → manual
  return top;
}
