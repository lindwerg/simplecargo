"use client";

import { FileText, ExternalLink } from "lucide-react";

import type { AttachmentMeta } from "@/lib/mail-intake/attachments-repo";

interface AttachmentChipsProps {
  documents: AttachmentMeta[];
  /** Fired when the operator opens any document (used to mark the email read). */
  onOpen?: () => void;
}

/** Pill links to the original files of an email (тело письма + вложения). Opens via
 *  the existing /api/ingested/attachments/[id] route. Over-cap files show as a
 *  non-clickable «(слишком большой)» chip. Shared by QuarantineList + EmailList. */
export function AttachmentChips({ documents, onOpen }: AttachmentChipsProps) {
  if (documents.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {documents.map((doc) =>
        doc.hasContent ? (
          <a
            key={doc.id}
            href={`/api/ingested/attachments/${doc.id}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onOpen}
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
  );
}
