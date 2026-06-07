"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Handshake } from "lucide-react";

import { Button } from "@/components/ui/button";

// One line offered to the conversion dialog. "suggested" reflects the auto rule
// (route + wagons → transport) so the default selection matches the server's "auto".
export interface ConvertLine {
  id: string;
  label: string;
  suggested: "transport" | "stone";
}

type Choice = "transport" | "stone" | "auto";

interface ConvertToTradeButtonProps {
  requestId: string;
  lines: ConvertLine[];
}

/** Converts a won request into a deal (Фаза 3). The dialog lets the operator confirm,
 *  per line, whether it becomes a transport direction or a stone line — default "auto"
 *  follows the line shape. After conversion redirects to the new deal card. */
export function ConvertToTradeButton({ requestId, lines }: ConvertToTradeButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});

  function setChoice(lineId: string, value: Choice) {
    setChoices((prev) => ({ ...prev, [lineId]: value }));
  }

  async function convert() {
    setLoading(true);
    setError(null);
    try {
      // Only send overrides that differ from "auto" — keeps the payload minimal.
      const perLine: Record<string, Choice> = {};
      for (const [id, value] of Object.entries(choices)) {
        if (value !== "auto") perLine[id] = value;
      }
      const res = await fetch(`/api/requests/${requestId}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          default: "auto",
          ...(Object.keys(perLine).length > 0 ? { perLine } : {}),
        }),
      });
      const json: { success: boolean; data?: { id: string }; error?: string } = await res.json();
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error ?? "Не удалось сконвертировать");
      }
      router.push(`/deals/${json.data.id}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ошибка");
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button type="button" size="sm" onClick={() => setOpen(true)}>
        <Handshake />
        Создать сделку
      </Button>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface-2 p-4">
      <div className="flex items-center justify-between">
        <h2 className="label-caps">Конверсия в сделку</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-text-tertiary hover:text-text"
        >
          Отмена
        </button>
      </div>
      <p className="text-sm text-text-secondary">
        Каждая строка станет перевозкой (направление) или товаром (щебень). По умолчанию —
        автоматически по составу строки.
      </p>
      <ul className="flex flex-col gap-2">
        {lines.map((line) => {
          const value = choices[line.id] ?? "auto";
          return (
            <li
              key={line.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-border-subtle bg-surface-1 px-3 py-2 text-sm"
            >
              <span className="text-text">{line.label}</span>
              <select
                value={value}
                onChange={(e) => setChoice(line.id, e.target.value as Choice)}
                className="h-9 rounded-[var(--radius-sm)] border border-border bg-surface-2 px-2 text-sm text-text"
                aria-label={`Тип компонента для ${line.label}`}
              >
                <option value="auto">
                  Авто ({line.suggested === "transport" ? "перевозка" : "щебень"})
                </option>
                <option value="transport">Перевозка</option>
                <option value="stone">Щебень</option>
              </select>
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-end gap-3">
        {error && <span className="text-xs text-danger">{error}</span>}
        <Button type="button" size="sm" onClick={convert} disabled={loading}>
          {loading ? "Создаю…" : "Создать сделку"}
        </Button>
      </div>
    </section>
  );
}
