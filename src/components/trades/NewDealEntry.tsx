"use client";

import * as React from "react";
import { PencilLine, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";
import { IntakeStudio } from "@/components/requests/IntakeStudio";
import { NewDealForm, type CounterpartyOption } from "./NewDealForm";

type Mode = "ai" | "manual";

const MODES: readonly [Mode, string, typeof Sparkles][] = [
  ["ai", "С ИИ", Sparkles],
  ["manual", "Вручную", PencilLine],
];

interface NewDealEntryProps {
  counterparties: CounterpartyOption[];
}

// Two ways to start a deal: AI intake (voice/file/text → Сделка with directions) or the
// plain manual form. AI is the default; the segmented control swaps to the manual form.
export function NewDealEntry({ counterparties }: NewDealEntryProps) {
  const [mode, setMode] = React.useState<Mode>("ai");

  return (
    <div className="space-y-[var(--space-section)]">
      <div
        role="tablist"
        aria-label="Способ создания сделки"
        className="inline-flex gap-1 rounded-[var(--radius-md)] border border-border bg-surface-2 p-1"
      >
        {MODES.map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => setMode(value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-3.5 py-1.5 text-sm font-medium transition-colors focus:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
              mode === value
                ? "bg-accent text-text-inverse"
                : "text-text-secondary hover:text-text",
            )}
          >
            <Icon className="size-4" aria-hidden strokeWidth={1.8} />
            {label}
          </button>
        ))}
      </div>

      {mode === "ai" ? (
        <IntakeStudio target="deal" />
      ) : (
        <NewDealForm counterparties={counterparties} />
      )}
    </div>
  );
}
