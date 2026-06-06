"use client";

import { useState } from "react";
import { Mail, Pencil, Phone, Plus, Star, Trash2, X } from "lucide-react";

import type { ContactRow } from "@/lib/partners/repository";
import { cn } from "@/lib/utils";
import { Banner, Field, inputClass, textareaClass } from "./form-primitives";
import { EmailAutosuggest } from "./EmailAutosuggest";

interface ContactsEditorProps {
  counterpartyId: string;
  initialContacts: ContactRow[];
}

interface Draft {
  fullName: string;
  position: string;
  phone: string;
  email: string;
  isPrimary: boolean;
  note: string;
}

const EMPTY: Draft = { fullName: "", position: "", phone: "", email: "", isPrimary: false, note: "" };

function toDraft(c: ContactRow): Draft {
  return {
    fullName: c.fullName ?? "",
    position: c.position ?? "",
    phone: c.phone ?? "",
    email: c.email ?? "",
    isPrimary: c.isPrimary,
    note: c.note ?? "",
  };
}

export function ContactsEditor({ counterpartyId, initialContacts }: ContactsEditorProps) {
  const [contacts, setContacts] = useState<ContactRow[]>(initialContacts);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const resp = await fetch(`/api/partners/${counterpartyId}/contacts`);
    const json = await resp.json();
    if (resp.ok && json?.success) setContacts(json.data as ContactRow[]);
  }

  async function save(draft: Draft, contactId?: string): Promise<boolean> {
    setError(null);
    if (!draft.fullName.trim() && !draft.phone.trim() && !draft.email.trim()) {
      setError("Заполните ФИО, телефон или e-mail");
      return false;
    }
    setBusy(true);
    try {
      const payload = {
        fullName: draft.fullName.trim() || undefined,
        position: draft.position.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        email: draft.email.trim() || undefined,
        isPrimary: draft.isPrimary,
        note: draft.note.trim() || undefined,
      };
      const url = contactId
        ? `/api/partners/${counterpartyId}/contacts/${contactId}`
        : `/api/partners/${counterpartyId}/contacts`;
      const resp = await fetch(url, {
        method: contactId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось сохранить");
      await refresh();
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function remove(contactId: string) {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch(`/api/partners/${counterpartyId}/contacts/${contactId}`, {
        method: "DELETE",
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось удалить");
      setContacts((prev) => prev.filter((c) => c.id !== contactId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-md text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
          Контакты
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setEditingId(null);
            }}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-surface-3 px-3 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <Plus className="size-4" aria-hidden />
            Добавить
          </button>
        )}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {adding && (
        <ContactForm
          busy={busy}
          onCancel={() => setAdding(false)}
          onSave={async (d) => {
            const ok = await save(d);
            if (ok) setAdding(false);
          }}
        />
      )}

      {contacts.length === 0 && !adding ? (
        <p className="text-sm text-text-tertiary">Контактов пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts.map((c) =>
            editingId === c.id ? (
              <li key={c.id}>
                <ContactForm
                  busy={busy}
                  initial={toDraft(c)}
                  onCancel={() => setEditingId(null)}
                  onSave={async (d) => {
                    const ok = await save(d, c.id);
                    if (ok) setEditingId(null);
                  }}
                />
              </li>
            ) : (
              <li
                key={c.id}
                className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-text">
                      {c.fullName ?? "Без имени"}
                    </span>
                    {c.position && <span className="text-xs text-text-tertiary">· {c.position}</span>}
                    {c.isPrimary && (
                      <span className="inline-flex items-center gap-1 rounded-pill bg-accent-quiet px-1.5 py-0.5 text-2xs font-medium text-accent">
                        <Star className="size-3" aria-hidden />
                        основной
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-text-secondary">
                    {c.phone && (
                      <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 hover:text-text">
                        <Phone className="size-3.5" aria-hidden />
                        {c.phone}
                      </a>
                    )}
                    {c.email && (
                      <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-text">
                        <Mail className="size-3.5" aria-hidden />
                        {c.email}
                      </a>
                    )}
                  </div>
                  {c.note && <p className="text-xs text-text-tertiary">{c.note}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label="Редактировать"
                    onClick={() => {
                      setEditingId(c.id);
                      setAdding(false);
                    }}
                    className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-surface-3 hover:text-text"
                  >
                    <Pencil className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Удалить"
                    disabled={busy}
                    onClick={() => remove(c.id)}
                    className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-danger-quiet hover:text-danger disabled:opacity-50"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}

function ContactForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial?: Draft;
  busy: boolean;
  onSave: (draft: Draft) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial ?? EMPTY);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-surface-1 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="ФИО">
          <input
            type="text"
            value={draft.fullName}
            onChange={(e) => set({ fullName: e.target.value })}
            placeholder="Иванов Иван"
            className={inputClass}
          />
        </Field>
        <Field label="Должность">
          <input
            type="text"
            value={draft.position}
            onChange={(e) => set({ position: e.target.value })}
            placeholder="Логист"
            className={inputClass}
          />
        </Field>
        <Field label="Телефон">
          <input
            type="tel"
            value={draft.phone}
            onChange={(e) => set({ phone: e.target.value })}
            placeholder="+7 900 000-00-00"
            className={inputClass}
          />
        </Field>
        <Field label="E-mail">
          <EmailAutosuggest
            value={draft.email}
            onChange={(email) => set({ email })}
            onPick={(s) => {
              if (!draft.fullName.trim() && s.displayName) set({ fullName: s.displayName });
            }}
          />
        </Field>
      </div>
      <Field label="Заметка">
        <textarea
          value={draft.note}
          onChange={(e) => set({ note: e.target.value })}
          rows={2}
          className={textareaClass}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input
          type="checkbox"
          checked={draft.isPrimary}
          onChange={(e) => set({ isPrimary: e.target.checked })}
          className="size-4 accent-[var(--color-accent)]"
        />
        Основной контакт
      </label>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave(draft)}
          className="inline-flex h-9 items-center rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50"
        >
          Сохранить
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 px-3 text-sm text-text-secondary transition-colors hover:text-text",
          )}
        >
          <X className="size-4" aria-hidden />
          Отмена
        </button>
      </div>
    </div>
  );
}
