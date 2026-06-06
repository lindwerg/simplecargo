"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { PARTNER_ROLES, ROLE_LABELS_RU, type PartnerRole } from "@/lib/partners/schema";
import { cn } from "@/lib/utils";
import { Banner, Field, inputClass, textareaClass } from "./form-primitives";

export interface PartnerFormInitial {
  id: string;
  name: string;
  roles: string[];
  inn: string | null;
  notes: string | null;
}

interface PartnerFormProps {
  /** Present → edit mode (PATCH). Absent → create mode (POST). */
  initial?: PartnerFormInitial;
}

export function PartnerForm({ initial }: PartnerFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initial);

  const [name, setName] = useState(initial?.name ?? "");
  const [roles, setRoles] = useState<Set<string>>(new Set(initial?.roles ?? ["client"]));
  const [inn, setInn] = useState(initial?.inn ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleRole(role: PartnerRole) {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length === 0) {
      setError("Укажите название компании");
      return;
    }
    if (roles.size === 0) {
      setError("Выберите хотя бы одну роль");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        roles: Array.from(roles),
        inn: inn.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      const resp = await fetch(isEdit ? `/api/partners/${initial!.id}` : "/api/partners", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) {
        throw new Error(json?.error ?? "Не удалось сохранить");
      }
      const id = isEdit ? initial!.id : json.data.id;
      router.push(`/partners/${id}`);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось сохранить");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-5">
      {error && <Banner tone="danger">{error}</Banner>}

      <Field label="Название компании">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ООО «Ураласбест»"
          autoFocus
          className={inputClass}
        />
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="label-caps mb-1">Роли</legend>
        <div className="flex flex-wrap gap-2">
          {PARTNER_ROLES.map((r) => {
            const on = roles.has(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRole(r)}
                aria-pressed={on}
                className={cn(
                  "inline-flex h-9 items-center rounded-pill border px-3 text-sm transition-colors focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
                  on
                    ? "border-accent bg-accent-quiet text-accent"
                    : "border-border bg-surface-inset text-text-secondary hover:text-text",
                )}
              >
                {ROLE_LABELS_RU[r]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="ИНН">
          <input
            type="text"
            inputMode="numeric"
            value={inn}
            onChange={(e) => setInn(e.target.value)}
            placeholder="необязательно"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Заметки">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Чем занимается, особенности работы, история…"
          className={textareaClass}
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-5 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50"
        >
          {saving ? "Сохранение…" : isEdit ? "Сохранить" : "Создать партнёра"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-10 items-center px-4 text-sm text-text-secondary transition-colors hover:text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
