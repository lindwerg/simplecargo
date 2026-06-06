import { describe, it, expect } from "vitest";
import { COMPANY, CONTACT_DEFAULT } from "@/lib/config/company";

describe("COMPANY requisites", () => {
  it("exposes a 10-digit INN", () => {
    expect(COMPANY.inn).toMatch(/^\d{10}$/);
  });

  it("exposes a 9-digit KPP", () => {
    expect(COMPANY.kpp).toMatch(/^\d{9}$/);
  });

  it("exposes a 13-digit OGRN", () => {
    expect(COMPANY.ogrn).toMatch(/^\d{13}$/);
  });

  it("exposes an 8-digit OKPO", () => {
    expect(COMPANY.okpo).toMatch(/^\d{8}$/);
  });

  it("carries the expected legal and short names", () => {
    expect(COMPANY.name).toBe("ООО «РУСНЕРУДСТРОЙ»");
    expect(COMPANY.shortName).toBe("ООО «РНС»");
  });

  it("uses a 22% VAT rate", () => {
    expect(COMPANY.vatRatePct).toBe(22);
  });

  it("references kp asset paths", () => {
    expect(COMPANY.logoPath).toBe("/kp/logo.png");
    expect(COMPANY.stampSignaturePath).toBe("/kp/stamp-signature.png");
  });

  it("has a well-formed contact email", () => {
    expect(COMPANY.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });

  it("names the director with a title", () => {
    expect(COMPANY.directorName).toContain("Мишанихин");
    expect(COMPANY.directorTitle).toBe("Генеральный директор");
  });
});

describe("CONTACT_DEFAULT исполнитель", () => {
  it("provides name, phone and email", () => {
    expect(CONTACT_DEFAULT.name).toBe("Киян Анна");
    expect(CONTACT_DEFAULT.phone).toBe("8-906-807-66-17");
    expect(CONTACT_DEFAULT.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
  });
});
