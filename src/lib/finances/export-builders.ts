import * as XLSX from "xlsx";
import iconv from "iconv-lite";

import type { ExportRow } from "./repository";

// Pure builders for statement exports (CSV / XLSX / 1C). No HTTP/DB — reused by
// the download route and the email route, and unit-tested directly.

export interface PartySide {
  accountNumber: string; // наш расчётный счёт
  bic: string; // БИК банка плательщика (Точка)
  name: string;
  inn: string;
  kpp: string;
}

function ru(direction: string): string {
  return direction === "in" ? "Поступление" : "Списание";
}
function signed(row: ExportRow): number {
  return row.direction === "in" ? row.amount : -row.amount;
}
function ddmmyyyy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

export interface SheetRow {
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

export function toSheetRows(rows: readonly ExportRow[]): SheetRow[] {
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

export function buildCsv(rows: readonly ExportRow[]): string {
  const sheet = toSheetRows(rows);
  if (sheet.length === 0) return "﻿";
  const headers = Object.keys(sheet[0]);
  const lines = [headers.join(";")];
  for (const row of sheet) {
    const rec = row as unknown as Record<string, string | number>;
    lines.push(headers.map((h) => csvEscape(rec[h])).join(";"));
  }
  return `﻿${lines.join("\r\n")}`; // BOM for Excel UTF-8
}

export function buildXlsx(rows: readonly ExportRow[]): Buffer {
  const ws = XLSX.utils.json_to_sheet(toSheetRows(rows));
  ws["!cols"] = [
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 36 }, { wch: 14 },
    { wch: 24 }, { wch: 11 }, { wch: 50 }, { wch: 8 }, { wch: 10 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Выписка");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export interface OneCOptions {
  from: string; // YYYY-MM-DD
  to: string;
  self: PartySide;
}

/** 1CClientBankExchange (1.03) — текст для импорта в 1С. */
export function build1cText(rows: readonly ExportRow[], opts: OneCOptions): string {
  const L: string[] = [];
  L.push("1CClientBankExchange");
  L.push("ВерсияФормата=1.03");
  L.push("Кодировка=Windows");
  L.push(`Отправитель=${opts.self.name}`);
  L.push("Получатель=");
  L.push(`ДатаНачала=${ddmmyyyy(opts.from)}`);
  L.push(`ДатаКонца=${ddmmyyyy(opts.to)}`);
  L.push(`РасчСчет=${opts.self.accountNumber}`);
  L.push("СекцияРасчСчет");
  L.push(`ДатаНачала=${ddmmyyyy(opts.from)}`);
  L.push(`ДатаКонца=${ddmmyyyy(opts.to)}`);
  L.push(`РасчСчет=${opts.self.accountNumber}`);
  L.push("КонецРасчСчет");

  for (const r of rows) {
    const incoming = r.direction === "in";
    const payerAcc = incoming ? (r.counterpartyAccount ?? "") : opts.self.accountNumber;
    const payerName = incoming ? (r.counterpartyName ?? "") : opts.self.name;
    const payerInn = incoming ? (r.counterpartyInn ?? "") : opts.self.inn;
    const payerBic = incoming ? (r.counterpartyBankBic ?? "") : opts.self.bic;
    const recvAcc = incoming ? opts.self.accountNumber : (r.counterpartyAccount ?? "");
    const recvName = incoming ? opts.self.name : (r.counterpartyName ?? "");
    const recvInn = incoming ? opts.self.inn : (r.counterpartyInn ?? "");
    const recvBic = incoming ? opts.self.bic : (r.counterpartyBankBic ?? "");

    L.push("СекцияДокумент=Платежное поручение");
    L.push(`Номер=${r.documentNumber ?? ""}`);
    L.push(`Дата=${ddmmyyyy(r.date)}`);
    L.push(`Сумма=${r.amount.toFixed(2)}`);
    L.push(`ПлательщикСчет=${payerAcc}`);
    L.push(`Плательщик=${payerName}`);
    L.push(`ПлательщикИНН=${payerInn}`);
    L.push(`ПлательщикБИК=${payerBic}`);
    L.push(`ПолучательСчет=${recvAcc}`);
    L.push(`Получатель=${recvName}`);
    L.push(`ПолучательИНН=${recvInn}`);
    L.push(`ПолучательБИК=${recvBic}`);
    L.push(`НазначениеПлатежа=${r.purpose ?? ""}`);
    L.push("КонецДокумента");
  }

  L.push("КонецФайла");
  return L.join("\r\n");
}

/** 1C historically expects windows-1251. Encode the text to a cp1251 Buffer. */
export function build1cBuffer(rows: readonly ExportRow[], opts: OneCOptions): Buffer {
  return iconv.encode(build1cText(rows, opts), "win1251");
}
