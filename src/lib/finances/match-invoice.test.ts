import { describe, expect, it } from "vitest";

import { matchInvoiceToTransactions, type InvoiceMatchCandidate } from "./match-invoice";

const txs: InvoiceMatchCandidate[] = [
  { id: "tx-1", counterpartyInn: "7701234567", purposeRaw: "Оплата по счёту № 245 от 01.05.2026", amount: 120000 },
  { id: "tx-2", counterpartyInn: "7709999999", purposeRaw: "Аванс по договору", amount: 50000 },
];

describe("matchInvoiceToTransactions", () => {
  it("matches by ИНН + invoice number + amount with high confidence", () => {
    const m = matchInvoiceToTransactions(
      { counterpartyInn: "7701234567", invoiceNumber: "245", amountTotal: 120000 },
      txs,
    );
    expect(m?.txId).toBe("tx-1");
    expect(m?.confidence).toBe(0.95);
  });

  it("tolerates leading zeros in the invoice number", () => {
    const m = matchInvoiceToTransactions(
      { counterpartyInn: "7701234567", invoiceNumber: "0245", amountTotal: 120000 },
      txs,
    );
    expect(m?.txId).toBe("tx-1");
  });

  it("returns null when nothing matches", () => {
    const m = matchInvoiceToTransactions(
      { counterpartyInn: "7700000000", invoiceNumber: "999", amountTotal: 1 },
      txs,
    );
    expect(m).toBeNull();
  });

  it("falls back to ИНН + amount (no number) at lower confidence", () => {
    const m = matchInvoiceToTransactions(
      { counterpartyInn: "7709999999", invoiceNumber: null, amountTotal: 50000 },
      txs,
    );
    expect(m?.txId).toBe("tx-2");
    expect(m?.confidence).toBe(0.6);
  });
});
