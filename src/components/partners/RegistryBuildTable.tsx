"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, Mail, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/Money";
import type { RegistryRow, SuggestedRole } from "@/lib/partners/registry-build";

interface RegistryBuildTableProps {
  rows: RegistryRow[];
}

type RoleFilter = "all" | SuggestedRole;

const ROLE_LABEL: Readonly<Record<SuggestedRole, string>> = {
  client: "Клиент",
  carrier: "Перевозчик",
  other: "Прочее (расход)",
};

const ROLE_CHIP: Readonly<Record<SuggestedRole, string>> = {
  client: "bg-surface-3 text-money-pos",
  carrier: "bg-accent-quiet text-accent-text",
  other: "bg-surface-2 text-text-tertiary",
};

const ROLE_TABS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "Все" },
  { value: "carrier", label: "Перевозчики" },
  { value: "client", label: "Клиенты" },
  { value: "other", label: "Прочее" },
];

function matchesSearch(row: RegistryRow, q: string): boolean {
  if (q === "") return true;
  const hay = [
    ...row.names,
    row.inn ?? "",
    row.registryName ?? "",
    ...row.matchedEmails,
    ...row.candidateEmails,
    ...row.samplePurposes,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

export function RegistryBuildTable({ rows }: RegistryBuildTableProps) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const q = search.trim().toLowerCase();

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (roleFilter !== "all" && r.suggestedRole !== roleFilter) return false;
        if (onlyNew && r.inRegistry) return false;
        return matchesSearch(r, q);
      }),
    [rows, roleFilter, onlyNew, q],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Панель управления */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <nav
            aria-label="Фильтр по роли"
            className="flex gap-1 rounded-[var(--radius-md)] bg-surface-1 p-1"
          >
            {ROLE_TABS.map((t) => {
              const active = t.value === roleFilter;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setRoleFilter(t.value)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex h-9 items-center whitespace-nowrap rounded-[var(--radius-sm)] px-3 text-sm transition-colors duration-[var(--duration-fast)] focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
                    active
                      ? "bg-surface-3 text-text"
                      : "text-text-secondary hover:bg-surface-2 hover:text-text",
                  )}
                  style={active ? { fontWeight: "var(--weight-semibold)" } : undefined}
                >
                  {t.label}
                </button>
              );
            })}
          </nav>

          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-md)] bg-surface-1 px-3 text-sm text-text-secondary transition-colors hover:text-text">
            <input
              type="checkbox"
              checked={onlyNew}
              onChange={(e) => setOnlyNew(e.target.checked)}
              className="size-4 accent-[var(--color-accent)]"
            />
            Только не в реестре
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-tertiary"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Название, ИНН, почта, назначение…"
              aria-label="Поиск контрагента"
              className="h-9 w-full rounded-[var(--radius-md)] border border-border bg-surface-2 pl-8 pr-3 text-sm text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            />
          </div>
          <Link
            href="/api/partners/from-bank/export"
            prefetch={false}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-4 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <Download className="size-4" aria-hidden strokeWidth={2.2} />
            Скачать CSV
          </Link>
        </div>
      </div>

      <p className="text-xs text-text-tertiary">
        Показано {filtered.length} из {rows.length}. Роль — это подсказка по назначению платежа;
        окончательно роль назначаете вы. Почты-кандидаты подобраны нечётко по совпадению названия —
        перед привязкой проверьте.
      </p>

      {/* Таблица */}
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
        <table className="w-full min-w-[64rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-1 text-left text-xs uppercase tracking-wide text-text-tertiary">
              <th className="px-3 py-2.5 font-medium">Контрагент</th>
              <th className="px-3 py-2.5 font-medium">ИНН</th>
              <th className="px-3 py-2.5 text-right font-medium">Поступления</th>
              <th className="px-3 py-2.5 text-right font-medium">Списания</th>
              <th className="px-3 py-2.5 text-right font-medium">Опер.</th>
              <th className="px-3 py-2.5 font-medium">Роль (подсказка)</th>
              <th className="px-3 py-2.5 font-medium">В реестре</th>
              <th className="px-3 py-2.5 font-medium">Почта</th>
              <th className="px-3 py-2.5 font-medium">Назначения</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isOpen = expanded === r.key;
              const name = r.registryName ?? r.names[0] ?? "—";
              const extraNames = r.names.filter((n) => n !== name);
              return (
                <tr
                  key={r.key}
                  className="border-b border-border align-top transition-colors last:border-0 hover:bg-surface-1"
                >
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-text">{name}</div>
                    {extraNames.length > 0 && (
                      <div className="mt-0.5 text-xs text-text-tertiary">
                        {extraNames.slice(0, 2).join(" · ")}
                        {extraNames.length > 2 && ` +${extraNames.length - 2}`}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-text-secondary" data-numeric>
                    {r.inn ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.totalIn > 0 ? <Money value={r.totalIn} form="short" /> : <span className="text-text-tertiary">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {r.totalOut > 0 ? <Money value={r.totalOut} form="short" /> : <span className="text-text-tertiary">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary" data-numeric>
                    {r.txCount}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium",
                        ROLE_CHIP[r.suggestedRole],
                      )}
                    >
                      {ROLE_LABEL[r.suggestedRole]}
                    </span>
                    {r.lowConfidence && (
                      <span
                        className="ml-1.5 align-middle text-2xs text-text-tertiary"
                        title="Угадано по направлению платежа — проверьте"
                      >
                        ?
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.inRegistry ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-money-pos">да</span>
                        {r.currentRoles.length > 0 && (
                          <span className="text-2xs text-text-tertiary">
                            {r.currentRoles.join(", ")}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-tertiary">нет</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    {r.matchedEmails.length > 0 ? (
                      <div className="flex flex-col gap-0.5 text-xs text-text">
                        {r.matchedEmails.slice(0, 2).map((e) => (
                          <span key={e} className="break-all">{e}</span>
                        ))}
                      </div>
                    ) : r.candidateEmails.length > 0 ? (
                      <div className="flex flex-col gap-0.5 text-xs text-text-secondary">
                        {r.candidateEmails.slice(0, 2).map((e) => (
                          <span key={e} className="flex items-center gap-1 break-all" title="Кандидат — нечёткий матч по названию">
                            <Mail className="size-3 shrink-0 text-text-tertiary" aria-hidden />
                            {e}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-text-tertiary">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 max-w-sm">
                    {r.samplePurposes.length === 0 ? (
                      <span className="text-text-tertiary">—</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : r.key)}
                        className="text-left text-xs text-text-secondary transition-colors hover:text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                      >
                        <span className={cn(!isOpen && "line-clamp-2")}>
                          {r.samplePurposes.join(" ⁞ ")}
                        </span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-text-tertiary">
                  Ничего не найдено. Измените фильтры или запрос.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
