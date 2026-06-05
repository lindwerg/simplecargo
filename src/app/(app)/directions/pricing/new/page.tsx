import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { priceProtocols } from "@/lib/db/schema/pricing";
import { PriceProtocolForm } from "@/components/pricing/PriceProtocolForm";

export const dynamic = "force-dynamic";

function sideLabel(side: string): string {
  return side === "owner_cost" ? "затраты" : "выручка";
}

export default async function NewPriceProtocolPage() {
  const [cps, activeProtocols] = await Promise.all([
    db
      .select({ id: counterparties.id, name: counterparties.nameCanonical })
      .from(counterparties)
      .orderBy(asc(counterparties.nameCanonical)),
    db
      .select({
        id: priceProtocols.id,
        protocolNumber: priceProtocols.protocolNumber,
        side: priceProtocols.side,
        counterpartyName: counterparties.nameCanonical,
      })
      .from(priceProtocols)
      .leftJoin(counterparties, eq(priceProtocols.counterpartyId, counterparties.id))
      .where(eq(priceProtocols.status, "active"))
      .orderBy(desc(priceProtocols.createdAt)),
  ]);

  const protocols = activeProtocols.map((p) => ({
    id: p.id,
    label: `${p.protocolNumber ?? "Без номера"} · ${p.counterpartyName ?? "—"} · ${sideLabel(p.side)}`,
  }));

  return (
    <div className="mx-auto max-w-3xl space-y-[var(--space-section)]">
      <header>
        <Link
          href="/directions/pricing"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Ставки ПСЦ
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-text">Новый протокол ПСЦ</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Согласованная таблица ставок по маршрутам. Сторона (затраты/выручка) определяется ролью
          РНС.
        </p>
      </header>

      <PriceProtocolForm counterparties={cps} protocols={protocols} />
    </div>
  );
}
