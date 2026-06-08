import Link from "next/link";
import { Building2, Landmark, Plus } from "lucide-react";

import { countPartnersByRole, listPartners } from "@/lib/partners/repository";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { PartnerCard } from "@/components/partners/PartnerCard";
import { PartnersFilters } from "@/components/partners/PartnersFilters";
import { PartnersTabs } from "@/components/partners/PartnersTabs";
import "@/components/partners/partners.css";

export const dynamic = "force-dynamic";

const PARTNER_TABS = new Set(["client", "carrier", "quarry"]);

const EMPTY_COUNTS = { client: 0, carrier: 0, quarry: 0 } as const;

const EMPTY_COPY: Record<string, { title: string; cta: string }> = {
  client: { title: "Клиентов пока нет", cta: "клиента" },
  carrier: { title: "Перевозчиков пока нет", cta: "перевозчика" },
  quarry: { title: "Карьеров пока нет", cta: "карьер" },
};

interface PageProps {
  searchParams: Promise<{ search?: string; role?: string }>;
}

export default async function PartnersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  // Three categories (Клиенты / Перевозчики / Карьеры). Default to Клиенты.
  const role = PARTNER_TABS.has(params.role?.trim() ?? "") ? (params.role as string).trim() : "client";
  const emptyCopy = EMPTY_COPY[role] ?? EMPTY_COPY.client;

  let partners: Awaited<ReturnType<typeof listPartners>> = [];
  let counts: Awaited<ReturnType<typeof countPartnersByRole>> = { ...EMPTY_COUNTS };
  let failed = false;
  try {
    [partners, counts] = await Promise.all([
      listPartners({ search, role }),
      countPartnersByRole({ search }),
    ]);
  } catch {
    failed = true;
  }

  return (
    <div className="partners-surface flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
            Партнёры
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            База контрагентов: клиенты, перевозчики и карьеры — с контактами, договорами и историей
            сделок. Одна компания может быть в нескольких категориях.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/partners/from-bank"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-surface-3 px-4 text-sm font-medium text-text transition-colors duration-[var(--duration-fast)] hover:bg-surface-2 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <Landmark className="size-4" aria-hidden strokeWidth={2.2} />
            Из банка
          </Link>
          <Link
            href="/partners/new"
            className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <Plus className="size-4" aria-hidden strokeWidth={2.2} />
            Добавить партнёра
          </Link>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        <PartnersTabs role={role} search={search} counts={counts} />
        <PartnersFilters search={search} role={role} />
      </div>

      {failed ? (
        <ErrorState variant="page" message="Не удалось загрузить партнёров. Попробуйте обновить страницу." />
      ) : partners.length === 0 ? (
        <EmptyState
          icon={Building2}
          title={search ? "Ничего не найдено" : emptyCopy.title}
          description={
            search
              ? "Измените запрос или сбросьте поиск."
              : `Добавьте ${emptyCopy.cta} кнопкой «Добавить партнёра».`
          }
        />
      ) : (
        <div className="partner-list">
          {partners.map((p) => (
            <PartnerCard key={p.id} partner={p} railRole={role} />
          ))}
        </div>
      )}
    </div>
  );
}
