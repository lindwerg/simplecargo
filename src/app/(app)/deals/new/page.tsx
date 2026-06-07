import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { NewDealForm } from "@/components/trades/NewDealForm";

export const dynamic = "force-dynamic";

// Manual (proactive) deal creation (Фаза 1). Creates an orders row with
// channel='proactive', status='draft'; composition is added on the deal card.
export default async function NewDealPage() {
  const cps = await db
    .select({ id: counterparties.id, name: counterparties.nameCanonical })
    .from(counterparties)
    .orderBy(asc(counterparties.nameCanonical));

  return (
    <div className="mx-auto max-w-3xl space-y-[var(--space-section)]">
      <header>
        <Link
          href="/deals"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Сделки
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-text">Новая сделка</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Проактивная продажа. Направления, щебень и ставки добавляются после создания, на карточке
          сделки.
        </p>
      </header>

      <NewDealForm counterparties={cps} />
    </div>
  );
}
