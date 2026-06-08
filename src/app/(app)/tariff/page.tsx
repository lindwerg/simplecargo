import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";
import { TariffCalculator } from "@/components/tariff/TariffCalculator";

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

      <TariffCalculator />
    </div>
  );
}
