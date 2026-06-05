import { describe, it, expect } from "vitest";
import { buildOwnerLetterText, type OwnerLetterInput } from "@/lib/documents/ownerLetter";
import { COMPANY, CONTACT_DEFAULT } from "@/lib/config/company";

const fullInput: OwnerLetterInput = {
  ownerName: "ТрансВагон",
  originName: "Качканар",
  originRoad: "СВР",
  destName: "Находка",
  destRoad: "ДВС",
  wagonTypeLabel: "полувагонов",
  wagonsCount: 60,
  cargoName: "щебень",
  periodFrom: "2026-07-01",
  periodTo: "2026-07-31",
  targetRate: "до 2 000 ₽/ваг",
  notes: "Возможна пролонгация.",
};

describe("buildOwnerLetterText — full route", () => {
  it("renders the personalised greeting", () => {
    const text = buildOwnerLetterText(fullInput);
    expect(text).toContain("Уважаемый, ТрансВагон!");
  });

  it("renders the request line with count, type and both stations with roads", () => {
    const text = buildOwnerLetterText(fullInput);
    expect(text).toContain(
      "Просим предоставить ставку на предоставление 60 полувагонов по направлению Качканар (СВР) → Находка (ДВС).",
    );
  });

  it("renders cargo, period, target rate and notes", () => {
    const text = buildOwnerLetterText(fullInput);
    expect(text).toContain("Груз: щебень.");
    expect(text).toContain("Период: с 2026-07-01 по 2026-07-31.");
    expect(text).toContain("Ориентир по ставке: до 2 000 ₽/ваг.");
    expect(text).toContain("Возможна пролонгация.");
  });

  it("closes with the company short name and default contact", () => {
    const text = buildOwnerLetterText(fullInput);
    expect(text).toContain(COMPANY.shortName);
    expect(text).toContain(CONTACT_DEFAULT.name);
    expect(text).toContain(CONTACT_DEFAULT.phone);
  });
});

describe("buildOwnerLetterText — graceful omission", () => {
  it("falls back to the generic greeting when ownerName is missing", () => {
    const text = buildOwnerLetterText({
      originName: "Качканар",
      destName: "Находка",
    });
    expect(text).toContain("Уважаемые коллеги!");
    expect(text).not.toContain("Уважаемый,");
  });

  it("omits parentheses when a road is absent", () => {
    const text = buildOwnerLetterText({
      originName: "Качканар",
      destName: "Находка",
    });
    expect(text).toContain("по направлению Качканар → Находка.");
    expect(text).not.toContain("(");
    expect(text).not.toContain(")");
  });

  it("omits the count when wagonsCount is missing but keeps the type", () => {
    const text = buildOwnerLetterText({
      originName: "Качканар",
      destName: "Находка",
      wagonTypeLabel: "полувагонов",
    });
    expect(text).toContain("предоставление полувагонов по направлению");
  });

  it("renders a one-sided period when only periodFrom is given", () => {
    const text = buildOwnerLetterText({
      originName: "Качканар",
      destName: "Находка",
      periodFrom: "2026-07-01",
    });
    expect(text).toContain("Период: с 2026-07-01.");
  });

  it("never leaks null or undefined for a minimal input", () => {
    const text = buildOwnerLetterText({
      originName: "Качканар",
      destName: "Находка",
    });
    expect(text).not.toMatch(/null|undefined/);
  });

  it("never leaks null or undefined for the full input", () => {
    const text = buildOwnerLetterText(fullInput);
    expect(text).not.toMatch(/null|undefined/);
  });

  it("drops a zero or negative wagon count", () => {
    const text = buildOwnerLetterText({
      originName: "А",
      destName: "Б",
      wagonsCount: 0,
      wagonTypeLabel: "крытых",
    });
    expect(text).toContain("предоставление крытых по направлению");
    expect(text).not.toContain("0 крытых");
  });
});
