import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { getPartnerDossier, PartnerError } from "@/lib/partners/repository";
import { getPartnerFinance, listPartnerMail } from "@/lib/partners/general";
import { getPartnerAnalytics } from "@/lib/partners/analytics";
import { PartnerTabs, resolvePartnerTab } from "@/components/partners/PartnerTabs";
import { GeneralInfoTab } from "@/components/partners/GeneralInfoTab";
import { ContractTab } from "@/components/partners/ContractTab";
import { HistoryTab } from "@/components/partners/HistoryTab";
import { AnalyticsTab } from "@/components/partners/AnalyticsTab";
import { DeletePartnerButton } from "@/components/partners/DeletePartnerButton";
import { RoleBadges } from "@/components/partners/RoleBadges";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}

function TabPlaceholder({ title }: { title: string }) {
  return (
    <div className="rounded-[var(--radius-md)] border border-dashed border-border bg-surface-1 px-4 py-10 text-center">
      <p className="text-sm text-text-secondary">{title}</p>
      <p className="mt-1 text-xs text-text-tertiary">Раздел появится в ближайшем обновлении.</p>
    </div>
  );
}

export default async function PartnerDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;

  let dossier;
  try {
    dossier = await getPartnerDossier(id);
  } catch (error: unknown) {
    if (error instanceof PartnerError && error.status === 404) notFound();
    throw error;
  }

  const { partner } = dossier;
  const activeTab = resolvePartnerTab(tabParam, partner.roles);
  const basePath = `/partners/${partner.id}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Link
          href="/partners"
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          К партнёрам
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
              {partner.name}
            </h1>
            <RoleBadges roles={partner.roles} />
            {partner.inn && (
              <p className="text-sm text-text-tertiary">
                ИНН <span className="font-mono tabular-nums text-text-secondary">{partner.inn}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/partners/${partner.id}/edit`}
              className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius-md)] bg-surface-3 px-3 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              <Pencil className="size-4" aria-hidden />
              Изменить
            </Link>
            <DeletePartnerButton id={partner.id} name={partner.name} />
          </div>
        </div>

        {partner.notes && (
          <p className="max-w-2xl whitespace-pre-wrap rounded-[var(--radius-md)] border border-border-subtle bg-surface-1 px-3 py-2.5 text-sm text-text-secondary">
            {partner.notes}
          </p>
        )}
      </div>

      <PartnerTabs basePath={basePath} active={activeTab} roles={partner.roles} />

      {activeTab === "general" && (
        <GeneralInfoTabLoader
          counterpartyId={partner.id}
          contacts={dossier.contacts}
          documents={dossier.documents}
        />
      )}
      {activeTab === "history" && <HistoryTab dossier={dossier} />}
      {activeTab === "contract" && (
        <ContractTab
          counterpartyId={partner.id}
          contracts={dossier.documents
            .filter((d) => d.kind === "contract")
            .map((d) => ({
              id: d.id,
              title: d.title,
              docRef: d.docRef,
              originalFilename: d.originalFilename,
              mimeType: d.mimeType,
            }))}
        />
      )}
      {activeTab === "analytics" && <AnalyticsTabLoader counterpartyId={partner.id} roles={partner.roles} />}
      {activeTab === "materials" && <TabPlaceholder title="Каталог щебня и паспорта" />}
    </div>
  );
}

// Loads the finance + mail surfaces only for the General tab (avoids the extra
// queries on other tabs). Server Component.
async function GeneralInfoTabLoader({
  counterpartyId,
  contacts,
  documents,
}: {
  counterpartyId: string;
  contacts: Awaited<ReturnType<typeof getPartnerDossier>>["contacts"];
  documents: Awaited<ReturnType<typeof getPartnerDossier>>["documents"];
}) {
  const [finance, mail] = await Promise.all([
    getPartnerFinance(counterpartyId),
    listPartnerMail(counterpartyId),
  ]);
  return (
    <GeneralInfoTab
      counterpartyId={counterpartyId}
      finance={finance}
      mail={mail}
      contacts={contacts}
      documents={documents}
    />
  );
}

// Loads shipment analytics only for the Analytics tab. Server Component.
async function AnalyticsTabLoader({
  counterpartyId,
  roles,
}: {
  counterpartyId: string;
  roles: string[];
}) {
  const analytics = await getPartnerAnalytics(counterpartyId, roles);
  return <AnalyticsTab analytics={analytics} roles={roles} />;
}
