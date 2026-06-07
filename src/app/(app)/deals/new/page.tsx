import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const dynamic = "force-dynamic";

// Phase 0 placeholder. Manual (proactive) deal creation lands in Phase 1 together
// with the trades domain layer and the orders spine migration.
export default function NewDealPage() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/deals"
        className="inline-flex h-11 items-center gap-1 self-start text-sm text-text-tertiary hover:text-text md:h-auto"
      >
        <ArrowLeft className="size-4" aria-hidden /> К сделкам
      </Link>
      <section className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface-1 p-6">
        <h1 className="text-lg text-text">Новая сделка</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Ручное создание сделки (проактивная продажа) появится в Фазе 1. Пока сделки приходят из
          выигранных запросов.
        </p>
      </section>
    </div>
  );
}
