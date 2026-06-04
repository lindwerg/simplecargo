import { cn } from "@/lib/utils";
import { formatRub, formatRubShort } from "@/lib/format";

type MoneyForm = "full" | "short" | "per-wagon";
type VatTreatment = "inclusive" | "exclusive" | "not_vat_payer";

interface MoneyProps {
  /** Amount in rubles. */
  value: number;
  /** `full` → ₽ 1 234 567 · `short` → ₽ 1.5M · `per-wagon` → ₽ … / ваг. */
  form?: MoneyForm;
  /**
   * When true the value is a signed delta (e.g. margin): positive turns green with a `+`,
   * negative red, zero muted. Plain amounts (revenue, cost) stay neutral — money is NOT
   * decoratively colored (DESIGN_DIRECTION §4.7, H2).
   */
  sign?: boolean;
  /** Per-row VAT rate (percent) — surfaced via title for traceability. */
  vatRate?: number;
  /** VAT handling; `not_vat_payer` owners are flagged (they look cheaper but НДС isn't reclaimable). */
  vatTreatment?: VatTreatment;
  className?: string;
}

function signClass(value: number): string {
  if (value > 0) return "money--pos";
  if (value < 0) return "money--neg";
  return "money--zero";
}

/**
 * Money display — always Geist Mono + tabular-nums, neutral by default, semantic only on sign.
 * Server Component (no interactivity).
 */
export function Money({
  value,
  form = "full",
  sign = false,
  vatRate,
  vatTreatment,
  className,
}: MoneyProps) {
  const base = form === "short" ? formatRubShort(value) : formatRub(value);
  const text = sign && value > 0 ? `+${base}` : base;

  const title =
    vatRate !== undefined ? `НДС ${vatRate}%` : undefined;

  return (
    <span
      className={cn("money", sign && signClass(value), className)}
      title={title}
      data-numeric
    >
      {text}
      {form === "per-wagon" && (
        <span className="ml-1 text-text-tertiary"> / ваг</span>
      )}
      {vatTreatment === "not_vat_payer" && (
        <span className="label-caps ml-1.5 align-middle" title="Не плательщик НДС">
          без НДС
        </span>
      )}
    </span>
  );
}
