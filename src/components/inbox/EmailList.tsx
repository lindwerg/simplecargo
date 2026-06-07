"use client";

import { useState } from "react";
import { Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AttachmentChips } from "@/components/inbox/AttachmentChips";
import { KIND_CHIP } from "@/components/inbox/inbox-tabs";
import type { InboxItem } from "@/lib/mail-intake/inbox-repo";

interface EmailListProps {
  tab: string; // kind | "all" — the API tab param
  emptyText: string;
  initialItems: InboxItem[];
  initialCursor: string | null;
}

interface InboxApi {
  success: boolean;
  data?: { items: InboxItem[]; nextCursor: string | null };
  error?: string;
}

/** Список писем одной вкладки «Входящих». Первая страница приходит с сервера;
 *  «Показать ещё» догружает keyset-курсором. Открытие письма помечает прочитанным. */
export function EmailList({ tab, emptyText, initialItems, initialCursor }: EmailListProps) {
  const [items, setItems] = useState<InboxItem[]>(initialItems);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/inbox?tab=${encodeURIComponent(tab)}&cursor=${encodeURIComponent(cursor)}`);
      const json: InboxApi = await res.json();
      if (!res.ok || !json.success || !json.data) throw new Error(json.error ?? "Не удалось загрузить");
      setItems((prev) => [...prev, ...json.data!.items]);
      setCursor(json.data.nextCursor);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  function markRead(id: string) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, readAt: it.readAt ?? "opened" } : it)));
    // fire-and-forget; the badge корректируется на следующем router.refresh
    void fetch(`/api/inbox/${id}/read`, { method: "POST" }).catch(() => {});
  }

  if (items.length === 0) {
    return <p className="text-sm text-text-tertiary">{emptyText}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-danger">{error}</p>}
      <ul className="flex flex-col gap-2.5">
        {items.map((it) => {
          const unread = it.readAt == null;
          const chip = it.kind ? KIND_CHIP[it.kind] : undefined;
          const subject =
            it.subject && it.subject !== "email" && it.subject !== it.messageId ? it.subject : "(без темы)";
          return (
            <li
              key={it.id}
              className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 py-3"
            >
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  {unread && (
                    <span className="size-2 shrink-0 rounded-full bg-accent" aria-label="новое" title="Новое" />
                  )}
                  {/* На вкладке «Все» чип-тип помогает различать; на одно-типной — лишний. */}
                  {tab === "all" && chip && (
                    <span className={`rounded-pill px-2 py-0.5 text-2xs font-medium ${chip.cls}`}>
                      {chip.label}
                    </span>
                  )}
                  <span
                    className={`flex min-w-0 items-center gap-1.5 text-sm ${unread ? "font-semibold text-text" : "text-text"}`}
                  >
                    <Mail className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
                    <span className="truncate" title={subject}>
                      {subject}
                    </span>
                  </span>
                </div>

                <span className="pl-[1.375rem] text-xs text-text-tertiary">
                  {it.senderEmail ?? "отправитель неизвестен"}
                  {it.receivedAt && (
                    <>
                      {" · "}
                      <time dateTime={it.receivedAt}>{new Date(it.receivedAt).toLocaleString("ru-RU")}</time>
                    </>
                  )}
                </span>

                {it.documents.length > 0 && (
                  <div className="pl-[1.375rem]">
                    <AttachmentChips documents={it.documents} onOpen={() => markRead(it.id)} />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {cursor && (
        <div className="flex justify-center pt-1">
          <Button type="button" size="sm" variant="ghost" disabled={loading} onClick={loadMore}>
            {loading ? "Загружаю…" : "Показать ещё"}
          </Button>
        </div>
      )}
    </div>
  );
}
