import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Money } from "@/components/ui/Money";
import { StatTile } from "@/components/ui/StatTile";
import { StatusPill, type RequestStatus } from "@/components/ui/StatusPill";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonRow } from "@/components/ui/SkeletonRow";
import { ErrorState } from "@/components/ui/ErrorState";

// P0-7 smoke surface: proves the money formatter + core UI primitives render in both themes
// on the P0-6 token foundation. Replaced wholesale by P0-8 (funnel nav + login + dashboard).

const SURFACES = [
  { name: "bg", className: "bg-bg" },
  { name: "surface-1", className: "bg-surface-1" },
  { name: "surface-2", className: "bg-surface-2" },
  { name: "surface-3", className: "bg-surface-3" },
  { name: "surface-inset", className: "bg-surface-inset" },
] as const;

const STATUSES: RequestStatus[] = [
  "new",
  "sourcing",
  "quoted",
  "won",
  "lost",
  "expired",
  "cancelled",
];

// Mirrors a 4-col deal table: route · cargo · wagons · margin.
const TABLE_COLS = ["32%", "24%", 64, 96] as const;

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="label-caps mb-3">
      {children}
    </h2>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="label-caps">SimpleCargo · Design System</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">
            P0-7 — деньги + базовые примитивы
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Тёмная тема по умолчанию · светлая — равноправный peer
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section aria-labelledby="surfaces-heading" className="mb-10">
        <SectionHeading id="surfaces-heading">Surface ladder</SectionHeading>
        <div className="grid grid-cols-5 gap-2">
          {SURFACES.map((s) => (
            <div key={s.name} className="text-center">
              <div className={`${s.className} h-16 rounded-md border border-border`} />
              <p className="mt-1.5 text-xs text-text-tertiary">{s.name}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="stat-heading" className="mb-10">
        <SectionHeading id="stat-heading">StatTile — content-driven, left rail</SectionHeading>
        <div className="flex flex-wrap gap-3">
          <StatTile
            label="Заработано"
            value={<Money value={4815162} />}
            size="display"
            variant="accent"
          />
          <StatTile
            label="Маржа"
            value={<Money value={1240000} sign />}
            variant="positive"
          />
          <StatTile
            label="Убыток"
            value={<Money value={-86500} sign />}
            variant="negative"
          />
          <StatTile label="Вагонов" value="128" hint="в работе" href="#" />
        </div>
      </section>

      <section aria-labelledby="money-heading" className="mb-10">
        <SectionHeading id="money-heading">
          Money — Geist Mono · tabular · neutral, semantic on sign
        </SectionHeading>
        <table className="w-full rounded-md border border-border bg-surface-1">
          <tbody>
            <tr className="border-b border-border-subtle">
              <td className="px-4 py-2.5 text-sm text-text-secondary">Выручка (full)</td>
              <td className="px-4 py-2.5 text-right">
                <Money value={4815162} />
              </td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="px-4 py-2.5 text-sm text-text-secondary">Маржа + (sign)</td>
              <td className="px-4 py-2.5 text-right">
                <Money value={1240000} sign />
              </td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="px-4 py-2.5 text-sm text-text-secondary">Маржа − (sign)</td>
              <td className="px-4 py-2.5 text-right">
                <Money value={-86500} sign />
              </td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="px-4 py-2.5 text-sm text-text-secondary">Ставка (per-wagon)</td>
              <td className="px-4 py-2.5 text-right">
                <Money value={62500} form="per-wagon" vatRate={22} />
              </td>
            </tr>
            <tr>
              <td className="px-4 py-2.5 text-sm text-text-secondary">Собственник (short)</td>
              <td className="px-4 py-2.5 text-right">
                <Money value={1500000} form="short" vatTreatment="not_vat_payer" />
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section aria-labelledby="pill-heading" className="mb-10">
        <SectionHeading id="pill-heading">
          StatusPill — глиф ≠ цвет (won ◆ vs lost ✕), pulse на «опрос»
        </SectionHeading>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <StatusPill key={s} status={s} />
          ))}
        </div>
      </section>

      <section aria-labelledby="loading-heading" className="mb-10">
        <SectionHeading id="loading-heading">SkeletonRow — ширины колонок таблицы</SectionHeading>
        <div className="rounded-md border border-border bg-surface-1">
          <SkeletonRow columns={[...TABLE_COLS]} />
          <SkeletonRow columns={[...TABLE_COLS]} />
          <SkeletonRow columns={[...TABLE_COLS]} />
        </div>
      </section>

      <section aria-labelledby="error-heading" className="mb-10">
        <SectionHeading id="error-heading">ErrorState — inline + page (без стека)</SectionHeading>
        <div className="mb-4 overflow-hidden rounded-md border border-border bg-surface-1">
          <ErrorState
            variant="inline"
            message="Не удалось загрузить запросы. Проверьте соединение."
          />
        </div>
        <ErrorState
          variant="page"
          message="Сервис временно недоступен. Попробуйте обновить страницу."
        />
      </section>

      <section aria-labelledby="empty-heading" className="mb-10">
        <SectionHeading id="empty-heading">EmptyState — контекстная иконка</SectionHeading>
        <div className="rounded-md border border-border bg-surface-1">
          <EmptyState
            icon={Inbox}
            title="Пока нет запросов"
            description="Создайте первый запрос, чтобы начать опрос собственников."
            action={<Button>Создать запрос</Button>}
          />
        </div>
      </section>

      <section aria-labelledby="buttons-heading">
        <SectionHeading id="buttons-heading">shadcn Button — re-skinned amber</SectionHeading>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Создать запрос</Button>
          <Button variant="secondary">Вторичная</Button>
          <Button variant="outline">Контур</Button>
          <Button variant="ghost">Призрак</Button>
          <Button variant="destructive">Удалить</Button>
          <Button variant="link">Ссылка</Button>
        </div>
      </section>
    </main>
  );
}
