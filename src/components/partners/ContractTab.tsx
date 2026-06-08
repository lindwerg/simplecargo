"use client";

import { useRef, useState } from "react";
import { Bot, FileText, ScrollText, Send, Sparkles, User } from "lucide-react";

import { Banner } from "./form-primitives";

interface ContractDoc {
  id: string;
  title: string;
  docRef: string | null;
  originalFilename: string;
  mimeType: string;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface ContractTabProps {
  counterpartyId: string;
  contracts: ContractDoc[];
}

const SUGGESTIONS = [
  "Какие сроки оплаты по договору?",
  "Есть ли штрафы и пени? За что?",
  "Какая ответственность сторон за простой вагонов?",
  "Как и за сколько дней можно расторгнуть договор?",
];

/** «Договор»: выбор загруженного договора + ИИ-чат по его тексту (Gemini читает PDF). */
export function ContractTab({ counterpartyId, contracts }: ContractTabProps) {
  const [activeId, setActiveId] = useState<string | null>(contracts[0]?.id ?? null);
  const [turns, setTurns] = useState<Record<string, ChatTurn[]>>({});
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const active = contracts.find((c) => c.id === activeId) ?? null;
  const history = activeId ? turns[activeId] ?? [] : [];

  async function ask(question: string) {
    if (!activeId || busy) return;
    const q = question.trim();
    if (q.length === 0) return;
    setError(null);
    setBusy(true);
    const prior = turns[activeId] ?? [];
    const next = [...prior, { role: "user" as const, content: q }];
    setTurns((t) => ({ ...t, [activeId]: next }));
    setDraft("");
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));

    try {
      const resp = await fetch(`/api/partners/${counterpartyId}/contract-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: activeId, question: q, history: prior }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось получить ответ");
      setTurns((t) => ({
        ...t,
        [activeId]: [...next, { role: "assistant", content: json.data.answer as string }],
      }));
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось получить ответ");
      setTurns((t) => ({ ...t, [activeId]: prior })); // откатываем неотвеченный вопрос
    } finally {
      setBusy(false);
    }
  }

  if (contracts.length === 0) {
    return (
      <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface-1 px-4 py-10 text-center">
        <ScrollText className="mx-auto size-6 text-text-tertiary" aria-hidden />
        <p className="mt-2 text-sm text-text-secondary">Договор ещё не загружен.</p>
        <p className="mt-1 text-xs text-text-tertiary">
          Загрузите договор (PDF) на вкладке «Общая информация» → «Документы», тип «Договор».
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="flex flex-col gap-2">
        <h2 className="label-caps">Договоры</h2>
        <ul className="flex flex-col gap-2">
          {contracts.map((c) => {
            const isActive = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setActiveId(c.id)}
                  className={`flex w-full items-center gap-2.5 rounded-[var(--radius-md)] border px-3 py-2.5 text-left transition-colors ${
                    isActive
                      ? "border-accent/40 bg-accent-quiet"
                      : "border-border bg-surface-2 hover:bg-surface-3"
                  }`}
                >
                  <FileText className="size-4 shrink-0 text-text-tertiary" aria-hidden />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-text">{c.title}</span>
                    {c.docRef && <span className="truncate text-xs text-text-tertiary">{c.docRef}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {active && (
          <a
            href={`/api/documents/${active.id}`}
            className="mt-1 inline-flex items-center gap-1.5 text-xs text-text-secondary transition-colors hover:text-text"
          >
            <FileText className="size-3.5" aria-hidden />
            Открыть файл
          </a>
        )}
      </aside>

      <section className="flex min-h-[420px] flex-col rounded-[var(--radius-lg)] border border-border bg-surface-1">
        <header className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Sparkles className="size-4 text-accent" aria-hidden />
          <h2 className="text-sm text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
            Вопрос по договору
          </h2>
          <span className="ml-auto text-2xs text-text-tertiary">ИИ читает PDF договора</span>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {history.length === 0 ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-text-secondary">
                Задайте вопрос по договору — ИИ ответит по его тексту. Например:
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={busy}
                    onClick={() => ask(s)}
                    className="rounded-pill border border-border bg-surface-2 px-3 py-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-3 hover:text-text disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ul className="flex flex-col gap-4">
              {history.map((turn, i) => (
                <li key={i} className="flex gap-2.5">
                  <span
                    className={`grid size-7 shrink-0 place-items-center rounded-full ${
                      turn.role === "user" ? "bg-surface-3 text-text-secondary" : "bg-accent-quiet text-accent"
                    }`}
                  >
                    {turn.role === "user" ? (
                      <User className="size-3.5" aria-hidden />
                    ) : (
                      <Bot className="size-3.5" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 whitespace-pre-wrap rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-sm text-text">
                    {turn.content}
                  </div>
                </li>
              ))}
              {busy && (
                <li className="flex gap-2.5">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-quiet text-accent">
                    <Bot className="size-3.5" aria-hidden />
                  </span>
                  <div className="rounded-[var(--radius-md)] bg-surface-2 px-3 py-2 text-sm text-text-tertiary">
                    Читаю договор…
                  </div>
                </li>
              )}
            </ul>
          )}
        </div>

        {error && (
          <div className="px-4 pb-2">
            <Banner tone="danger">{error}</Banner>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(draft);
          }}
          className="flex items-center gap-2 border-t border-border p-3"
        >
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Спросите что-нибудь по договору…"
            disabled={busy}
            className="h-10 flex-1 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={busy || draft.trim().length === 0}
            aria-label="Отправить"
            className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-md)] bg-accent text-text-inverse transition-colors hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </form>
      </section>
    </div>
  );
}
