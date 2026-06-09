"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Archive, BadgeCheck, CheckCircle2, FileCheck2, Hash, Trophy } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import type { ApiEnvelope } from "./requestTypes";

interface RequestLifecyclePanelProps {
  dealId: string;
  /** Order status: draft|confirmed|active|completed|cancelled. */
  status: string;
}

type LifecyclePayload =
  | { action: "quoted" }
  | { action: "won" }
  | { action: "application" }
  | { action: "gu"; guNumber: string }
  | { action: "complete" }
  | { action: "archive"; lostReason: string };

const ACTION_ERROR = "Не удалось обновить статус.";
const TERMINAL = new Set(["completed", "cancelled"]);

const inputClass =
  "h-11 w-full rounded-[var(--radius-sm)] border border-border bg-surface-inset px-2.5 text-sm text-text " +
  "placeholder:text-text-tertiary outline-none transition-[border-color,box-shadow] " +
  "focus-visible:border-accent focus-visible:[box-shadow:var(--ring-focus)] md:h-9";

// Lifecycle actions for a «Запрос» — PATCHes /api/deals/{id}/lifecycle. Buttons are gated by
// the current order status; «Есть ГУ» and «В архив» reveal a small inline input before firing.
// All actions disable while any request is in flight; success → router.refresh().
export function RequestLifecyclePanel({ dealId, status }: RequestLifecyclePanelProps) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [guOpen, setGuOpen] = React.useState(false);
  const [guNumber, setGuNumber] = React.useState("");
  const [archiveOpen, setArchiveOpen] = React.useState(false);
  const [lostReason, setLostReason] = React.useState("");

  const isDraft = status === "draft";
  const isConfirmed = status === "confirmed";
  const isActive = status === "active";
  const isTerminal = TERMINAL.has(status);

  async function run(payload: LifecyclePayload) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/lifecycle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json: ApiEnvelope<unknown> = await res
        .json()
        .catch(() => ({ success: false }) as ApiEnvelope<unknown>);
      if (!res.ok || !json.success) {
        setError(json.error ?? ACTION_ERROR);
        setPending(false);
        return;
      }
      setGuOpen(false);
      setArchiveOpen(false);
      router.refresh();
    } catch {
      setError(ACTION_ERROR);
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-surface-1 p-4">
      <h3 className="label-caps">Жизненный цикл</h3>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !isDraft}
          onClick={() => run({ action: "quoted" })}
        >
          <BadgeCheck />
          Цена дана
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !isDraft}
          onClick={() => run({ action: "won" })}
        >
          <Trophy />
          Прошли
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || !isDraft}
          onClick={() => run({ action: "application" })}
        >
          <FileCheck2 />
          Получили заявку
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || (!isDraft && !isConfirmed)}
          onClick={() => {
            setArchiveOpen(false);
            setGuOpen((v) => !v);
          }}
        >
          <Hash />
          Есть ГУ
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-success hover:text-success"
          disabled={pending || !isActive}
          onClick={() => run({ action: "complete" })}
        >
          <CheckCircle2 />
          Завершить сделку
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-danger hover:text-danger"
          disabled={pending || isTerminal}
          onClick={() => {
            setGuOpen(false);
            setArchiveOpen((v) => !v);
          }}
        >
          <Archive />
          В архив
        </Button>
      </div>

      {guOpen && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-border bg-surface-2 p-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="label-caps">Номер ГУ</span>
            <input
              aria-label="Номер ГУ"
              className={inputClass}
              value={guNumber}
              disabled={pending}
              placeholder="ГУ-12 / номер накладной"
              onChange={(e) => setGuNumber(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            disabled={pending || !guNumber.trim()}
            onClick={() => run({ action: "gu", guNumber: guNumber.trim() })}
          >
            {pending ? "Сохраняем…" : "Подтвердить ГУ"}
          </Button>
        </div>
      )}

      {archiveOpen && (
        <div className="flex flex-col gap-2 rounded-[var(--radius-sm)] border border-danger/30 bg-danger-quiet p-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="label-caps">Причина отказа</span>
            <input
              aria-label="Причина отказа"
              className={inputClass}
              value={lostReason}
              disabled={pending}
              placeholder="дорого / выбрали другого / не сезон"
              onChange={(e) => setLostReason(e.target.value)}
            />
          </label>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending || !lostReason.trim()}
            onClick={() => run({ action: "archive", lostReason: lostReason.trim() })}
          >
            {pending ? "Архивируем…" : "В архив"}
          </Button>
        </div>
      )}

      {error && <ErrorState message={error} />}
    </section>
  );
}
