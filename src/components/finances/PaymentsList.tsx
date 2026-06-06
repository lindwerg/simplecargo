"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { Money } from "@/components/ui/Money";
import { cn } from "@/lib/utils";
import { abbreviateOrgName } from "@/lib/finances/org-name";
import type { PaymentDraftRow } from "@/lib/finances/payments";

interface PaymentsListProps {
  payments: readonly PaymentDraftRow[];
}

const STATUS_RU: Record<string, { label: string; tone: string }> = {
  on_sign: { label: "На подписании", tone: "text-warn" },
  paid: { label: "Оплачен", tone: "text-success" },
  rejected: { label: "Отклонён", tone: "text-danger" },
  error: { label: "Ошибка", tone: "text-danger" },
};

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" });

export function PaymentsList({ payments }: PaymentsListProps) {
  const [statuses, setStatuses] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function refresh(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/finances/tochka/payments/refresh?id=${id}`, { method: "POST" });
      const json: { success: boolean; data?: { status: string } } = await res.json();
      if (json.success && json.data) {
        setStatuses((s) => ({ ...s, [id]: json.data!.status }));
      }
    } finally {
      setBusyId(null);
    }
  }

  if (payments.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-text-tertiary">Платежей пока нет.</p>;
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {payments.map((p) => {
        const st = STATUS_RU[p.status] ?? { label: p.status, tone: "text-text-tertiary" };
        const live = statuses[p.id];
        return (
          <li key={p.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">
                {abbreviateOrgName(p.counterpartyName)}
              </p>
              <p className="truncate text-xs text-text-tertiary">{p.purpose}</p>
              <p className="text-xs text-text-tertiary">
                {dateFmt.format(new Date(p.paymentDate))}
                {live ? ` · ${live}` : p.tochkaStatus ? ` · ${p.tochkaStatus}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <Money value={-p.amount} sign />
              <span className={cn("text-xs font-medium", st.tone)}>{st.label}</span>
            </div>
            <button
              type="button"
              onClick={() => refresh(p.id)}
              disabled={busyId === p.id}
              title="Обновить статус"
              className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
            >
              <RefreshCw className={cn("size-4", busyId === p.id && "animate-spin")} aria-hidden />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
