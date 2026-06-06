"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Mail, AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { QuarantineItem } from "@/lib/mail-intake/quarantine-repo";

const REASON_RU: Record<string, string> = {
  LOW_CONFIDENCE: "Низкая уверенность ИИ",
  UNKNOWN_SENDER: "Неизвестный отправитель",
  ROLE_KIND_CONFLICT: "Роль отправителя не совпала",
  NO_LINES_EXTRACTED: "Не извлеклись строки маршрутов",
  CARRIER_QUOTE_MANUAL: "Ответ перевозчика без привязки",
  UNSUPPORTED_ATTACHMENT: "Вложение не распознано",
  PROCESSING_ERROR: "Сбой при обработке письма",
};

const SEVERITY_CLS: Record<string, string> = {
  ERROR: "bg-danger-quiet text-danger",
  WARNING: "bg-warn-quiet text-warn",
  INFO: "bg-accent-quiet text-accent",
};

interface QuarantineListProps {
  items: QuarantineItem[];
}

function draftSummary(draft: unknown): string | null {
  if (!draft || typeof draft !== "object") return null;
  const d = draft as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof d.subject === "string") parts.push(d.subject);
  if (typeof d.from === "string") parts.push(d.from);
  if (d.quote && typeof d.quote === "object") {
    const q = d.quote as Record<string, unknown>;
    if (q.costPerWagon != null) parts.push(`ставка ${String(q.costPerWagon)} ₽/ваг`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** «Входящие» — operator triage queue for everything the AI couldn't auto-file.
 *  Each card can be approved (handled) or rejected (dismissed). Client Component. */
export function QuarantineList({ items }: QuarantineListProps) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resolve(id: number, action: "approved" | "rejected") {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/quarantine/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json: { success: boolean; error?: string } = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Не удалось обработать");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusyId(null);
    }
  }

  if (items.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">
        Очередь пуста — всё, что прислали на почту, ИИ разобрал сам. Сюда попадают только
        письма, которые нужно проверить руками.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="flex flex-col gap-2">
        {items.map((it) => {
          const sevCls = SEVERITY_CLS[it.severity] ?? "bg-surface-3 text-text-secondary";
          const summary = draftSummary(it.draft);
          return (
            <li
              key={it.id}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  {it.severity === "ERROR" ? (
                    <AlertTriangle className="size-3.5 shrink-0 text-danger" aria-hidden />
                  ) : (
                    <Mail className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
                  )}
                  <span className="text-sm font-medium text-text">
                    {REASON_RU[it.reasonCode] ?? it.reasonCode}
                  </span>
                  <span className={`rounded-pill px-2 py-0.5 text-2xs font-medium ${sevCls}`}>
                    {it.severity}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 text-xs text-text-tertiary">
                  {it.senderEmail && <span>{it.senderEmail}</span>}
                  {it.receivedAt && (
                    <span>{new Date(it.receivedAt).toLocaleString("ru-RU")}</span>
                  )}
                </div>
                {it.agentReason && (
                  <p className="text-xs text-text-secondary">{it.agentReason}</p>
                )}
                {summary && <p className="truncate text-xs text-text-tertiary">{summary}</p>}
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === it.id}
                  onClick={() => resolve(it.id, "approved")}
                  title="Обработано вручную — убрать из очереди"
                >
                  <Check className="size-4" aria-hidden /> Готово
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busyId === it.id}
                  onClick={() => resolve(it.id, "rejected")}
                  title="Отклонить — это не для нас"
                >
                  <X className="size-4" aria-hidden />
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
