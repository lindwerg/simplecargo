import * as XLSX from "xlsx";

import { apiFail } from "@/lib/api/response";
import { AuthError, requireSession } from "@/lib/api/session";
import { listTransactionsForExport, type ExportRow } from "@/lib/finances/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ru(direction: string): string {
  return direction === "in" ? "Поступление" : "Списание";
}

function signed(row: ExportRow): number {
  return row.direction === "in" ? row.amount : -row.amount;
}

interface SheetRow {
  Дата: string;
  Тип: string;
  Сумма: number;
  Контрагент: string;
  ИНН: string;
  "Счёт": string;
  БИК: string;
  Назначение: string;
  "№ док": string;
  Статус: string;
}

function toSheetRows(rows: ExportRow[]): SheetRow[] {
  return rows.map((r) => ({
    Дата: r.date.slice(0, 10),
    Тип: ru(r.direction),
    Сумма: signed(r),
    Контрагент: r.counterpartyName ?? "",
    ИНН: r.counterpartyInn ?? "",
    "Счёт": r.counterpartyAccount ?? "",
    БИК: r.counterpartyBankBic ?? "",
    Назначение: r.purpose ?? "",
    "№ док": r.documentNumber ?? "",
    Статус: r.status,
  }));
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(rows: SheetRow[]): string {
  if (rows.length === 0) return "﻿";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(";")];
  for (const row of rows) {
    const rec = row as unknown as Record<string, string | number>;
    lines.push(headers.map((h) => csvEscape(rec[h])).join(";"));
  }
  // BOM so Excel reads UTF-8 Cyrillic correctly.
  return `﻿${lines.join("\r\n")}`;
}

function contentDisposition(name: string): string {
  return `attachment; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

// GET ?format=csv|xlsx&from=&to=&direction=&q= — download a statement of synced ops.
export async function GET(request: Request): Promise<Response> {
  try {
    await requireSession(request.headers);
    const { searchParams } = new URL(request.url);
    const format = searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) return apiFail("Некорректный период", 422);
    const dirParam = searchParams.get("direction");
    const direction = dirParam === "in" || dirParam === "out" ? dirParam : undefined;
    const search = searchParams.get("q") ?? undefined;

    const rows = await listTransactionsForExport({
      from,
      to,
      ...(direction ? { direction } : {}),
      ...(search ? { search } : {}),
    });
    const sheetRows = toSheetRows(rows);
    const base = `Выписка_${from}_${to}`;

    if (format === "xlsx") {
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      ws["!cols"] = [
        { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 14 },
        { wch: 24 }, { wch: 11 }, { wch: 50 }, { wch: 8 }, { wch: 10 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Выписка");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": contentDisposition(`${base}.xlsx`),
        },
      });
    }

    return new Response(buildCsv(sheetRows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": contentDisposition(`${base}.csv`),
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) return apiFail(error.message, error.status);
    console.error("[finances] export failed:", error instanceof Error ? error.message : error);
    return apiFail("Не удалось сформировать выписку", 500);
  }
}
