import Link from "next/link";
import { FileText, Phone, Route as RouteIcon, Inbox } from "lucide-react";

import type { PartnerListItem } from "@/lib/partners/repository";
import { cn } from "@/lib/utils";
import { primaryRole, RoleBadges } from "./RoleBadges";

function Metric({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-text-secondary" title={label}>
      {icon}
      <span className="font-mono tabular-nums text-text">{value}</span>
    </span>
  );
}

/** Company card in the directory grid. Whole card links to the dossier. */
export function PartnerCard({ partner }: { partner: PartnerListItem }) {
  return (
    <Link
      href={`/partners/${partner.id}`}
      className={cn("partner-card", `partner-card--${primaryRole(partner.roles)}`)}
    >
      <div className="flex flex-col gap-1.5">
        <h2 className="text-md leading-snug text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
          {partner.name}
        </h2>
        <RoleBadges roles={partner.roles} />
      </div>

      {partner.inn && (
        <p className="text-xs text-text-tertiary">
          ИНН <span className="font-mono tabular-nums text-text-secondary">{partner.inn}</span>
        </p>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3 text-xs">
        <Metric icon={<Phone className="size-3.5" aria-hidden />} value={partner.contactsCount} label="Контакты" />
        <Metric icon={<FileText className="size-3.5" aria-hidden />} value={partner.documentsCount} label="Документы" />
        <Metric icon={<RouteIcon className="size-3.5" aria-hidden />} value={partner.directionsCount} label="Направления" />
        <Metric icon={<Inbox className="size-3.5" aria-hidden />} value={partner.requestsCount} label="Запросы" />
      </div>
    </Link>
  );
}
