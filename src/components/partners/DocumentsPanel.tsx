"use client";

import { useRef, useState } from "react";
import { Download, FileText, Plus, Trash2, Upload, X } from "lucide-react";

import { DOCUMENT_KIND_LABELS_RU, DOCUMENT_KINDS, type DocumentKind } from "@/lib/partners/schema";
import { Banner, Field, inputClass } from "./form-primitives";

interface DocItem {
  id: string;
  kind: string;
  title: string;
  docRef: string | null;
  docDate: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

interface DocumentsPanelProps {
  counterpartyId: string;
  initialDocuments: Array<{
    id: string;
    kind: string;
    title: string;
    docRef: string | null;
    docDate: string | Date | null;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    createdAt: string | Date;
  }>;
}

function toIso(v: string | Date | null): string | null {
  if (v === null) return null;
  return typeof v === "string" ? v : v.toISOString();
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("ru-RU");
}

const KIND_CLASS: Record<string, string> = {
  contract: "bg-success-quiet text-success",
  request: "bg-info-quiet text-info",
  other: "bg-surface-3 text-text-secondary",
};

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx";

export function DocumentsPanel({ counterpartyId, initialDocuments }: DocumentsPanelProps) {
  const [docs, setDocs] = useState<DocItem[]>(
    initialDocuments.map((d) => ({ ...d, docDate: toIso(d.docDate), createdAt: toIso(d.createdAt)! })),
  );
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DocumentKind>("contract");
  const [title, setTitle] = useState("");
  const [docRef, setDocRef] = useState("");
  const [docDate, setDocDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const resp = await fetch(`/api/partners/${counterpartyId}/documents`);
    const json = await resp.json();
    if (resp.ok && json?.success) {
      setDocs(
        (json.data as DocItem[]).map((d) => ({ ...d, docDate: toIso(d.docDate), createdAt: d.createdAt })),
      );
    }
  }

  function reset() {
    setKind("contract");
    setTitle("");
    setDocRef("");
    setDocDate("");
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!file) {
      setError("Выберите файл");
      return;
    }
    if (title.trim().length === 0) {
      setError("Укажите название документа");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("kind", kind);
      fd.set("title", title.trim());
      if (docRef.trim()) fd.set("docRef", docRef.trim());
      if (docDate) fd.set("docDate", docDate);
      const resp = await fetch(`/api/partners/${counterpartyId}/documents`, {
        method: "POST",
        body: fd,
      });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось загрузить");
      await refresh();
      reset();
      setOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setError(null);
    setBusy(true);
    try {
      const resp = await fetch(`/api/documents/${id}`, { method: "DELETE" });
      const json = await resp.json();
      if (!resp.ok || !json?.success) throw new Error(json?.error ?? "Не удалось удалить");
      setDocs((prev) => prev.filter((d) => d.id !== id));
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
          Документы
        </h2>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-surface-3 px-3 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <Plus className="size-4" aria-hidden />
            Загрузить
          </button>
        )}
      </div>

      {error && <Banner tone="danger">{error}</Banner>}

      {open && (
        <form
          onSubmit={upload}
          className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-surface-1 p-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Тип">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as DocumentKind)}
                className={inputClass}
              >
                {DOCUMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {DOCUMENT_KIND_LABELS_RU[k]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Название">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Договор ТЭО / Заявка №…"
                className={inputClass}
              />
            </Field>
            <Field label="Номер">
              <input
                type="text"
                value={docRef}
                onChange={(e) => setDocRef(e.target.value)}
                placeholder="№2 от 11.11.2025"
                className={inputClass}
              />
            </Field>
            <Field label="Дата">
              <input
                type="date"
                value={docDate}
                onChange={(e) => setDocDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Файл (PDF, JPG, PNG, DOC/DOCX, XLS/XLSX — до 20 МБ)">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setFile(f);
                if (f && title.trim().length === 0) setTitle(f.name.replace(/\.[^.]+$/, ""));
              }}
              className="block w-full text-sm text-text-secondary file:mr-3 file:rounded-[var(--radius-sm)] file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-sm file:font-medium file:text-text hover:file:bg-surface-2"
            />
          </Field>
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:opacity-50"
            >
              <Upload className="size-4" aria-hidden />
              {busy ? "Загрузка…" : "Загрузить"}
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
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

      {docs.length === 0 && !open ? (
        <p className="text-sm text-text-tertiary">Документов пока нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <FileText className="size-5 shrink-0 text-text-tertiary" aria-hidden />
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-pill px-2 py-0.5 text-2xs font-medium ${KIND_CLASS[d.kind] ?? KIND_CLASS.other}`}
                    >
                      {DOCUMENT_KIND_LABELS_RU[d.kind as DocumentKind] ?? "Документ"}
                    </span>
                    <span className="truncate text-sm font-medium text-text">{d.title}</span>
                  </div>
                  <p className="truncate text-xs text-text-tertiary">
                    {d.docRef && <span>{d.docRef} · </span>}
                    {d.docDate && <span>{formatDate(d.docDate)} · </span>}
                    {formatBytes(d.sizeBytes)} · {d.originalFilename}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`/api/documents/${d.id}`}
                  aria-label="Скачать"
                  className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-surface-3 hover:text-text"
                >
                  <Download className="size-4" aria-hidden />
                </a>
                <button
                  type="button"
                  aria-label="Удалить"
                  disabled={busy}
                  onClick={() => remove(d.id)}
                  className="grid size-8 place-items-center rounded-[var(--radius-sm)] text-text-secondary transition-colors hover:bg-danger-quiet hover:text-danger disabled:opacity-50"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
