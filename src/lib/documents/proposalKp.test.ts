import { describe, it, expect } from "vitest";

import { buildProposalKp, type KpLineInput } from "@/lib/documents/proposalKp";
import { COMPANY } from "@/lib/config/company";

const FIXED_ISO = "2026-06-06T09:30:00.000Z";

function line(overrides: Partial<KpLineInput> = {}): KpLineInput {
  return {
    originRaw: "Качканар",
    originRoadRaw: "СВР",
    destRaw: "Находка",
    destRoadRaw: "ДВС",
    wagonsRequested: 60,
    wagonType: "ПВ",
    targetRatePerWagon: 30000,
    ...overrides,
  };
}

describe("buildProposalKp — date + iss number", () => {
  it("formats dateLabel as dd.MM.yyyy from a fixed ISO string", () => {
    const model = buildProposalKp({ lines: [line()], todayIso: FIXED_ISO });
    expect(model.dateLabel).toBe("06.06.2026");
  });

  it("derives iss number from the request number trailing digits", () => {
    const model = buildProposalKp({ requestNumber: "REQ-2026-0042", lines: [line()], todayIso: FIXED_ISO });
    expect(model.issNumber).toBe("0042/01");
  });

  it("falls back to ____ when there is no request number", () => {
    const model = buildProposalKp({ lines: [line()], todayIso: FIXED_ISO });
    expect(model.issNumber).toBe("____");
  });

  it("prefers an explicit issNumber override", () => {
    const model = buildProposalKp({ requestNumber: "REQ-99", issNumber: "12/03", lines: [line()], todayIso: FIXED_ISO });
    expect(model.issNumber).toBe("12/03");
  });
});

describe("buildProposalKp — route formatting", () => {
  it("renders both stations with roads in parentheses", () => {
    const model = buildProposalKp({ lines: [line()], todayIso: FIXED_ISO });
    expect(model.rows[0].route).toBe("Качканар (СВР) → Находка (ДВС)");
  });

  it("omits empty parentheses when roads are absent", () => {
    const model = buildProposalKp({
      lines: [line({ originRoadRaw: null, destRoadRaw: "" })],
      todayIso: FIXED_ISO,
    });
    expect(model.rows[0].route).toBe("Качканар → Находка");
    expect(model.rows[0].route).not.toContain("(");
  });
});

describe("buildProposalKp — wagon type + count", () => {
  it("resolves the line wagon-type code to a label", () => {
    const model = buildProposalKp({ lines: [line({ wagonType: "ПВ" })], todayIso: FIXED_ISO });
    expect(model.rows[0].wagonType).toBe("Полувагон");
  });

  it("falls back to the request header wagon type", () => {
    const model = buildProposalKp({
      lines: [line({ wagonType: null })],
      headerWagonType: "КР",
      todayIso: FIXED_ISO,
    });
    expect(model.rows[0].wagonType).toBe("Крытый вагон");
  });

  it("shows dash when no wagon type is known", () => {
    const model = buildProposalKp({ lines: [line({ wagonType: null })], todayIso: FIXED_ISO });
    expect(model.rows[0].wagonType).toBe("—");
  });

  it("formats count as N ваг and dash when missing", () => {
    const present = buildProposalKp({ lines: [line({ wagonsRequested: 40 })], todayIso: FIXED_ISO });
    const missing = buildProposalKp({ lines: [line({ wagonsRequested: null })], todayIso: FIXED_ISO });
    expect(present.rows[0].count).toBe("40 ваг");
    expect(missing.rows[0].count).toBe("—");
  });
});

describe("buildProposalKp — rate text variants", () => {
  it("formats a flat ₽/wagon amount (numeric string)", () => {
    const model = buildProposalKp({ lines: [line({ targetRatePerWagon: "30000" })], todayIso: FIXED_ISO });
    const expected = `${new Intl.NumberFormat("ru-RU").format(30000)} ₽/ваг`;
    expect(model.rows[0].rateText).toBe(expected);
    expect(model.rows[0].rateText).toMatch(/^30.000 ₽\/ваг$/);
  });

  it("uses formatRateExpression for tariff-plus-markup kinds", () => {
    const model = buildProposalKp({
      lines: [line({ targetRatePerWagon: null, targetRateKind: "tariff_plus_markup", targetRateMarkupPct: 10 })],
      todayIso: FIXED_ISO,
    });
    expect(model.rows[0].rateText).toBe("+10% к тарифу 10-01");
  });

  it("renders по тарифу for a zero-markup tariff kind", () => {
    const model = buildProposalKp({
      lines: [line({ targetRatePerWagon: null, targetRateKind: "tariff_indicative", targetRateMarkupPct: 0 })],
      todayIso: FIXED_ISO,
    });
    expect(model.rows[0].rateText).toBe("по тарифу 10-01");
  });

  it("falls back to targetRateRaw then по запросу", () => {
    const raw = buildProposalKp({
      lines: [line({ targetRatePerWagon: null, targetRateRaw: "договорная" })],
      todayIso: FIXED_ISO,
    });
    const none = buildProposalKp({
      lines: [line({ targetRatePerWagon: null, targetRateRaw: null })],
      todayIso: FIXED_ISO,
    });
    expect(raw.rows[0].rateText).toBe("договорная");
    expect(none.rows[0].rateText).toBe("по запросу");
  });
});

describe("buildProposalKp — static content", () => {
  it("uses a generic greeting, vat note from company, and a client fallback", () => {
    const model = buildProposalKp({ lines: [line()], todayIso: FIXED_ISO });
    expect(model.greeting).toBe("Уважаемые коллеги!");
    expect(model.vatNote).toContain(`${COMPANY.vatRatePct}%`);
    expect(model.clientName).toBe("клиенту");
  });

  it("trims a provided client name", () => {
    const model = buildProposalKp({ clientName: "  ООО Грузовик  ", lines: [line()], todayIso: FIXED_ISO });
    expect(model.clientName).toBe("ООО Грузовик");
  });
});
