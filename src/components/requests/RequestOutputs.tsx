"use client";

// "Действия" card on the request detail page (Goal 5): copy a wagon-owner quote
// letter to the clipboard and open the A4 КП. Letter building is PURE (no DB), so
// buildOwnerLetterForRequest runs safely on the client.

import { useState } from "react";
import Link from "next/link";
import { Copy, Check, FileText, ChevronDown } from "lucide-react";

import { buildOwnerLetterForRequest, type OwnerLetterRoute } from "@/lib/documents/ownerLetter";

const COPIED_RESET_MS = 2000;

interface Props {
  id: string;
  clientName?: string | null;
  headerWagonType?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  notes?: string | null;
  routes: OwnerLetterRoute[];
}

export function RequestOutputs({
  id,
  clientName = null,
  headerWagonType = null,
  periodFrom = null,
  periodTo = null,
  notes = null,
  routes,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [showLetter, setShowLetter] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const letter = buildOwnerLetterForRequest({
    clientName,
    wagonTypeLabel: headerWagonType,
    periodFrom,
    periodTo,
    notes,
    routes,
  });

  async function copy() {
    setError(null);
    try {
      await navigator.clipboard.writeText(letter);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_RESET_MS);
    } catch {
      setError("Не удалось скопировать — выделите текст письма вручную.");
      setShowLetter(true);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-4">
      <h2 className="label-caps">Действия</h2>

      {error && (
        <p role="alert" className="rounded-[var(--radius-md)] border border-danger bg-danger-quiet px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse hover:bg-accent-hover md:h-9 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
          {copied ? "Скопировано ✓" : "Скопировать письмо собственнику"}
        </button>

        <Link
          href={`/requests/${id}/kp`}
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 text-sm text-text hover:bg-surface-3 md:h-9"
        >
          <FileText className="size-4" aria-hidden /> Открыть КП (А4)
        </Link>

        <button
          type="button"
          onClick={() => setShowLetter((v) => !v)}
          className="inline-flex h-11 items-center gap-1.5 px-2 text-sm text-text-tertiary hover:text-text md:h-9"
          aria-expanded={showLetter}
        >
          <ChevronDown className={`size-4 transition-transform ${showLetter ? "rotate-180" : ""}`} aria-hidden />
          показать письмо
        </button>
      </div>

      {showLetter && (
        <textarea
          readOnly
          value={letter}
          rows={14}
          className="w-full resize-y rounded-[var(--radius-md)] border border-border bg-surface-inset p-3 font-mono text-xs leading-relaxed text-text-secondary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        />
      )}
    </section>
  );
}
