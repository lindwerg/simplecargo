import { describe, expect, it } from "vitest";

import {
  contactSchema,
  createPartnerSchema,
  documentMetaSchema,
  normalizeEmail,
  updatePartnerSchema,
} from "./schema";

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Info@Company.RU ")).toBe("info@company.ru");
  });

  it("returns empty string for blank input", () => {
    expect(normalizeEmail("   ")).toBe("");
  });
});

describe("createPartnerSchema", () => {
  it("accepts a company with a single role", () => {
    const parsed = createPartnerSchema.safeParse({ name: "ООО Ромашка", roles: ["client"] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("ООО Ромашка");
      expect(parsed.data.roles).toEqual(["client"]);
      expect(parsed.data.inn).toBeUndefined();
    }
  });

  it("accepts multiple roles incl. expeditor", () => {
    const parsed = createPartnerSchema.safeParse({
      name: "Экспедитор-Плюс",
      roles: ["owner", "expeditor"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createPartnerSchema.safeParse({ name: "  ", roles: ["client"] }).success).toBe(false);
  });

  it("rejects an empty roles array", () => {
    expect(createPartnerSchema.safeParse({ name: "X", roles: [] }).success).toBe(false);
  });

  it("rejects an unknown role", () => {
    expect(createPartnerSchema.safeParse({ name: "X", roles: ["partner"] }).success).toBe(false);
  });

  it("drops blank optional inn/notes to undefined", () => {
    const parsed = createPartnerSchema.safeParse({
      name: "X",
      roles: ["client"],
      inn: "  ",
      notes: "",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.inn).toBeUndefined();
      expect(parsed.data.notes).toBeUndefined();
    }
  });
});

describe("updatePartnerSchema", () => {
  it("accepts a partial patch", () => {
    const parsed = updatePartnerSchema.safeParse({ notes: "перезвонить" });
    expect(parsed.success).toBe(true);
  });

  it("still rejects an explicitly empty roles array", () => {
    expect(updatePartnerSchema.safeParse({ roles: [] }).success).toBe(false);
  });
});

describe("contactSchema", () => {
  it("normalizes the email to lowercase", () => {
    const parsed = contactSchema.safeParse({ fullName: "Иван", email: "Ivan@Mail.RU" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.email).toBe("ivan@mail.ru");
  });

  it("rejects an invalid email", () => {
    expect(contactSchema.safeParse({ fullName: "Иван", email: "not-an-email" }).success).toBe(false);
  });

  it("requires at least one of name / phone / email", () => {
    expect(contactSchema.safeParse({ position: "Логист" }).success).toBe(false);
    expect(contactSchema.safeParse({ phone: "+79000000000" }).success).toBe(true);
  });

  it("defaults isPrimary to false", () => {
    const parsed = contactSchema.safeParse({ phone: "+79000000000" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.isPrimary).toBe(false);
  });
});

describe("documentMetaSchema", () => {
  it("defaults kind to other and requires a title", () => {
    const parsed = documentMetaSchema.safeParse({ title: "Скан" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.kind).toBe("other");
  });

  it("accepts a contract with ref + date", () => {
    const parsed = documentMetaSchema.safeParse({
      kind: "contract",
      title: "Договор ТЭО",
      docRef: "№2 от 11.11.2025",
      docDate: "2025-11-11",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(documentMetaSchema.safeParse({ kind: "invoice", title: "X" }).success).toBe(false);
  });

  it("rejects a missing title", () => {
    expect(documentMetaSchema.safeParse({ kind: "request" }).success).toBe(false);
  });
});
