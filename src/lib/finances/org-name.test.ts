import { describe, expect, it } from "vitest";

import { abbreviateOrgName } from "./org-name";

describe("abbreviateOrgName", () => {
  it("сокращает ООО, сохраняя название", () => {
    expect(abbreviateOrgName('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ПРОФИТ РЕЙЛ"')).toBe(
      'ООО "ПРОФИТ РЕЙЛ"',
    );
  });

  it("сокращает ОАО / ПАО / ЗАО / АО", () => {
    expect(abbreviateOrgName("ОТКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО РЖД")).toBe("ОАО РЖД");
    expect(abbreviateOrgName('ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО "БАНК"')).toBe('ПАО "БАНК"');
    expect(abbreviateOrgName("ЗАКРЫТОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО ВАГОН")).toBe("ЗАО ВАГОН");
    expect(abbreviateOrgName('АКЦИОНЕРНОЕ ОБЩЕСТВО "АЛЬФА"')).toBe('АО "АЛЬФА"');
  });

  it("сокращает ИП с ФИО", () => {
    expect(abbreviateOrgName("ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ ИВАНОВ ИВАН")).toBe(
      "ИП ИВАНОВ ИВАН",
    );
  });

  it("не трогает уже сокращённые и обычные имена", () => {
    expect(abbreviateOrgName("ООО «РНС»")).toBe("ООО «РНС»");
    expect(abbreviateOrgName("ЗАПАДУРАЛНЕРУД")).toBe("ЗАПАДУРАЛНЕРУД");
  });

  it("возвращает null/empty как есть", () => {
    expect(abbreviateOrgName(null)).toBeNull();
    expect(abbreviateOrgName("")).toBeNull();
  });
});
