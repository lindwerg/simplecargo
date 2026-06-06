import { describe, expect, it } from "vitest";

import { extractInns, extractInvoiceNumbers, purposeMentionsInvoice } from "./match-purpose";

describe("extractInvoiceNumbers", () => {
  it("reads 'Счет № 245'", () => {
    expect(extractInvoiceNumbers("Оплата по счёту № 245 от 01.05.2026")).toContain("245");
  });

  it("reads СФ / счёт-фактура variants", () => {
    expect(extractInvoiceNumbers("СФ 1270, в т.ч. НДС")).toContain("1270");
    expect(extractInvoiceNumbers("счёт-фактура № 18 от 2026")).toContain("18");
  });

  it("dedups and returns [] for none", () => {
    expect(extractInvoiceNumbers("Перевод средств")).toEqual([]);
    expect(extractInvoiceNumbers(null)).toEqual([]);
  });
});

describe("extractInns", () => {
  it("prefers tagged ИНН, then bare 10/12-digit groups", () => {
    const inns = extractInns("Оплата ИНН 7701234567 за услуги, договор 5009876543210");
    expect(inns[0]).toBe("7701234567");
  });

  it("finds a bare 12-digit ИНН", () => {
    expect(extractInns("перевод 500987654321 назначение")).toContain("500987654321");
  });

  it("does not match 9 or 11 digit groups", () => {
    expect(extractInns("счёт 044525999 номер 12345678901")).not.toContain("044525999");
  });
});

describe("purposeMentionsInvoice", () => {
  it("matches ignoring leading zeros", () => {
    expect(purposeMentionsInvoice("по счёту № 245", "0245")).toBe(true);
    expect(purposeMentionsInvoice("по счёту № 245", "246")).toBe(false);
    expect(purposeMentionsInvoice(null, "245")).toBe(false);
  });
});
