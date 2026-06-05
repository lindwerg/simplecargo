"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/ErrorState";
import { TRANSITIONS, type DirectionStatus } from "@/lib/directions/lifecycle";

const ACTION_LABEL: Record<DirectionStatus, string> = {
  draft: "Вернуть в черновик",
  open: "Открыть",
  active: "Активировать",
  paused: "Приостановить",
  completed: "Завершить",
  cancelled: "Отменить",
};

interface StatusActionsProps {
  directionId: string;
  status: DirectionStatus;
}

export function StatusActions({ directionId, status }: StatusActionsProps) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const targets = TRANSITIONS[status];

  const transition = React.useCallback(
    async (to: DirectionStatus) => {
      setError(null);
      setPending(true);
      try {
        const res = await fetch(`/api/directions/${directionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ to }),
        });
        const json: { success: boolean; error?: string } = await res
          .json()
          .catch(() => ({ success: false }));
        if (!res.ok || !json.success) {
          setError(json.error ?? "Не удалось изменить статус.");
          return;
        }
        router.refresh();
      } catch {
        setError("Сетевая ошибка. Попробуйте снова.");
      } finally {
        setPending(false);
      }
    },
    [directionId, router],
  );

  if (targets.length === 0) {
    return <p className="text-sm text-text-tertiary">Терминальный статус — переходы недоступны.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {targets.map((to) => (
          <Button
            key={to}
            type="button"
            size="sm"
            variant={to === "active" ? "default" : to === "cancelled" ? "ghost" : "outline"}
            disabled={pending}
            onClick={() => transition(to)}
          >
            {ACTION_LABEL[to]}
          </Button>
        ))}
      </div>
      {error && <ErrorState message={error} variant="inline" />}
    </div>
  );
}
