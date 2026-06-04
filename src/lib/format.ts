/**
 * Money + VAT formatting — the single authoritative formatter (DESIGN_DIRECTION §4.7).
 *
 * Conventions (ratified against the P0-7 acceptance contract):
 *  - Ruble symbol is LEADING: `formatRub(1234567)` → `₽ 1 234 567` (the §4.7 raw-Intl
 *    snippet shows a trailing symbol — it is illustrative; the acceptance string wins).
 *  - Negatives use the U+2212 minus: `formatRub(-86500)` → `−₽ 86 500`.
 *  - VAT rate is ALWAYS an argument (per-row data, D-PD-3). No hardcoded decimal VAT factor;
 *    math is `rate / 100`, so the rate is read as a percentage.
 */

/** Default VAT rate (percent). Fallback only — VAT is per-row data; never hardcode in math. */
export const DEFAULT_VAT_RATE = 22; // mirrors --vat-default-rate token; a percent, never a decimal factor

const MINUS = "−"; // U+2212 true minus, not the hyphen-minus
const RUBLE = "₽"; // ₽

// Reuse formatter instances (allocating Intl.NumberFormat per call is measurably slower).
const groupWhole = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 });
const groupPrecise = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** ru-RU groups with NBSP / narrow-NBSP; normalize to a plain space for a stable, testable string. */
function normalizeSpaces(formatted: string): string {
  return formatted.replace(/[  ]/g, " ");
}

/** `₽ 1 234 567` (whole) or `₽ 1 234 567,00` (precise). Negatives → `−₽ …`. */
export function formatRub(value: number, opts?: { precise?: boolean }): string {
  const fmt = opts?.precise ? groupPrecise : groupWhole;
  const digits = normalizeSpaces(fmt.format(Math.abs(value)));
  const sign = value < 0 ? MINUS : "";
  return `${sign}${RUBLE} ${digits}`;
}

/** Compact form for dense surfaces: `₽ 1.5M` · `₽ 2к` · `₽ 999`. Negatives → `−₽ …`. */
export function formatRubShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : "";
  let body: string;
  if (abs >= 1e6) {
    body = `${(abs / 1e6).toFixed(1)}M`;
  } else if (abs >= 1e3) {
    body = `${Math.round(abs / 1e3)}к`; // Cyrillic к (тысяч)
  } else {
    body = `${abs}`;
  }
  return `${sign}${RUBLE} ${body}`;
}

/** VAT amount on a net (excl.) base. `vatAmount(100, 20)` → 20; `vatAmount(100)` → 22. */
export function vatAmount(netExcl: number, rate: number = DEFAULT_VAT_RATE): number {
  return netExcl * (rate / 100);
}

/** Gross (incl. VAT) from a net (excl.) base. `withVat(100, 20)` → 120; `withVat(100)` → 122. */
export function withVat(netExcl: number, rate: number = DEFAULT_VAT_RATE): number {
  return netExcl * (1 + rate / 100);
}
