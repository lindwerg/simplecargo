"use client";

import * as React from "react";
import { Loader2, Ruler } from "lucide-react";

import { cn } from "@/lib/utils";
import { ErrorState } from "@/components/ui/ErrorState";
import type { ApiEnvelope, MatrixResult, MatrixRow } from "./requestTypes";

interface RequestTariffPanelProps {
  originEsr: string;
  destEsr: string;
  /** Apply the повагонная own-tariff (band «1») as the client rate. */
  onApplyClientRate: (value: string) => void;
  /** Surface the provision rate up to the parent so it can hint near rateOwner. */
  onProvision: (provisionNoVat: number | null) => void;
}

const rub = (n: number): string => `${Math.round(n).toLocaleString("ru-RU")} ₽`;

const CONFIDENCE: Record<MatrixResult["confidence"], { label: string; cls: string }> = {
  green: { label: "сверено", cls: "border-success/30 bg-success-quiet text-success" },
  yellow: { label: "ориентир", cls: "border-warn/40 bg-warn-quiet text-warn" },
  red: { label: "не сверено", cls: "border-danger/30 bg-danger-quiet text-danger" },
};

const FETCH_ERROR = "Не удалось рассчитать тариф.";

/** The повагонная row (band «1»), which the spec asks us to surface. */
function singleWagonRow(result: MatrixResult): MatrixRow | null {
  return result.rows.find((r) => r.band === "1") ?? result.rows[0] ?? null;
}

// Compact auto-tariff panel for the «Запрос» worksheet. Fires /api/tariff/matrix only when
// BOTH ESRs are present (guarded by the parent rendering it conditionally + an effect guard),
// then renders distance, a confidence badge and the повагонная own-tariff / provision figures
// (both без НДС). «применить» writes the own tariff into the client rate. A compact echo of
// the full VoiceQuote MatrixView — only the figures the operator needs at quoting time.
export function RequestTariffPanel({
  originEsr,
  destEsr,
  onApplyClientRate,
  onProvision,
}: RequestTariffPanelProps) {
  const [result, setResult] = React.useState<MatrixResult | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Keep the latest callback for provision without re-firing the fetch effect.
  const onProvisionRef = React.useRef(onProvision);
  onProvisionRef.current = onProvision;

  React.useEffect(() => {
    if (!originEsr || !destEsr) return;
    let cancelled = false;
    setPending(true);
    setError(null);

    void fetch("/api/tariff/matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originEsr, destEsr }),
    })
      .then((r) => r.json() as Promise<ApiEnvelope<MatrixResult>>)
      .then((json) => {
        if (cancelled) return;
        if (!json.success || !json.data) {
          setError(json.error ?? FETCH_ERROR);
          setResult(null);
          onProvisionRef.current(null);
          return;
        }
        setResult(json.data);
        const row = singleWagonRow(json.data);
        onProvisionRef.current(row ? row.classic.provisionNoVat : null);
      })
      .catch(() => {
        if (cancelled) return;
        setError(FETCH_ERROR);
        setResult(null);
        onProvisionRef.current(null);
      })
      .finally(() => {
        if (!cancelled) setPending(false);
      });

    return () => {
      cancelled = true;
    };
  }, [originEsr, destEsr]);

  return (
    <section className="space-y-2 rounded-[var(--radius-lg)] border border-border bg-surface-1 p-3">
      <div className="flex items-center justify-between">
        <span className="label-caps inline-flex items-center gap-1.5">
          <Ruler className="size-3.5 text-text-tertiary" aria-hidden />
          Авто-тариф
        </span>
        {pending && <Loader2 className="size-4 animate-spin text-text-tertiary" aria-hidden />}
      </div>

      {error && <ErrorState message={error} />}

      {result && !error && <TariffBody result={result} onApplyClientRate={onApplyClientRate} />}
    </section>
  );
}

function TariffBody({
  result,
  onApplyClientRate,
}: {
  result: MatrixResult;
  onApplyClientRate: (value: string) => void;
}) {
  const conf = CONFIDENCE[result.confidence];
  const row = singleWagonRow(result);
  const outOfScope = result.scope === "out-of-scope" || row === null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-2xs text-text-tertiary">Тарифное расстояние</span>
        <span className="inline-flex items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center rounded-pill border px-2 py-0.5 text-2xs font-medium",
              conf.cls,
            )}
          >
            {conf.label}
          </span>
          <span className="text-base font-semibold tabular-nums text-text">
            {result.distanceKm !== null
              ? `${result.distanceKm.toLocaleString("ru-RU")} км`
              : "—"}
          </span>
        </span>
      </div>

      {outOfScope ? (
        <div className="rounded-[var(--radius-sm)] border border-accent/30 bg-accent-quiet p-2.5 text-2xs text-text-secondary">
          <p className="font-medium text-accent">Цена не рассчитана автоматически</p>
          {result.warnings[0] && <p className="mt-1">{result.warnings[0]}</p>}
        </div>
      ) : (
        <ProvisionFigures
          row={row!}
          ownerCoeff={result.ownerCoeff}
          onApplyClientRate={onApplyClientRate}
        />
      )}
    </div>
  );
}

function ProvisionFigures({
  row,
  ownerCoeff,
  onApplyClientRate,
}: {
  row: MatrixRow;
  ownerCoeff: number;
  onApplyClientRate: (value: string) => void;
}) {
  const ownTariff = row.classic.tariffNoVat;
  const provision = row.classic.provisionNoVat;

  return (
    <div className="space-y-2.5">
      <p className="text-2xs text-text-tertiary">{row.bandLabel} · обычный полувагон · без НДС</p>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[var(--radius-sm)] border border-border-subtle bg-surface-2 px-2.5 py-2">
          <p className="label-caps">Собственный тариф</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-text">{rub(ownTariff)}</p>
          <p className="text-2xs text-text-tertiary">₽ / ваг</p>
        </div>
        <div className="rounded-[var(--radius-sm)] border border-accent/30 bg-accent-quiet px-2.5 py-2">
          <p className="label-caps">Предоставление</p>
          <p className="mt-0.5 text-sm font-semibold tabular-nums text-accent">{rub(provision)}</p>
          <p className="text-2xs text-text-tertiary">×{ownerCoeff} · ₽ / ваг · проверяется</p>
        </div>
      </div>

      <button
        type="button"
        onClick={() => onApplyClientRate(String(ownTariff))}
        className="text-2xs text-accent transition-colors hover:underline"
      >
        применить как ставку клиенту
      </button>
    </div>
  );
}
