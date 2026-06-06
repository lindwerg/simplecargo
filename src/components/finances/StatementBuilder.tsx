"use client";

import { useState } from "react";
import { FileText, FileSpreadsheet, FileDigit, Mail, Plus, Trash2 } from "lucide-react";

import { Money } from "@/components/ui/Money";
import { Button } from "@/components/ui/button";

interface AccountInfo {
  title: string | null;
  maskedNumber: string | null;
  balance: number | null;
}

interface StatementBuilderProps {
  account: AccountInfo | null;
  defaultEmail: string;
  emailEnabled: boolean;
}

const BLOCK = "rounded-xl bg-surface-2 p-4";
const LABEL = "block text-xs text-text-tertiary mb-1";
const INPUT =
  "w-full bg-transparent text-sm text-text outline-none placeholder:text-text-tertiary";

function daysAgoIso(days: number): string {
  const d = new Date(Date.now() + 3 * 3600_000 - days * 86_400_000);
  return d.toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Конструктор выписки в стиле Точки: период, счёт, контрагент, тип операций и
 * выгрузка в CSV/XLSX. Файл формируется из синхронизированных операций.
 */
export function StatementBuilder({ account, defaultEmail, emailEnabled }: StatementBuilderProps) {
  const [from, setFrom] = useState(daysAgoIso(7));
  const [to, setTo] = useState(todayIso());
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [q, setQ] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [recipients, setRecipients] = useState<string[]>([defaultEmail].filter(Boolean));
  const [emailFormat, setEmailFormat] = useState<"xlsx" | "csv" | "1c">("xlsx");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<string | null>(null);

  async function sendToEmail() {
    setEmailBusy(true);
    setEmailMsg(null);
    try {
      const res = await fetch("/api/finances/tochka/statement/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          direction: direction || undefined,
          q: q.trim() || undefined,
          format: emailFormat,
          recipients: recipients.map((r) => r.trim()).filter(Boolean),
        }),
      });
      const json: { success: boolean; error?: string; data?: { sent: number } } = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Ошибка отправки");
      setEmailMsg(`Отправлено на ${json.data?.sent ?? recipients.length} адрес(ов).`);
    } catch (e: unknown) {
      setEmailMsg(e instanceof Error ? e.message : "Не удалось отправить");
    } finally {
      setEmailBusy(false);
    }
  }

  function commonParams(): URLSearchParams {
    const params = new URLSearchParams({ from, to });
    if (direction) params.set("direction", direction);
    if (q.trim()) params.set("q", q.trim());
    return params;
  }

  function download(format: "csv" | "xlsx" | "1c") {
    const params = commonParams();
    params.set("format", format);
    window.location.assign(`/api/finances/tochka/statement/export?${params.toString()}`);
  }

  function openPdf() {
    window.open(`/finances/statement/print?${commonParams().toString()}`, "_blank");
  }

  return (
    <div className="space-y-3">
      <div className={BLOCK}>
        <label className={LABEL}>Выберите даты</label>
        <div className="flex items-center gap-2 text-sm text-text">
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={INPUT} />
          <span className="text-text-tertiary">—</span>
          <input type="date" value={to} min={from} max={todayIso()} onChange={(e) => setTo(e.target.value)} className={INPUT} />
        </div>
        <p className="mt-1 text-xs text-text-tertiary">По московскому времени</p>
      </div>

      {account && (
        <div className={`${BLOCK} flex items-center justify-between`}>
          <div>
            <p className="text-sm font-semibold text-text">
              <Money value={account.balance ?? 0} />
            </p>
            <p className="text-xs text-text-tertiary">
              {account.title ?? "Расчётный"}{account.maskedNumber ? ` · ${account.maskedNumber}` : ""}
            </p>
          </div>
          <span className="grid size-6 place-items-center rounded-full bg-accent text-xs text-accent-text">✓</span>
        </div>
      )}

      <div className={BLOCK}>
        <label className={LABEL} htmlFor="st-cp">Контрагент</label>
        <input
          id="st-cp"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по ИНН и названию"
          className={INPUT}
        />
        <p className="mt-1 text-xs text-text-tertiary">Оставьте пустым для выписки по всем</p>
      </div>

      <div className={BLOCK}>
        <label className={LABEL} htmlFor="st-type">Тип операций</label>
        <select
          id="st-type"
          value={direction}
          onChange={(e) => setDirection(e.target.value as "" | "in" | "out")}
          className={`${INPUT} cursor-pointer`}
        >
          <option value="">Все типы</option>
          <option value="in">Поступления</option>
          <option value="out">Списания</option>
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => download("xlsx")}
          className="inline-flex items-center gap-1.5 rounded-pill bg-accent px-4 py-2 text-sm font-medium text-accent-text transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <FileSpreadsheet className="size-4" aria-hidden /> XLSX
        </button>
        <button
          type="button"
          onClick={() => download("csv")}
          className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-4 py-2 text-sm font-medium text-text transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <FileDigit className="size-4" aria-hidden /> CSV
        </button>
        <button
          type="button"
          onClick={() => download("1c")}
          className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-4 py-2 text-sm font-medium text-text transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <FileDigit className="size-4" aria-hidden /> 1C
        </button>
        <button
          type="button"
          onClick={openPdf}
          className="inline-flex items-center gap-1.5 rounded-pill bg-surface-2 px-4 py-2 text-sm font-medium text-text transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <FileText className="size-4" aria-hidden /> PDF
        </button>
      </div>

      {emailEnabled && (
        <div className={BLOCK}>
          <label className="flex cursor-pointer items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-text">
              <Mail className="size-4" aria-hidden /> Отправить выписку на email
            </span>
            <input
              type="checkbox"
              checked={sendEmail}
              onChange={(e) => setSendEmail(e.target.checked)}
              className="size-5 accent-[var(--color-accent)]"
            />
          </label>

          {sendEmail && (
            <div className="mt-3 space-y-2">
              {recipients.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={r}
                    onChange={(e) =>
                      setRecipients((list) => list.map((x, j) => (j === i ? e.target.value : x)))
                    }
                    placeholder="name@company.ru"
                    className="flex-1 rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-text outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                  />
                  <button
                    type="button"
                    onClick={() => setRecipients((list) => list.filter((_, j) => j !== i))}
                    className="rounded-md p-2 text-text-tertiary hover:bg-surface-1 hover:text-danger"
                    aria-label="Удалить получателя"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setRecipients((list) => [...list, ""])}
                className="inline-flex items-center gap-1.5 text-sm text-accent-text hover:underline"
              >
                <Plus className="size-4" aria-hidden /> Добавить получателя
              </button>

              <div className="flex items-center gap-2 pt-1">
                <select
                  value={emailFormat}
                  onChange={(e) => setEmailFormat(e.target.value as "xlsx" | "csv" | "1c")}
                  className="rounded-md border border-border bg-surface-1 px-2 py-2 text-sm text-text"
                >
                  <option value="xlsx">XLSX</option>
                  <option value="csv">CSV</option>
                  <option value="1c">1C</option>
                </select>
                <Button type="button" size="sm" onClick={sendToEmail} disabled={emailBusy}>
                  <Mail aria-hidden /> {emailBusy ? "Отправка…" : "Отправить"}
                </Button>
              </div>
              {emailMsg && <p className="text-xs text-text-secondary">{emailMsg}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
