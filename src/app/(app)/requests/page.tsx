import Link from "next/link";
import { Archive, Plus, Radar, Sparkles } from "lucide-react";

import { getBoardCounts } from "@/lib/requests/repository";

export const dynamic = "force-dynamic";

interface EntryCardProps {
  href: string;
  rail: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  stat?: string;
  statLabel?: string;
}

function EntryCard({ href, rail, icon, title, subtitle, stat, statLabel }: EntryCardProps) {
  return (
    <Link
      href={href}
      className="group relative flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-5 transition-[transform,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[3px] focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
      style={{ boxShadow: "var(--elev-2)", borderLeft: `3px solid ${rail}` }}
    >
      <span className="flex size-11 items-center justify-center rounded-[var(--radius-md)] bg-surface-3 text-accent">
        {icon}
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="text-lg text-text" style={{ fontWeight: "var(--weight-semibold)" }}>
          {title}
        </h2>
        <p className="text-sm text-text-secondary">{subtitle}</p>
      </div>
      {stat !== undefined && (
        <div className="mt-auto flex items-baseline gap-2 border-t border-border-subtle pt-3">
          <span className="font-mono text-xl tabular-nums text-text">{stat}</span>
          <span className="text-xs text-text-tertiary">{statLabel}</span>
        </div>
      )}
    </Link>
  );
}

export default async function RequestsMenuPage() {
  let counts = { activeRequests: 0, activeWagons: 0, archiveRequests: 0 };
  try {
    counts = await getBoardCounts();
  } catch {
    // board counts are best-effort; the menu still renders at zero
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl text-text" style={{ fontWeight: "var(--weight-bold)" }}>
            Запросы
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Запросы клиентов на вагоны → карточки по направлениям. Загрузка плана, текста, фото или голоса —
            заполнит ИИ.
          </p>
        </div>
        <Link
          href="/requests/new"
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse transition-colors duration-[var(--duration-fast)] hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <Plus className="size-4" aria-hidden strokeWidth={2.2} />
          Новый запрос
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <EntryCard
          href="/requests/new"
          rail="var(--color-accent)"
          icon={<Sparkles className="size-5" aria-hidden strokeWidth={1.8} />}
          title="Создать запросы"
          subtitle="Загрузите план клиента (xlsx), вставьте текст, фото-скриншот или надиктуйте голосом — ИИ разложит на направления."
        />
        <EntryCard
          href="/requests/actual"
          rail="var(--color-warn)"
          icon={<Radar className="size-5" aria-hidden strokeWidth={1.8} />}
          title="Актуальные"
          subtitle="В работе: новые, опрос, котировка. Группировка по клиентам, станциям и дорогам."
          stat={String(counts.activeRequests)}
          statLabel={`в работе · ${counts.activeWagons} ваг`}
        />
        <EntryCard
          href="/requests/archive"
          rail="var(--color-border-strong)"
          icon={<Archive className="size-5" aria-hidden strokeWidth={1.8} />}
          title="Архив"
          subtitle="Завершённые: выигранные, проигранные, без ставки, отменённые."
          stat={String(counts.archiveRequests)}
          statLabel="в архиве"
        />
      </div>
    </div>
  );
}
