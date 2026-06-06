import Link from "next/link";
import { Building2, Plus } from "lucide-react";

import { listPartners } from "@/lib/partners/repository";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PartnerCard } from "@/components/partners/PartnerCard";
import { PartnersFilters } from "@/components/partners/PartnersFilters";
import "@/components/partners/partners.css";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ search?: string; role?: string }>;
}

export default async function PartnersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  const role = params.role?.trim() ?? "";

  let partners: Awaited<ReturnType<typeof listPartners>> = [];
  let failed = false;
  try {
    partners = await listPartners({ search, role });
  } catch {
    failed = true;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
            Партнёры
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            База контрагентов: клиенты, собственники подвижного состава и экспедиторы — с контактами,
            договорами и историей сделок.
          </p>
        </div>
        <Link
          href="/partners/new"
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <Plus className="size-4" aria-hidden strokeWidth={2.2} />
          Добавить партнёра
        </Link>
      </header>

      <PartnersFilters search={search} role={role} />

      {failed ? (
        <ErrorState variant="page" message="Не удалось загрузить партнёров. Попробуйте обновить страницу." />
      ) : partners.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search || role ? "Ничего не найдено" : "База партнёров пуста"}
          description={
            search || role
              ? "Измените запрос или сбросьте фильтр."
              : "Добавьте первую компанию кнопкой «Добавить партнёра» — клиента, собственника вагонов или экспедитора."
          }
        />
      ) : (
        <div className="partner-card-grid">
          {partners.map((p) => (
            <PartnerCard key={p.id} partner={p} />
          ))}
        </div>
      )}
    </div>
  );
}
