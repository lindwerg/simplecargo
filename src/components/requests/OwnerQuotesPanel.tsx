"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Inbox, X } from "lucide-react";

import type { OwnerQuoteView } from "@/lib/rfq/quotes";

const RUB = new Intl.NumberFormat("ru-RU");

const STATUS_LABEL: Record<string, string> = {
  polled: "Опрошен, ждём ответ",
  responded: "Ответил",
  accepted: "Ставка принята",
  declined: "Отклонена",
  expired: "Срок истёк",
};

const STATUS_CLASS: Record<string, string> = {
  polled: "bg-surface-inset text-text-tertiary",
  responded: "bg-accent-quiet text-accent",
  accepted: "bg-success-quiet text-success",
  declined: "bg-danger-quiet text-danger",
  expired: "bg-warn-quiet text-warn",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" });
}

interface OwnerQuotesPanelProps {
  quotes: OwnerQuoteView[];
}

/** «Ставки перевозчиков» — результат опроса (request_owner_quotes) на карточке
 *  запроса: кто опрошен, когда, ответил ли, ставка ₽/ваг; принятие/отклонение
 *  responded-ряда. Перенос принятой ставки в строку запроса не делается —
 *  в request_lines нет поля закупки (см. src/lib/rfq/quotes.ts). */
export function OwnerQuotesPanel({ quotes }: OwnerQuotesPanelProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, action: "accept" | "decline") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/owner-quotes/${id}/decision`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Не удалось сохранить решение");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  if (quotes.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5">
      <div className="flex items-center gap-2">
        <Inbox className="size-4 text-accent" aria-hidden />
        <h2 className="label-caps">Ставки перевозчиков</h2>
        <span className="ml-auto text-2xs text-text-tertiary">{quotes.length} опрос(ов)</span>
      </div>

      {error && (
        <p className="rounded-[var(--radius-md)] bg-danger-quiet px-3 py-2 text-sm text-danger">{error}</p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wide text-text-tertiary">
              <th className="py-1.5 pr-3 font-medium">Перевозчик</th>
              <th className="py-1.5 pr-3 font-medium">Направление</th>
              <th className="py-1.5 pr-3 font-medium">Опрошен</th>
              <th className="py-1.5 pr-3 font-medium">Статус</th>
              <th className="py-1.5 pr-3 text-right font-medium">Ставка</th>
              <th className="py-1.5 pr-3 text-right font-medium">Ваг.</th>
              <th className="py-1.5 font-medium" aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {quotes.map((q) => (
              <tr key={q.id} className="border-t border-border align-middle">
                <td className="py-2 pr-3 text-text">{q.carrierName}</td>
                <td className="py-2 pr-3 text-text-secondary">{q.lineLabel}</td>
                <td className="py-2 pr-3 whitespace-nowrap text-text-tertiary">{fmtDate(q.polledAt)}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`inline-flex whitespace-nowrap rounded-pill px-2 py-0.5 text-2xs font-medium ${STATUS_CLASS[q.status] ?? "bg-surface-inset text-text-tertiary"}`}
                    title={q.respondedAt ? `Ответ: ${fmtDate(q.respondedAt)}` : undefined}
                  >
                    {STATUS_LABEL[q.status] ?? q.status}
                  </span>
                </td>
                <td className="py-2 pr-3 whitespace-nowrap text-right font-mono tabular-nums text-text">
                  {q.costPerWagon != null ? `${RUB.format(q.costPerWagon)} ₽/ваг` : "—"}
                </td>
                <td className="py-2 pr-3 text-right font-mono tabular-nums text-text-secondary">
                  {q.wagonsOffered ?? "—"}
                </td>
                <td className="py-2">
                  {q.status === "responded" && (
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        disabled={busyId === q.id}
                        onClick={() => decide(q.id, "accept")}
                        title="Принять ставку перевозчика"
                        className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] bg-accent px-2.5 text-xs font-semibold text-text-inverse hover:bg-accent-hover disabled:opacity-50"
                      >
                        <Check className="size-3.5" aria-hidden /> Принять
                      </button>
                      <button
                        type="button"
                        disabled={busyId === q.id}
                        onClick={() => decide(q.id, "decline")}
                        title="Отклонить ставку"
                        className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-md)] border border-border px-2.5 text-xs text-text-secondary hover:text-danger disabled:opacity-50"
                      >
                        <X className="size-3.5" aria-hidden /> Отклонить
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
