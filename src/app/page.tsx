import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

// P0-6 placeholder: a design-system smoke surface that proves token wiring,
// typography, the amber shadcn Button, and the theme toggle resolve in both
// themes. Replaced in P0-8 by the funnel nav + login + dashboard ("/" → "/requests", ADR-D12).

const SURFACES = [
  { name: "bg", className: "bg-bg" },
  { name: "surface-1", className: "bg-surface-1" },
  { name: "surface-2", className: "bg-surface-2" },
  { name: "surface-3", className: "bg-surface-3" },
  { name: "surface-inset", className: "bg-surface-inset" },
] as const;

const MONEY_ROWS = [
  { label: "Маржа (плюс)", value: "₽ 1 240 000", cls: "money--pos" },
  { label: "Маржа (минус)", value: "−₽ 86 500", cls: "money--neg" },
  { label: "Маржа (ноль)", value: "₽ 0", cls: "money--zero" },
  { label: "Выручка", value: "₽ 4 815 162", cls: "" },
] as const;

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10 flex items-start justify-between gap-4">
        <div>
          <p className="label-caps">SimpleCargo · Design System</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">
            P0-6 — токены, типографика, Tailwind v4
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Тёмная тема по умолчанию · светлая — равноправный peer
          </p>
        </div>
        <ThemeToggle />
      </header>

      <section aria-labelledby="surfaces-heading" className="mb-10">
        <h2 id="surfaces-heading" className="label-caps mb-3">
          Surface ladder
        </h2>
        <div className="grid grid-cols-5 gap-2">
          {SURFACES.map((s) => (
            <div key={s.name} className="text-center">
              <div
                className={`${s.className} h-16 rounded-md border border-border`}
              />
              <p className="mt-1.5 text-xs text-text-tertiary">{s.name}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="money-heading" className="mb-10">
        <h2 id="money-heading" className="label-caps mb-3">
          Money — Geist Mono · tabular · neutral, semantic on sign
        </h2>
        <table className="w-full rounded-md border border-border bg-surface-1">
          <tbody>
            {MONEY_ROWS.map((row) => (
              <tr key={row.label} className="border-b border-border-subtle last:border-0">
                <td className="px-4 py-2.5 text-sm text-text-secondary">
                  {row.label}
                </td>
                <td className={`money ${row.cls} px-4 py-2.5`}>{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section aria-labelledby="buttons-heading">
        <h2 id="buttons-heading" className="label-caps mb-3">
          shadcn Button — re-skinned amber
        </h2>
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
