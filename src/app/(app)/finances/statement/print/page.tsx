import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { COMPANY } from "@/lib/config/company";
import { formatRub } from "@/lib/format";
import { listAccounts, listTransactionsForExport } from "@/lib/finances/repository";
import { PrintButton } from "@/components/finances/PrintButton";

export const metadata = { title: "Выписка (печать)" };
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const INK = "#111";
const BORDER = "#999";

function dmy(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string; direction?: string; q?: string }>;
}

export default async function StatementPrintPage({ searchParams }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const sp = await searchParams;
  const from = DATE_RE.test(sp.from ?? "") ? sp.from! : new Date().toISOString().slice(0, 10);
  const to = DATE_RE.test(sp.to ?? "") ? sp.to! : new Date().toISOString().slice(0, 10);
  const direction = sp.direction === "in" || sp.direction === "out" ? sp.direction : undefined;

  const [rows, accounts] = await Promise.all([
    listTransactionsForExport({ from, to, ...(direction ? { direction } : {}), ...(sp.q ? { search: sp.q } : {}) }),
    listAccounts(),
  ]);
  const account = accounts[0];

  let totalIn = 0;
  let totalOut = 0;
  for (const r of rows) {
    if (r.direction === "in") totalIn += r.amount;
    else totalOut += r.amount;
  }

  const th: React.CSSProperties = { border: `1px solid ${BORDER}`, padding: "4px 6px", textAlign: "left", background: "#f0f0f0" };
  const td: React.CSSProperties = { border: `1px solid ${BORDER}`, padding: "4px 6px", verticalAlign: "top" };
  const num: React.CSSProperties = { ...td, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };

  return (
    <div style={{ background: "#fff", color: INK, fontFamily: "Arial, sans-serif", maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div className="no-print" style={{ marginBottom: 16 }}>
        <PrintButton />
      </div>

      <header style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Выписка по счёту</h1>
        <p style={{ fontSize: 12, margin: "4px 0 0" }}>
          {COMPANY.name} · ИНН {COMPANY.inn}
          {account?.maskedNumber ? ` · счёт ${account.maskedNumber}` : ""}
        </p>
        <p style={{ fontSize: 12, margin: "2px 0 0" }}>
          Период: {dmy(from)} — {dmy(to)} · по московскому времени
        </p>
      </header>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            <th style={th}>Дата</th>
            <th style={th}>Контрагент / ИНН</th>
            <th style={th}>Назначение</th>
            <th style={{ ...th, textAlign: "right" }}>Приход</th>
            <th style={{ ...th, textAlign: "right" }}>Расход</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ ...td, whiteSpace: "nowrap" }}>{dmy(r.date)}</td>
              <td style={td}>
                {r.counterpartyName ?? "—"}
                {r.counterpartyInn ? <span style={{ color: "#666" }}> · {r.counterpartyInn}</span> : null}
              </td>
              <td style={td}>{r.purpose ?? ""}</td>
              <td style={num}>{r.direction === "in" ? formatRub(r.amount) : ""}</td>
              <td style={num}>{r.direction === "out" ? formatRub(r.amount) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ fontWeight: 700 }}>
            <td style={td} colSpan={3}>
              Итого ({rows.length} операций)
            </td>
            <td style={num}>{formatRub(totalIn)}</td>
            <td style={num}>{formatRub(totalOut)}</td>
          </tr>
        </tfoot>
      </table>

      <p style={{ fontSize: 11, marginTop: 12 }}>
        Чистый поток за период: <b>{formatRub(totalIn - totalOut)}</b>
      </p>
    </div>
  );
}
