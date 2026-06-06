// Auto-match pending inbound invoices (from mail) to booked Tochka payments
// (MAIL_AI_INTEGRATION §6.4). Idempotent: only touches status='pending'. Uses the
// pure matchInvoiceToTransactions; a confident unique match → status 'paid' + link.

import { eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { inboundInvoices } from "@/lib/db/schema/inboundInvoices";
import { bankTransactions } from "@/lib/db/schema/tochkaFinance";
import { matchInvoiceToTransactions, type InvoiceMatchCandidate } from "./match-invoice";

export async function reconcileInboundInvoices(): Promise<number> {
  const pending = await db
    .select({
      id: inboundInvoices.id,
      counterpartyInn: inboundInvoices.counterpartyInn,
      invoiceNumber: inboundInvoices.invoiceNumber,
      amountTotal: inboundInvoices.amountTotal,
    })
    .from(inboundInvoices)
    .where(eq(inboundInvoices.status, "pending"));

  let linked = 0;
  for (const inv of pending) {
    if (!inv.counterpartyInn) continue;

    const txs = await db
      .select({
        id: bankTransactions.id,
        counterpartyInn: bankTransactions.counterpartyInn,
        purposeRaw: bankTransactions.purposeRaw,
        amount: bankTransactions.amount,
      })
      .from(bankTransactions)
      .where(eq(bankTransactions.counterpartyInn, inv.counterpartyInn))
      .limit(50);

    const candidates: InvoiceMatchCandidate[] = txs.map((t) => ({
      id: t.id,
      counterpartyInn: t.counterpartyInn,
      purposeRaw: t.purposeRaw,
      amount: t.amount != null ? Number(t.amount) : null,
    }));

    const match = matchInvoiceToTransactions(
      {
        counterpartyInn: inv.counterpartyInn,
        invoiceNumber: inv.invoiceNumber,
        amountTotal: inv.amountTotal != null ? Number(inv.amountTotal) : null,
      },
      candidates,
    );

    if (match) {
      await db
        .update(inboundInvoices)
        .set({ status: "paid", paidTxId: match.txId, updatedAt: sql`now()` })
        .where(eq(inboundInvoices.id, inv.id));
      linked += 1;
    }
  }
  return linked;
}
