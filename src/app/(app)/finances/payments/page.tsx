import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { listAccounts } from "@/lib/finances/repository";
import { listPaymentDrafts } from "@/lib/finances/payments";
import { isTochkaConfigured } from "@/lib/finances/tochka-client";
import { PaymentForm } from "@/components/finances/PaymentForm";
import { PaymentsList } from "@/components/finances/PaymentsList";
import { WebhookManager } from "@/components/finances/WebhookManager";

export const metadata = { title: "Платежи" };
export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const configured = isTochkaConfigured();
  const [accounts, payments] = configured
    ? await Promise.all([listAccounts(), listPaymentDrafts()])
    : [[], []];

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
        <p className="label-caps">Платежи</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-text">Создать платёж</h1>
        <p className="mt-1 max-w-prose text-sm text-text-secondary">
          Загрузите счёт — ИИ заполнит реквизиты, сумму и назначение. Платёж уходит в Точку
          «на подписание»: деньги не списываются, пока директор не подпишет его в интернет-банке.
        </p>
      </header>

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <PaymentForm accounts={accounts} />
      </section>

      <section className="rounded-lg border border-border bg-surface-1">
        <div className="border-b border-border px-4 py-3">
          <h2 className="label-caps">Черновики на подписи</h2>
        </div>
        <PaymentsList payments={payments} />
      </section>

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <p className="label-caps mb-2">Уведомления банка</p>
        <WebhookManager />
      </section>
    </div>
  );
}
