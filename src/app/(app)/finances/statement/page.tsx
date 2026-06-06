import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { listAccounts } from "@/lib/finances/repository";
import { isTochkaConfigured } from "@/lib/finances/tochka-client";
import { StatementBuilder } from "@/components/finances/StatementBuilder";

export const metadata = { title: "Выписка" };
export const dynamic = "force-dynamic";

export default async function StatementPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const accounts = isTochkaConfigured() ? await listAccounts() : [];
  const first = accounts[0];
  const account = first
    ? { title: first.title, maskedNumber: first.maskedNumber, balance: first.balance }
    : null;

  return (
    <div className="mx-auto max-w-xl space-y-[var(--space-section)]">
      <Link
        href="/finances"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Назад к Финансам
      </Link>

      <header className="min-w-0">
        <p className="label-caps">Документы</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-text">Выписка</h1>
        <p className="mt-1 max-w-prose text-sm text-text-secondary">
          Сформируйте выписку по счёту за период и выгрузите в XLSX или CSV.
        </p>
      </header>

      <StatementBuilder account={account} />
    </div>
  );
}
