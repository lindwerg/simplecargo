import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Pencil } from "lucide-react";

import { getPartnerDossier, PartnerError } from "@/lib/partners/repository";
import { ContactsEditor } from "@/components/partners/ContactsEditor";
import { DocumentsPanel } from "@/components/partners/DocumentsPanel";
import { PartnerDossier } from "@/components/partners/PartnerDossier";
import { DeletePartnerButton } from "@/components/partners/DeletePartnerButton";
import { RoleBadges } from "@/components/partners/RoleBadges";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PartnerDetailPage({ params }: PageProps) {
  const { id } = await params;

  let dossier;
  try {
    dossier = await getPartnerDossier(id);
  } catch (error: unknown) {
    if (error instanceof PartnerError && error.status === 404) notFound();
    throw error;
  }

  const { partner } = dossier;

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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <ContactsEditor counterpartyId={partner.id} initialContacts={dossier.contacts} />
        <DocumentsPanel counterpartyId={partner.id} initialDocuments={dossier.documents} />
      </div>

      <PartnerDossier dossier={dossier} />
    </div>
  );
}
