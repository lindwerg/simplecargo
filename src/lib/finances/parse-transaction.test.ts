import { describe, expect, it } from "vitest";

import { parseTransaction, TochkaParseError } from "./parse-transaction";

// Fixtures mirror the field variants seen across Tochka statement/webhook payloads:
// nested PascalCase (OBP-style) and flat camelCase.

const creditNested = {
  transactionId: "tx-1001",
  paymentId: "pmt-77",
  creditDebitIndicator: "Credit",
  status: "Booked",
  Amount: { amount: "150000.00", currency: "RUB" },
  documentProcessDate: "2026-05-12T09:30:00Z",
  description: "Оплата по счёту № 245 от 01.05.2026, в т.ч. НДС",
  DebtorParty: { name: "ООО Ромашка", inn: "7701234567", kpp: "770101001" },
  DebtorAccount: { account: "40702810400000012345" },
  DebtorAgent: { bic: "044525999" },
};

const debitFlat = {
  id: "tx-2002",
  direction: "Debit",
  amount: "86 500,50",
  currency: "RUB",
  transactionDate: "2026-05-13",
  paymentPurpose: "Оплата поставщику вагонов",
  name: "ООО Вагон-Сервис",
  inn: "5009876543",
  account: "40702810900000099999",
  bankBic: "044525111",
};

describe("parseTransaction — direction & counterparty", () => {
  it("maps Credit → 'in' and reads the DEBTOR (от кого пришли)", () => {
    const tx = parseTransaction(creditNested);
    expect(tx.direction).toBe("in");
    expect(tx.counterpartyName).toBe("ООО Ромашка");
    expect(tx.counterpartyInn).toBe("7701234567");
    expect(tx.counterpartyKpp).toBe("770101001");
    expect(tx.counterpartyAccount).toBe("40702810400000012345");
    expect(tx.counterpartyBankBic).toBe("044525999");
  });

  it("maps Debit → 'out' and reads the CREDITOR (кому оплатили), flat variant", () => {
    const tx = parseTransaction(debitFlat);
    expect(tx.direction).toBe("out");
    expect(tx.counterpartyName).toBe("ООО Вагон-Сервис");
    expect(tx.counterpartyInn).toBe("5009876543");
    expect(tx.counterpartyAccount).toBe("40702810900000099999");
    expect(tx.counterpartyBankBic).toBe("044525111");
  });
});

describe("parseTransaction — amounts & dates", () => {
  it("parses a plain decimal string amount", () => {
    expect(parseTransaction(creditNested).amount).toBe(150000);
  });

  it("normalizes ru-style amount (spaces + comma decimal)", () => {
    expect(parseTransaction(debitFlat).amount).toBe(86500.5);
  });

  it("always returns a positive (absolute) amount", () => {
    const tx = parseTransaction({ ...debitFlat, amount: "-500.00" });
    expect(tx.amount).toBe(500);
  });

  it("parses the posted date into a Date", () => {
    expect(parseTransaction(creditNested).postedAt.getUTCFullYear()).toBe(2026);
  });

  it("carries id, payment id, currency, purpose and status", () => {
    const tx = parseTransaction(creditNested);
    expect(tx.externalTxId).toBe("tx-1001");
    expect(tx.paymentId).toBe("pmt-77");
    expect(tx.currency).toBe("RUB");
    expect(tx.purposeRaw).toContain("счёту № 245");
    expect(tx.status).toBe("booked");
  });

  it("preserves the raw payload for re-parsing", () => {
    expect(parseTransaction(creditNested).raw).toBe(creditNested);
  });
});

describe("parseTransaction — strictness on essential fields", () => {
  it("throws when not an object", () => {
    expect(() => parseTransaction("nope")).toThrow(TochkaParseError);
  });

  it("throws when the id is missing", () => {
    expect(() => parseTransaction({ creditDebitIndicator: "Credit", amount: "1" })).toThrow(
      TochkaParseError,
    );
  });

  it("throws when the direction is unrecognized", () => {
    expect(() => parseTransaction({ transactionId: "x", amount: "1", date: "2026-01-01" })).toThrow(
      TochkaParseError,
    );
  });

  it("throws when the amount is unparseable", () => {
    expect(() =>
      parseTransaction({ transactionId: "x", creditDebitIndicator: "Credit", date: "2026-01-01" }),
    ).toThrow(TochkaParseError);
  });

  it("throws when the date is missing/invalid", () => {
    expect(() =>
      parseTransaction({ transactionId: "x", creditDebitIndicator: "Credit", amount: "1" }),
    ).toThrow(TochkaParseError);
  });

  it("flags pending status", () => {
    const tx = parseTransaction({ ...creditNested, status: "Pending" });
    expect(tx.status).toBe("pending");
  });
});
