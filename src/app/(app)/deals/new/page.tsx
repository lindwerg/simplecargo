import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { NewDealEntry } from "@/components/trades/NewDealEntry";

export const dynamic = "force-dynamic";

// Proactive deal creation. Two paths: AI intake (voice/file/text → Сделка with directions,
// type auto-derived) or the manual form. Both create an orders row, channel='proactive'.
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
          Надиктуйте, загрузите файл или вставьте текст — ИИ определит тип и маршруты и соберёт
          сделку. Или заполните вручную.
        </p>
      </header>

      <NewDealEntry counterparties={cps} />
    </div>
  );
}
