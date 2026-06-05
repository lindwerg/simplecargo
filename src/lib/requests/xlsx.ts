// IMPURE, Node-only: parse an uploaded XLSX/XLS workbook to TSV text. SheetJS is
// loaded via dynamic import so it NEVER lands in the client/edge bundle — only
// reachable from the Node route handler (runtime = "nodejs"). TSV preserves empty
// cells as empty fields, so the normalizer can forward-fill blank origin rows.

export async function xlsxToText(buf: ArrayBuffer): Promise<string> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const firstSheetName = wb.SheetNames[0];
  if (!firstSheetName) return "";
  const sheet = wb.Sheets[firstSheetName];
  return XLSX.utils.sheet_to_csv(sheet, { FS: "\t", blankrows: false });
}
