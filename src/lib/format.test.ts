import { describe, expect, it } from "vitest";

import {
  DEFAULT_VAT_RATE,
  formatRub,
  formatRubShort,
  vatAmount,
  withVat,
} from "@/lib/format";

const NBSP = 0x00a0;
const NARROW_NBSP = 0x202f;

function hasNonBreakingSpace(s: string): boolean {
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (code === NBSP || code === NARROW_NBSP) return true;
  }
  return false;
}

describe("formatRub", () => {
  it("formats a whole ruble amount symbol-leading with space grouping", () => {
    expect(formatRub(1234567)).toBe("₽ 1 234 567");
  });

  it("rounds away fractions in the default (whole) form", () => {
    expect(formatRub(1234.6)).toBe("₽ 1 235");
  });

  it("keeps two fraction digits in precise form (ru-RU decimal comma)", () => {
    expect(formatRub(1234567, { precise: true })).toBe("₽ 1 234 567,00");
  });

  it("prefixes negatives with a true minus before the symbol", () => {
    expect(formatRub(-86500)).toBe("−₽ 86 500");
  });

  it("renders zero without a sign", () => {
    expect(formatRub(0)).toBe("₽ 0");
  });

  it("normalizes the ru-RU grouping separator to a plain ASCII space", () => {
    expect(hasNonBreakingSpace(formatRub(1000000))).toBe(false);
  });
});

describe("formatRubShort", () => {
  it("uses M for millions with one decimal", () => {
    expect(formatRubShort(1500000)).toBe("₽ 1.5M");
  });

  it("uses к for thousands, rounded", () => {
    expect(formatRubShort(2400)).toBe("₽ 2к");
    expect(formatRubShort(2600)).toBe("₽ 3к");
  });

  it("shows raw value below a thousand", () => {
    expect(formatRubShort(999)).toBe("₽ 999");
  });

  it("handles negatives across each band", () => {
    expect(formatRubShort(-2_400_000)).toBe("−₽ 2.4M");
    expect(formatRubShort(-5000)).toBe("−₽ 5к");
    expect(formatRubShort(-120)).toBe("−₽ 120");
  });
});

describe("vatAmount", () => {
  it("takes the rate as an explicit percent argument", () => {
    expect(vatAmount(100, 20)).toBe(20);
  });

  it("falls back to the default rate (22%) when omitted", () => {
    expect(vatAmount(100)).toBe(22);
    expect(vatAmount(100)).toBe(vatAmount(100, DEFAULT_VAT_RATE));
  });

  it("returns zero on a zero base", () => {
    expect(vatAmount(0, 22)).toBe(0);
  });
});

describe("withVat", () => {
  it("grosses up a net base by an explicit rate", () => {
    expect(withVat(100, 20)).toBe(120);
  });

  it("falls back to the default rate (22%) when omitted", () => {
    expect(withVat(100)).toBe(122);
  });
});
