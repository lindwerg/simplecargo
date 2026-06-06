"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, X, Mail, Paperclip, FileText, ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { QuarantineItem } from "@/lib/mail-intake/quarantine-repo";

// Operator-facing copy for each reason: WHAT it is + WHAT TO DO. The raw reason
// code / confidence / MIME stay out of the default view (they live under
// «Подробнее») — the operator needs a decision, not diagnostics.
const REASON_INFO: Record<string, { label: string; hint: string }> = {
  LOW_CONFIDENCE: {
    label: "ИИ не уверен в распознавании",
    hint: "Проверьте данные письма и подтвердите вручную.",
  },
  UNKNOWN_SENDER: {
    label: "Отправитель не в базе",
    hint: "Добавьте отправителя в «Партнёры», затем создайте запрос вручную.",
  },
  ROLE_KIND_CONFLICT: {
    label: "Роль отправителя не совпала с типом письма",
    hint: "Проверьте, кто прислал письмо и о чём оно.",
  },
  NO_LINES_EXTRACTED: {
    label: "Маршруты не распознаны",
    hint: "Откройте письмо в почте и занесите запрос вручную.",
  },
  CARRIER_QUOTE_MANUAL: {
    label: "Ответ перевозчика не привязался к запросу",
    hint: "ИИ не понял, к какому запросу относится ставка — привяжите вручную.",
  },
  UNSUPPORTED_ATTACHMENT: {
    label: "Вложение не читается",
    hint: "ИИ не умеет читать этот формат — откройте файл вручную.",
  },
  PROCESSING_ERROR: {
    label: "Сбой при обработке письма",
    hint: "Письмо упало во время разбора. Проверьте вручную и отметьте разобранным.",
  },
};

const FRIENDLY_MIME: Record<string, string> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word (.docx)",
  "application/msword": "Word (.doc)",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel (.xlsx)",
  "application/vnd.ms-excel": "Excel (.xls)",
  "application/pdf": "PDF",
  "text/plain": "текст",
};

function friendlyType(mime: string | null | undefined): string {
  if (!mime) return "файл";
  if (FRIENDLY_MIME[mime]) return FRIENDLY_MIME[mime];
  if (mime.startsWith("image/")) return "изображение";
  return "файл";
}

const SEVERITY_DOT: Record<string, string> = {
  ERROR: "bg-danger",
  WARNING: "bg-warn",
  INFO: "bg-accent",
};

interface QuarantineListProps {
  items: QuarantineItem[];
}

// A short, human one-liner about the attachment for UNSUPPORTED_ATTACHMENT cards.
function attachmentLine(draft: unknown): string | null {
  if (!draft || typeof draft !== "object") return null;
  const d = draft as Record<string, unknown>;
  if (typeof d.contentType !== "string" && typeof d.filename !== "string") return null;
  const name = typeof d.filename === "string" ? d.filename : "вложение";
  return `${name} — ${friendlyType(typeof d.contentType === "string" ? d.contentType : null)}`;
}

// Carrier-quote cards: surface the rate only when the AI actually found one.
function quoteLine(draft: unknown): string | null {
  if (!draft || typeof draft !== "object") return null;
  const q = (draft as Record<string, unknown>).quote;
  if (!q || typeof q !== "object") return null;
  const cost = (q as Record<string, unknown>).costPerWagon;
  return typeof cost === "number" ? `Названа ставка: ${cost.toLocaleString("ru-RU")} ₽/ваг` : null;
}

/** «Входящие» — operator triage queue. Each card says, in plain Russian, WHAT
 *  email it is, WHY the AI couldn't file it, and WHAT TO DO. Client Component. */
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
      <ul className="flex flex-col gap-2.5">
        {items.map((it) => {
          const info = REASON_INFO[it.reasonCode] ?? {
            label: it.reasonCode,
            hint: "Проверьте письмо вручную.",
          };
          const dot = SEVERITY_DOT[it.severity] ?? "bg-text-tertiary";
          // The email subject (recorded as the ingested file's name) is the most
          // recognizable handle for the operator. Hide junk/messageId fallbacks.
          const subject =
            it.filename && it.filename !== "email" && it.filename !== it.messageId
              ? it.filename
              : null;
          const detail = quoteLine(it.draft) ?? attachmentLine(it.draft);

          return (
            <li
              key={it.id}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                {/* reason — what's wrong, plain language */}
                <div className="flex items-center gap-2">
                  <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
                  <span className="text-sm font-semibold text-text">{info.label}</span>
                </div>

                {/* which email — subject + sender + time */}
                <div className="flex min-w-0 flex-col gap-0.5 pl-4">
                  {subject && (
                    <span className="flex items-center gap-1.5 text-sm text-text">
                      <Mail className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
                      <span className="truncate" title={subject}>
                        {subject}
                      </span>
                    </span>
                  )}
                  <span className="text-xs text-text-tertiary">
                    {it.senderEmail ?? "отправитель неизвестен"}
                    {it.receivedAt && ` · ${new Date(it.receivedAt).toLocaleString("ru-RU")}`}
                  </span>
                  {detail && (
                    <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                      {detail.startsWith("Названа") ? null : (
                        <Paperclip className="size-3 shrink-0 text-text-tertiary" aria-hidden />
                      )}
                      {detail}
                    </span>
                  )}
                </div>

                {/* what to do — the actionable instruction */}
                <p className="pl-4 text-xs text-text-secondary">
                  <span className="font-medium text-text">Что делать: </span>
                  {info.hint}
                </p>

                {/* documents — open the actual files that arrived */}
                {it.documents.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pl-4">
                    {it.documents.map((doc) =>
                      doc.hasContent ? (
                        <a
                          key={doc.id}
                          href={`/api/ingested/attachments/${doc.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-1 px-2 py-0.5 text-2xs text-text transition-colors hover:bg-surface-3"
                          title={`Открыть: ${doc.filename}`}
                        >
                          <FileText className="size-3 shrink-0 text-text-tertiary" aria-hidden />
                          <span className="max-w-[14rem] truncate">
                            {doc.kind === "body" ? "Текст письма" : doc.filename}
                          </span>
                          <ExternalLink className="size-2.5 shrink-0 text-text-tertiary" aria-hidden />
                        </a>
                      ) : (
                        <span
                          key={doc.id}
                          className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-1 px-2 py-0.5 text-2xs text-text-tertiary"
                          title="Файл слишком большой — не сохранён"
                        >
                          <FileText className="size-3 shrink-0" aria-hidden />
                          <span className="max-w-[14rem] truncate">{doc.filename}</span>
                          <span>(слишком большой)</span>
                        </span>
                      ),
                    )}
                  </div>
                )}

                {/* diagnostics, tucked away for power users */}
                {it.agentReason && (
                  <details className="pl-4 text-xs text-text-tertiary">
                    <summary className="cursor-pointer select-none hover:text-text-secondary">
                      Подробнее
                    </summary>
                    <p className="mt-1 break-words">{it.agentReason}</p>
                  </details>
                )}
              </div>

              <div className="flex shrink-0 flex-col items-stretch gap-1.5 sm:flex-row">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === it.id}
                  onClick={() => resolve(it.id, "approved")}
                  title="Я разобрал это письмо вручную — убрать из очереди"
                >
                  <Check className="size-4" aria-hidden /> Разобрал
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busyId === it.id}
                  onClick={() => resolve(it.id, "rejected")}
                  title="Это не для нас — скрыть"
                >
                  <X className="size-4" aria-hidden /> Не наше
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
