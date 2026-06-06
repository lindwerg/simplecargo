import { FileText, ExternalLink } from "lucide-react";

import { Money } from "@/components/ui/Money";
import type { InboundInvoiceRow } from "@/lib/finances/repository";

const STATUS_RU: Record<string, { label: string; cls: string }> = {
  pending: { label: "ожидает оплаты", cls: "bg-warn-quiet text-warn" },
  matched: { label: "сопоставлен", cls: "bg-accent-quiet text-accent" },
  paid: { label: "оплачен", cls: "bg-success-quiet text-success" },
  review: { label: "на проверку", cls: "bg-danger-quiet text-danger" },
};

interface InboundInvoicesProps {
  invoices: InboundInvoiceRow[];
}

/** «Счета из почты» — invoices the AI extracted from inbound mail, matched to
 *  Tochka payments when possible (MAIL_AI_INTEGRATION §6.4). Server Component. */
export function InboundInvoices({ invoices }: InboundInvoicesProps) {
  if (invoices.length === 0) {
    return (
      <p className="text-sm text-text-tertiary">
        Счетов из почты пока нет. Когда на ящик придёт счёт, ИИ распознает его и положит сюда.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {invoices.map((inv) => {
        const st = STATUS_RU[inv.status] ?? { label: inv.status, cls: "bg-surface-3 text-text-secondary" };
        return (
          <li
            key={inv.id}
            className="flex items-start justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-surface-2 px-3 py-2.5"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <FileText className="size-3.5 shrink-0 text-text-tertiary" aria-hidden />
                <span className="text-sm font-medium text-text">
                  {inv.counterpartyName ?? inv.counterpartyInn ?? "Поставщик не распознан"}
                </span>
                <span className={`rounded-pill px-2 py-0.5 text-2xs font-medium ${st.cls}`}>
                  {st.label}
                </span>
              </div>
              <div className="flex flex-wrap gap-x-3 text-xs text-text-tertiary">
                {inv.invoiceNumber && <span>№ {inv.invoiceNumber}</span>}
                {inv.invoiceDate && <span>{inv.invoiceDate}</span>}
                {inv.counterpartyInn && <span>ИНН {inv.counterpartyInn}</span>}
              </div>
              {inv.purposeRaw && (
                <p className="truncate text-xs text-text-secondary">{inv.purposeRaw}</p>
              )}
              {inv.documents.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                  {inv.documents
                    .filter((doc) => doc.hasContent)
                    .map((doc) => (
                      <a
                        key={doc.id}
                        href={`/api/ingested/attachments/${doc.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-pill border border-border bg-surface-1 px-2 py-0.5 text-2xs text-text transition-colors hover:bg-surface-3"
                        title={`Открыть: ${doc.filename}`}
                      >
                        <FileText className="size-3 shrink-0 text-text-tertiary" aria-hidden />
                        <span className="max-w-[12rem] truncate">
                          {doc.kind === "body" ? "Текст письма" : doc.filename}
                        </span>
                        <ExternalLink className="size-2.5 shrink-0 text-text-tertiary" aria-hidden />
                      </a>
                    ))}
                </div>
              )}
            </div>
            {inv.amountTotal != null && (
              <Money value={inv.amountTotal} className="shrink-0 text-sm" />
            )}
          </li>
        );
      })}
    </ul>
  );
}
