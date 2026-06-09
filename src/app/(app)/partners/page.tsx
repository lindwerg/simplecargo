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

const PARTNER_TABS = new Set(["client", "carrier", "quarry", "other"]);

const EMPTY_COUNTS = { client: 0, carrier: 0, quarry: 0, other: 0 } as const;

const EMPTY_COPY: Record<string, { title: string; cta: string }> = {
  client: { title: "Клиентов пока нет", cta: "клиента" },
  carrier: { title: "Перевозчиков пока нет", cta: "перевозчика" },
  quarry: { title: "Карьеров пока нет", cta: "карьер" },
  other: { title: "Прочих партнёров пока нет", cta: "партнёра" },
};

interface PageProps {
  searchParams: Promise<{ search?: string; role?: string }>;
}

export default async function PartnersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = params.search?.trim() ?? "";
  // Four categories (Клиенты / Перевозчики / Карьеры / Прочие). Default to Клиенты.
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
      <header className="min-w-0">
        <p className="label-caps">База</p>
        <h1 className="mt-1 break-words text-xl font-semibold tracking-tight text-text">
          Партнёры
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          База контрагентов: клиенты, перевозчики и карьеры — с контактами, договорами и историей
          сделок. Одна компания может быть в нескольких категориях.
        </p>
      </header>

      <section aria-label="Действия" className="grid grid-cols-2 gap-3">
        <Link
          href="/partners/from-bank"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-secondary transition-colors group-hover:text-text">
            <Landmark className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Из банка</span>
            <span className="block text-xs text-text-tertiary">Контрагенты из выписки</span>
          </span>
        </Link>
        <Link
          href="/partners/new"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-quiet text-accent transition-transform group-hover:scale-105">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Добавить партнёра</span>
            <span className="block text-xs text-text-tertiary">Новая компания вручную</span>
          </span>
        </Link>
      </section>

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
