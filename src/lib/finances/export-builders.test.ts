import { describe, expect, it } from "vitest";

import { build1cText, buildCsv, toSheetRows } from "./export-builders";
import type { ExportRow } from "./repository";

const rows: ExportRow[] = [
  {
    date: "2026-06-05T00:00:00Z",
    direction: "in",
    amount: 112342.63,
    counterpartyName: "ООО Ромашка",
    counterpartyInn: "7701234567",
    counterpartyAccount: "40702810400000012345",
    counterpartyBankBic: "044525999",
    purpose: "Оплата по счёту 245",
    documentNumber: "2451",
    status: "booked",
  },
  {
    date: "2026-06-05T00:00:00Z",
    direction: "out",
    amount: 50000,
    counterpartyName: "ООО Вагон-Сервис",
    counterpartyInn: "5009876543",
    counterpartyAccount: "40702810900000099999",
    counterpartyBankBic: "044525111",
    purpose: "Оплата поставщику",
    documentNumber: "272",
    status: "booked",
  },
];

const self = {
  accountNumber: "40702810100000005057",
  bic: "044525104",
  name: "ООО «РУСНЕРУДСТРОЙ»",
  inn: "6671325150",
  kpp: "667101001",
};

describe("toSheetRows", () => {
  it("signs amount by direction and flattens fields", () => {
    const sheet = toSheetRows(rows);
    expect(sheet[0]["Сумма"]).toBe(112342.63); // in → positive
    expect(sheet[1]["Сумма"]).toBe(-50000); // out → negative
    expect(sheet[0]["Контрагент"]).toBe("ООО Ромашка");
  });
});

describe("buildCsv", () => {
  it("starts with a BOM and has a header + rows", () => {
    const csv = buildCsv(rows);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).split("\r\n");
    expect(lines[0]).toContain("Дата");
    expect(lines).toHaveLength(3); // header + 2 rows
  });
});

describe("build1cText", () => {
  const text = build1cText(rows, { from: "2026-06-01", to: "2026-06-06", self });

  it("has the 1CClientBankExchange envelope", () => {
    expect(text.startsWith("1CClientBankExchange")).toBe(true);
    expect(text).toContain("ВерсияФормата=1.03");
    expect(text).toContain(`РасчСчет=${self.accountNumber}`);
    expect(text.trimEnd().endsWith("КонецФайла")).toBe(true);
  });

  it("incoming: payer is the counterparty, receiver is us", () => {
    expect(text).toContain("Плательщик=ООО Ромашка");
    expect(text).toContain("ПлательщикИНН=7701234567");
    expect(text).toContain(`Получатель=${self.name}`);
  });

  it("outgoing: payer is us, receiver is the counterparty", () => {
    expect(text).toContain(`Плательщик=${self.name}`);
    expect(text).toContain("Получатель=ООО Вагон-Сервис");
    expect(text).toContain("ПолучательИНН=5009876543");
  });

  it("emits a Платежное поручение section per operation", () => {
    const count = text.split("СекцияДокумент=Платежное поручение").length - 1;
    expect(count).toBe(2);
  });
});
