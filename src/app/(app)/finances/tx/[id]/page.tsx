import { headers } from "next/headers";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { auth } from "@/lib/auth";
import { Money } from "@/components/ui/Money";
import { getTransactionDetail } from "@/lib/finances/repository";
import { abbreviateOrgName } from "@/lib/finances/org-name";
import { ReconcileControl } from "@/components/finances/ReconcileControl";

export const dynamic = "force-dynamic";

const dateTimeFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function Requisite({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="border-b border-border-subtle py-3">
      <dt className="text-xs text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-text">{value}</dd>
    </div>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TransactionDetailPage({ params }: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { id } = await params;
  const tx = await getTransactionDetail(id);
  if (!tx) notFound();

  const incoming = tx.direction === "in";
  const signed = incoming ? tx.amount : -tx.amount;
  const partyLabel = incoming ? "Отправитель" : "Получатель";
  const statusLabel =
    tx.status === "pending" ? "В обработке" : incoming ? "Зачислено" : "Исполнено";

  return (
    <div className="mx-auto max-w-xl space-y-[var(--space-section)]">
      <Link
        href="/finances"
        className="inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Назад к Финансам
      </Link>

      <header className="text-center">
        <div className="flex items-center justify-between text-sm text-text-tertiary">
          <span>{dateTimeFmt.format(new Date(tx.postedAt))}</span>
          <span className="font-medium text-success">{statusLabel}</span>
        </div>
        <p className="mt-4 text-3xl font-bold tracking-tight">
          <Money value={signed} sign />
        </p>
        {tx.documentNumber && (
          <p className="mt-1 text-sm text-text-secondary">Платёж по реквизитам №{tx.documentNumber}</p>
        )}
      </header>

      <section className="rounded-lg border border-border bg-surface-1 px-4">
        <dl>
          <Requisite label="Назначение платежа" value={tx.purposeRaw} />
          <Requisite label={partyLabel} value={abbreviateOrgName(tx.counterpartyName)} />
          <Requisite label="ИНН" value={tx.counterpartyInn} />
          <Requisite label="КПП" value={tx.counterpartyKpp} />
          <Requisite label="Номер счёта" value={tx.counterpartyAccount} />
          <Requisite label="БИК" value={tx.counterpartyBankBic} />
          <Requisite label="Наименование банка" value={tx.counterpartyBankName} />
          <Requisite label="Корсчёт" value={tx.counterpartyCorrAccount} />
          <Requisite label="Счёт зачисления" value={tx.accountMasked} />
        </dl>
      </section>

      <section className="rounded-lg border border-border bg-surface-1 p-4">
        <p className="label-caps mb-2">Разнесение</p>
        <ReconcileControl
          transactionId={tx.id}
          linked={tx.linked}
          matchedName={tx.matchedCounterparty}
          counterpartyInn={tx.counterpartyInn}
        />
      </section>
    </div>
  );
}
