import Link from "next/link";
import { asc } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";

import { db } from "@/lib/db/client";
import { counterparties } from "@/lib/db/schema/counterparties";
import { DirectionForm } from "@/components/directions/DirectionForm";

export const dynamic = "force-dynamic";

export default async function NewDirectionPage() {
  const cps = await db
    .select({ id: counterparties.id, name: counterparties.nameCanonical })
    .from(counterparties)
    .orderBy(asc(counterparties.nameCanonical));

  return (
    <div className="mx-auto max-w-3xl space-y-[var(--space-section)]">
      <header>
        <Link
          href="/directions"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Направления
        </Link>
        <h1 className="mt-2 text-xl font-semibold tracking-tight text-text">Новое направление</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Маршрут, стороны и ставки. Привязки ящиков и активация — после сохранения, на странице
          направления.
        </p>
      </header>

      <DirectionForm counterparties={cps} />
    </div>
  );
}
