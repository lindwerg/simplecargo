import { describe, expect, it } from "vitest";

import { xlsxToText } from "./xlsx";

// Собираем двухлистовую книгу прямо в тесте (SheetJS write → ArrayBuffer),
// чтобы не таскать бинарные фикстуры в репозитории.
async function twoSheetWorkbook(): Promise<ArrayBuffer> {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Вагон", "Состояние"],
      ["52345675", "ГРУЖ"],
    ]),
    "Гружёные",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Вагон", "Состояние"],
      ["60112349", "ПОРОЖ"],
    ]),
    "Порожние",
  );
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("xlsxToText", () => {
  it("по умолчанию читает только первый лист (поведение «Создать запрос» не меняется)", async () => {
    const buf = await twoSheetWorkbook();
    const text = await xlsxToText(buf);
    expect(text).toContain("52345675");
    expect(text).not.toContain("60112349");
    expect(text).not.toContain("[лист");
  });

  it("allSheets=true конкатенирует все листы с заголовками «[лист N: имя]»", async () => {
    const buf = await twoSheetWorkbook();
    const text = await xlsxToText(buf, { allSheets: true });
    expect(text).toContain("[лист 1: Гружёные]");
    expect(text).toContain("[лист 2: Порожние]");
    expect(text).toContain("52345675");
    expect(text).toContain("60112349");
  });

  it("возвращает пустую строку для книги без листов", async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    // SheetJS не пишет книгу без листов — добавляем пустой лист.
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[]]), "Пустой");
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    expect((await xlsxToText(buf, { allSheets: true })).trim()).toBe("");
  });
});
