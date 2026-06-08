"use client";

import { useState } from "react";
import { Link2, Mail, Plus, Trash2, X } from "lucide-react";

import { Banner, inputClass } from "../form-primitives";

interface BoundEmail {
  email: string;
  fromNamedContact: boolean;
  lettersCount: number;
  lastLetterAt: string | null;
}

interface Letter {
  id: string;
  subject: string;
  senderEmail: string | null;
  kind: string | null;
  receivedAt: string | null;
  bodyPreview: string | null;
}

interface EmailBindingPanelProps {
  counterpartyId: string;
  initialEmails: BoundEmail[];
  initialLetters: Letter[];
}

// Mirrors the «Входящие» tab labels so a letter's type reads the same everywhere.
const KIND_LABEL: Record<string, string> = {
  client_rfq: "Запрос",
  carrier_quote: "Ответ",
  invoice: "Счёт",
  dislocation: "Дислокация",
  gu12: "ГУ-12",
  document: "Документ",
  claim: "Претензия",
  other: "Прочее",
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
}

export function EmailBindingPanel({
  counterpartyId,
  initialEmails,
  initialLetters,
}: EmailBindingPanelProps) {
  const [emails, setEmails] = useState<BoundEmail[]>(initialEmails);
  const [letters, setLetters] = useState<Letter[]>(initialLetters);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const resp = await fetch(`/api/partners/${counterpartyId}/emails`);
    const json = await resp.json();
    if (resp.ok && json?.success) {
      setEmails(json.data.boundEmails as BoundEmail[]);
      setLetters(json.data.letters as Letter[]);
    }
  }

  async function bind(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const email = draft.trim().toLowerCase();
    if (!email.includes("@")) {
      setError("Введите корректный адрес почты");
      return;
    }
    setBusy(true);
    try {
      const resp = await fetch(`/api/partners/${counterpartyId}/emails`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось привязать");
      await refresh();
      setDraft("");
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось привязать");
    } finally {
      setBusy(false);
    }
  }

  async function unbind(email: string) {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch(`/api/partners/${counterpartyId}/emails`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось отвязать");
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось отвязать");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Mail className="size-4 text-text-tertiary" aria-hidden />
          <h2 className="text-md text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
            Почта
          </h2>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-surface-3 px-3 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <Plus className="size-4" aria-hidden />
            Привязать почту
          </button>
        )}
      </div>

      <p className="text-xs text-text-tertiary">
        Привязанные адреса определяют контрагента по входящим письмам. Платежи привязываются
        отдельно — автоматически по ИНН.
      </p>

      {error && <Banner tone="danger">{error}</Banner>}

      {open && (
        <form
          onSubmit={bind}
          className="flex flex-col gap-2 rounded-[var(--radius-md)] border border-border bg-surface-1 p-3 sm:flex-row sm:items-center"
        >
          <input
            type="email"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="client@example.ru"
            autoFocus
            className={inputClass}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50"
            >
              <Link2 className="size-4" aria-hidden />
              {busy ? "…" : "Привязать"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft("");
                setOpen(false);
                setError(null);
              }}
              className="inline-flex h-9 items-center gap-1.5 px-3 text-sm text-text-secondary transition-colors hover:text-text"
            >
              <X className="size-4" aria-hidden />
              Отмена
            </button>
          </div>
        </form>
      )}

      {emails.length === 0 && !open ? (
        <p className="text-sm text-text-tertiary">Почта пока не привязана.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {emails.map((m) => (
            <li
              key={m.email}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-sm text-text">{m.email}</span>
                <span className="text-xs text-text-tertiary">
                  {m.fromNamedContact ? "из контакта" : "привязан вручную"}
                  {m.lettersCount > 0 && ` · ${m.lettersCount} писем`}
                  {m.lastLetterAt && ` · ${formatDate(m.lastLetterAt)}`}
                </span>
              </div>
              {m.fromNamedContact ? (
                <span className="shrink-0 text-2xs text-text-tertiary">в «Контактах»</span>
              ) : (
                <button
                  type="button"
                  aria-label="Отвязать"
                  disabled={busy}
                  onClick={() => unbind(m.email)}
                  className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-danger-quiet hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {letters.length > 0 && (
        <div className="mt-1 flex flex-col gap-2">
          <h3 className="label-caps">Последние письма</h3>
          <ul className="flex flex-col gap-2">
            {letters.map((l) => (
              <li key={l.id}>
                <a
                  href={`/inbox/${l.id}`}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-1 px-3 py-2.5 transition-colors hover:bg-surface-2"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-sm text-text">{l.subject}</span>
                    <span className="truncate text-xs text-text-tertiary">
                      {l.senderEmail}
                      {l.bodyPreview ? ` · ${l.bodyPreview}` : ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-0.5">
                    {l.kind && (
                      <span className="rounded-pill bg-surface-3 px-2 py-0.5 text-2xs font-medium text-text-secondary">
                        {KIND_LABEL[l.kind] ?? l.kind}
                      </span>
                    )}
                    <span className="text-2xs text-text-tertiary">{formatDate(l.receivedAt)}</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
