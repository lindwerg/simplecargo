import Link from "next/link";
import { ChevronRight, FileText, Phone, Route as RouteIcon, Inbox } from "lucide-react";

import type { PartnerListItem } from "@/lib/partners/repository";
import { cn } from "@/lib/utils";
import { RoleBadges } from "./RoleBadges";

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-text-secondary" title={label}>
      {icon}
      <span className="font-mono tabular-nums text-text">{value}</span>
    </span>
  );
}

/**
 * Company row in the directory list — a neat strip. Whole strip links to the dossier.
 * The left rail is tinted by the active filter category (`railRole`).
 */
export function PartnerCard({
  partner,
  railRole = "client",
}: {
  partner: PartnerListItem;
  /** active filter tab — drives the left rail color */
  railRole?: string;
}) {
  return (
    <Link
      href={`/partners/${partner.id}`}
      className={cn("partner-strip", `partner-strip--${railRole}`)}
    >
      <div className="partner-strip__main">
        <h2 className="partner-strip__name" style={{ fontWeight: "var(--weight-semibold)" }}>
          {partner.name}
        </h2>
        <div className="partner-strip__meta">
          <RoleBadges roles={partner.roles} />
          {partner.inn && (
            <span className="text-xs text-text-tertiary">
              ИНН <span className="font-mono tabular-nums text-text-secondary">{partner.inn}</span>
            </span>
          )}
        </div>
      </div>

      <div className="partner-strip__metrics text-xs">
        <Metric icon={<Phone className="size-3.5" aria-hidden />} value={partner.contactsCount} label="Контакты" />
        <Metric icon={<FileText className="size-3.5" aria-hidden />} value={partner.documentsCount} label="Документы" />
        <Metric icon={<RouteIcon className="size-3.5" aria-hidden />} value={partner.directionsCount} label="Направления" />
        <Metric icon={<Inbox className="size-3.5" aria-hidden />} value={partner.requestsCount} label="Запросы" />
      </div>

      <ChevronRight className="partner-strip__chevron size-4 text-text-tertiary" aria-hidden />
    </Link>
  );
}
