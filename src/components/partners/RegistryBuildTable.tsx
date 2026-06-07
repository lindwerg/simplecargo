"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Download, Mail, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Money } from "@/components/ui/Money";
import type { RegistryRow, SuggestedRole } from "@/lib/partners/registry-build";

interface RegistryBuildTableProps {
  rows: RegistryRow[];
}

type RoleFilter = "all" | SuggestedRole;
/** Роль, под которой контрагент заносится в реестр (в партнёрах только эти две). */
type ImportRole = "client" | "carrier";

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

function defaultRole(r: RegistryRow): ImportRole {
  return r.suggestedRole === "client" ? "client" : "carrier";
}
function defaultEmail(r: RegistryRow): string {
  return r.matchedEmails[0] ?? r.candidateEmails[0] ?? "";
}

interface ImportState {
  ok: boolean;
  text: string;
}

export function RegistryBuildTable({ rows }: RegistryBuildTableProps) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [onlyNew, setOnlyNew] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Состояние переноса в реестр.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(rows.filter((r) => !r.inRegistry && r.suggestedRole !== "other").map((r) => r.key)),
  );
  const [roleByKey, setRoleByKey] = useState<Record<string, ImportRole>>(
    () => Object.fromEntries(rows.map((r) => [r.key, defaultRole(r)])),
  );
  const [emailByKey, setEmailByKey] = useState<Record<string, string>>(
    () => Object.fromEntries(rows.map((r) => [r.key, defaultEmail(r)])),
  );
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportState | null>(null);

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

  const toggle = (key: string): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.key));
  const toggleAll = (): void => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((r) => next.delete(r.key));
      else filtered.forEach((r) => next.add(r.key));
      return next;
    });
  };

  const selectedCount = selected.size;

  async function runImport(): Promise<void> {
    setImporting(true);
    setResult(null);
    try {
      const items = rows
        .filter((r) => selected.has(r.key))
        .map((r) => {
          const email = emailByKey[r.key]?.trim();
          return {
            inn: r.inn,
            name: r.registryName ?? r.names[0] ?? "",
            nameVariants: r.names,
            role: roleByKey[r.key] ?? defaultRole(r),
            email: email && email.includes("@") ? email : null,
          };
        })
        .filter((i) => i.name !== "");

      const res = await fetch("/api/partners/from-bank/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const json: { success: boolean; data?: { created: number; updated: number; contactsAdded: number }; error?: string } =
        await res.json();

      if (!res.ok || !json.success || !json.data) {
        setResult({ ok: false, text: json.error ?? "Не удалось занести контрагентов" });
        return;
      }
      const { created, updated, contactsAdded } = json.data;
      setResult({
        ok: true,
        text: `Занесено в партнёры: создано ${created}, обновлено ${updated}, почт привязано ${contactsAdded}.`,
      });
      setSelected(new Set());
      router.refresh();
    } catch {
      setResult({ ok: false, text: "Сеть недоступна — попробуйте ещё раз." });
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* Панель управления */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Фильтр по роли" className="flex gap-1 rounded-[var(--radius-md)] bg-surface-1 p-1">
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
                    active ? "bg-surface-3 text-text" : "text-text-secondary hover:bg-surface-2 hover:text-text",
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
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-text-tertiary" aria-hidden />
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
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] bg-surface-3 px-4 text-sm font-medium text-text transition-colors hover:bg-surface-2 focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            <Download className="size-4" aria-hidden strokeWidth={2.2} />
            Скачать CSV
          </Link>
        </div>
      </div>

      <p className="text-xs text-text-tertiary">
        Показано {filtered.length} из {rows.length}. Отметьте галочками, кого занести в «Партнёры», и
        при необходимости поправьте роль и почту. Роль — подсказка по назначению платежа; почты-кандидаты
        подобраны нечётко по совпадению названия — перед привязкой проверьте.
      </p>

      {/* Таблица */}
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-border">
        <table className="w-full min-w-[72rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-1 text-left text-xs uppercase tracking-wide text-text-tertiary">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleAll}
                  aria-label="Выбрать всех на странице"
                  className="size-4 accent-[var(--color-accent)]"
                />
              </th>
              <th className="px-3 py-2.5 font-medium">Контрагент</th>
              <th className="px-3 py-2.5 font-medium">ИНН</th>
              <th className="px-3 py-2.5 text-right font-medium">Поступления</th>
              <th className="px-3 py-2.5 text-right font-medium">Списания</th>
              <th className="px-3 py-2.5 text-right font-medium">Опер.</th>
              <th className="px-3 py-2.5 font-medium">Роль для реестра</th>
              <th className="px-3 py-2.5 font-medium">В реестре</th>
              <th className="px-3 py-2.5 font-medium">Почта</th>
              <th className="px-3 py-2.5 font-medium">Назначения</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isOpen = expanded === r.key;
              const isSel = selected.has(r.key);
              const name = r.registryName ?? r.names[0] ?? "—";
              const extraNames = r.names.filter((n) => n !== name);
              return (
                <tr
                  key={r.key}
                  className={cn(
                    "border-b border-border align-top transition-colors last:border-0",
                    isSel ? "bg-accent-quiet" : "hover:bg-surface-1",
                  )}
                >
                  <td className="px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isSel}
                      onChange={() => toggle(r.key)}
                      aria-label={`Занести ${name}`}
                      className="size-4 accent-[var(--color-accent)]"
                    />
                  </td>
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
                    <div className="flex flex-col items-start gap-1">
                      <span className={cn("inline-flex items-center rounded-pill px-2 py-0.5 text-2xs font-medium", ROLE_CHIP[r.suggestedRole])}>
                        {ROLE_LABEL[r.suggestedRole]}
                        {r.lowConfidence && <span className="ml-1 opacity-70" title="Угадано по направлению платежа">?</span>}
                      </span>
                      <select
                        value={roleByKey[r.key] ?? defaultRole(r)}
                        onChange={(e) =>
                          setRoleByKey((prev) => ({ ...prev, [r.key]: e.target.value as ImportRole }))
                        }
                        aria-label={`Роль для реестра — ${name}`}
                        className="h-8 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 text-xs text-text focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                      >
                        <option value="client">Клиент</option>
                        <option value="carrier">Перевозчик</option>
                      </select>
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {r.inRegistry ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-money-pos">да</span>
                        {r.currentRoles.length > 0 && (
                          <span className="text-2xs text-text-tertiary">{r.currentRoles.join(", ")}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-text-tertiary">нет</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="email"
                      value={emailByKey[r.key] ?? ""}
                      onChange={(e) => setEmailByKey((prev) => ({ ...prev, [r.key]: e.target.value }))}
                      placeholder="email@…"
                      aria-label={`Почта — ${name}`}
                      className="h-8 w-44 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 text-xs text-text placeholder:text-text-tertiary focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
                    />
                    {r.matchedEmails.length === 0 && r.candidateEmails.length > 0 && (
                      <span className="mt-0.5 flex items-center gap-1 text-2xs text-text-tertiary" title="Кандидат — нечёткий матч по названию">
                        <Mail className="size-3 shrink-0" aria-hidden />
                        кандидат — проверьте
                      </span>
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
                        <span className={cn(!isOpen && "line-clamp-2")}>{r.samplePurposes.join(" ⁞ ")}</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-sm text-text-tertiary">
                  Ничего не найдено. Измените фильтры или запрос.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Нижняя панель действия — занести в реестр */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-surface-1/95 backdrop-blur supports-[backdrop-filter]:bg-surface-1/80">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col">
            <span className="text-sm text-text">
              Выбрано: <strong>{selectedCount}</strong>
            </span>
            {result && (
              <span className={cn("text-xs", result.ok ? "text-money-pos" : "text-danger")}>{result.text}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedCount > 0 && (
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="inline-flex h-10 items-center px-3 text-sm text-text-secondary transition-colors hover:text-text"
              >
                Снять выбор
              </button>
            )}
            <button
              type="button"
              onClick={runImport}
              disabled={selectedCount === 0 || importing}
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-accent px-5 text-sm font-semibold text-text-inverse transition-colors hover:bg-accent-hover focus:outline-none focus-visible:[box-shadow:var(--ring-focus)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {importing ? "Заношу…" : `Занести в партнёры (${selectedCount})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
