import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Handshake, Plus } from "lucide-react";

import { auth } from "@/lib/auth";
import { TariffCalculator } from "@/components/tariff/TariffCalculator";
import { VoiceQuote } from "@/components/tariff/VoiceQuote";

export const metadata = { title: "Калькулятор тарифа — SimpleCargo" };

export default async function TariffPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="space-y-[var(--space-section)]">
      <header className="min-w-0">
        <p className="label-caps">Расчёт</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-text">
          Калькулятор РЖД-тарифа
        </h1>
        <p className="mt-1 max-w-prose text-sm text-text-tertiary">
          Провозная плата по ТР-1 2026 (Приказ ФАС 894/25). Точно до рубля для собственного
          полувагона, класс 1 (нерудные); вне контура — расстояние считается, цену занесите вручную.
        </p>
      </header>

      <section aria-label="Действия" className="grid grid-cols-2 gap-3">
        <Link
          href="/deals/new"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-accent-quiet text-accent transition-transform group-hover:scale-105">
            <Plus className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Новая сделка</span>
            <span className="block text-xs text-text-tertiary">Занести расчёт в запрос</span>
          </span>
        </Link>
        <Link
          href="/deals"
          className="group flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-5 py-6 transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-quad)] hover:-translate-y-[2px] active:translate-y-0 active:opacity-90 focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-surface-2 text-text-secondary transition-colors group-hover:text-text">
            <Handshake className="size-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block text-base font-semibold text-text">Сделки</span>
            <span className="block text-xs text-text-tertiary">Воронка и исполнение</span>
          </span>
        </Link>
      </section>

      <VoiceQuote />
      <TariffCalculator />
    </div>
  );
}
