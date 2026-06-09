// Pure rate-expression resolution (RFQ upgrade, Goal 4). NO DB import so it stays
// unit-testable without env/Postgres. A request/ПСЦ rate may be a flat ₽ amount, an
// indicative "+X% к тарифу", or tariff+markup. flat_rub resolves to itself;
// the tariff-based kinds need a РЖД base (the auto-substituted, indexed tariff)
// to resolve into an absolute ₽/wagon snapshot.
// С 2026 действующий прейскурант — ТР-1 (10-01 отменён), поэтому дефолтная ссылка — "ТР-1";
// если клиент в запросе назвал конкретный тариф, он приходит в tariffRef и печатается как есть.

const PERCENT_DIVISOR = 100;
const DEFAULT_TARIFF_REF = "ТР-1";
const RUB_LOCALE = "ru-RU";

export type RateKind = "flat_rub" | "tariff_indicative" | "tariff_plus_markup";

export interface RateExpression {
  kind: RateKind;
  flatAmount?: number | null;
  markupPct?: number | null;
  /** Ссылка на тариф из запроса клиента (напр. "10-01"); без неё — действующий ТР-1. */
  tariffRef?: string | null;
}

export interface ResolvedAmount {
  amount: number | null;
  resolvable: boolean;
  reason?: string;
}

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function applyMarkup(tariffBase: number, markupPct: number | null | undefined): number {
  const pct = markupPct ?? 0;
  return Math.round(tariffBase * (1 + pct / PERCENT_DIVISOR));
}

// Resolve an expression into an absolute ₽/wagon amount. flat_rub uses its own entered
// amount; the tariff-based kinds require a finite, positive tariffBase (the indexed
// 10-01 tariff). markupPct may be negative or null (treated as 0).
export function resolveAmount(
  expr: RateExpression,
  tariffBase?: number | null,
): ResolvedAmount {
  if (expr.kind === "flat_rub") {
    if (isFinitePositive(expr.flatAmount)) {
      return { amount: expr.flatAmount, resolvable: true };
    }
    return { amount: null, resolvable: false, reason: "no flat amount" };
  }

  if (!isFinitePositive(tariffBase)) {
    return { amount: null, resolvable: false, reason: "no tariff base" };
  }

  return { amount: applyMarkup(tariffBase, expr.markupPct), resolvable: true };
}

function formatRub(amount: number): string {
  return `${new Intl.NumberFormat(RUB_LOCALE).format(amount)} ₽/ваг`;
}

function formatSignedPct(pct: number): string {
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct}`;
}

// Human-readable label for UI/КП. flat ⇒ "30 000 ₽/ваг"; indicative/markup ⇒
// "+10% к тарифу ТР-1" (or "по тарифу ТР-1" when markup is 0/absent). Если в выражении
// есть tariffRef из запроса клиента — печатаем его вместо дефолтного ТР-1.
export function formatRateExpression(expr: RateExpression): string {
  if (expr.kind === "flat_rub") {
    if (isFinitePositive(expr.flatAmount)) {
      return formatRub(expr.flatAmount);
    }
    return "—";
  }

  const ref = expr.tariffRef?.trim() || DEFAULT_TARIFF_REF;
  const pct = expr.markupPct ?? 0;
  if (pct === 0) {
    return `по тарифу ${ref}`;
  }
  return `${formatSignedPct(pct)}% к тарифу ${ref}`;
}
