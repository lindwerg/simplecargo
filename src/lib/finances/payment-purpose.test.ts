import { describe, expect, it } from "vitest";

import {
  buildPaymentPurpose,
  sanitizeCounterpartyName,
  sanitizePaymentPurpose,
} from "./payment-purpose";
import { vatFromGross } from "@/lib/format";

describe("sanitizeCounterpartyName", () => {
  it("убирает «ёлочки», которые Точка запрещает в имени получателя", () => {
    expect(sanitizeCounterpartyName("ООО «Яндекс.Такси»")).toBe("ООО Яндекс.Такси");
  });

  it("убирает прямые и типографские кавычки, схлопывает пробелы", () => {
    expect(sanitizeCounterpartyName('ООО  "Ромашка"')).toBe("ООО Ромашка");
    expect(sanitizeCounterpartyName("ООО „Берёзка“")).toBe("ООО Берёзка");
  });

  it("обрезает слишком длинное имя", () => {
    expect(sanitizeCounterpartyName("А".repeat(200)).length).toBeLessThanOrEqual(160);
  });
});

describe("vatFromGross", () => {
  it("извлекает НДС из суммы с НДС", () => {
    expect(vatFromGross(122, 22)).toBeCloseTo(22, 2);
    expect(vatFromGross(375000, 22)).toBeCloseTo(67622.95, 2);
    expect(vatFromGross(120, 20)).toBeCloseTo(20, 2);
  });
});

describe("sanitizePaymentPurpose", () => {
  it("заменяет тире на дефис и схлопывает пробелы", () => {
    expect(sanitizePaymentPurpose("Оплата —  тест –  ещё")).toBe("Оплата - тест - ещё");
  });
});

describe("buildPaymentPurpose", () => {
  it("счёт + договор + НДС (в т.ч.)", () => {
    const p = buildPaymentPurpose({
      invoiceNumber: "107",
      invoiceDate: "2026-06-01",
      contractNumber: "21/05-2026",
      contractDate: "2026-05-21",
      serviceDescription: "предоставление подвижного состава",
      amount: 375000,
      vatRate: 22,
      vatIncluded: true,
    });
    expect(p).toContain("Оплата по счёту № 107 от 01.06.2026");
    expect(p).toContain("по договору № 21/05-2026 от 21.05.2026");
    expect(p).toContain("за предоставление подвижного состава");
    expect(p).toContain("В т.ч. НДС 22% - 67622.95 руб.");
    expect(p).not.toContain("—");
  });

  it("пересчитывает НДС при частичной оплате", () => {
    const p = buildPaymentPurpose({
      invoiceNumber: "107",
      invoiceDate: "2026-06-01",
      amount: 100000,
      vatRate: 22,
      vatIncluded: true,
    });
    expect(p).toContain("В т.ч. НДС 22% - 18032.79 руб.");
  });

  it("без НДС", () => {
    const p = buildPaymentPurpose({
      invoiceNumber: "5",
      invoiceDate: "2026-01-10",
      amount: 1000,
      vatRate: 0,
      vatIncluded: false,
    });
    expect(p).toContain("Без НДС.");
    expect(p).not.toContain("В т.ч.");
  });

  it("только договор, если счёта нет", () => {
    const p = buildPaymentPurpose({
      contractNumber: "7-УТ/2026",
      contractDate: "2026-02-11",
      amount: 5000,
      vatRate: 20,
      vatIncluded: true,
    });
    expect(p.startsWith("Оплата по договору № 7-УТ/2026 от 11.02.2026")).toBe(true);
  });

  it("обрезает до 210 символов", () => {
    const p = buildPaymentPurpose({
      invoiceNumber: "1",
      serviceDescription: "услуга ".repeat(60),
      amount: 1000,
      vatRate: 22,
      vatIncluded: true,
    });
    expect(p.length).toBeLessThanOrEqual(210);
  });
});
