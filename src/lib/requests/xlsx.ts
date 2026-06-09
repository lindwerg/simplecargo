// IMPURE, Node-only: parse an uploaded XLSX/XLS workbook to TSV text. SheetJS is
// loaded via dynamic import so it NEVER lands in the client/edge bundle — only
// reachable from the Node route handler (runtime = "nodejs"). TSV preserves empty
// cells as empty fields, so the normalizer can forward-fill blank origin rows.
//
// По умолчанию читается ТОЛЬКО первый лист (поведение «Создать запрос» — промпт
// извлечения настроен на одну таблицу). allSheets=true конкатенирует все листы с
// заголовком «[лист N: имя]» — нужно дислокациям, где вагоны разложены по листам.

export async function xlsxToText(
  buf: ArrayBuffer,
  opts?: { allSheets?: boolean },
): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });

  if (!opts?.allSheets) {
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) return "";
    return XLSX.utils.sheet_to_csv(wb.Sheets[firstSheetName], { FS: "\t", blankrows: false });
  }

  const parts: string[] = [];
  wb.SheetNames.forEach((name, i) => {
    const text = XLSX.utils.sheet_to_csv(wb.Sheets[name], { FS: "\t", blankrows: false });
    if (text.trim().length === 0) return;
    parts.push(`[лист ${i + 1}: ${name}]\n${text}`);
  });
  return parts.join("\n");
}
