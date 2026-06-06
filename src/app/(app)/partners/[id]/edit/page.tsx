import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { getPartnerDossier, PartnerError } from "@/lib/partners/repository";
import { PartnerForm } from "@/components/partners/PartnerForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPartnerPage({ params }: PageProps) {
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
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link
          href={`/partners/${partner.id}`}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          К карточке
        </Link>
        <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
          Редактирование: {partner.name}
        </h1>
      </div>
      <PartnerForm
        initial={{
          id: partner.id,
          name: partner.name,
          roles: partner.roles,
          inn: partner.inn,
          notes: partner.notes,
        }}
      />
    </div>
  );
}
