import { vatFromGross } from "@/lib/format";

// ЧИСТЫЙ сборщик назначения платежа для for-sign Точки. Формат по решению оператора:
// «счёт + договор + НДС». Точка запрещает em-dash «—» и ограничивает 210 символов;
// НДС пересчитывается от фактической суммы (для частичных оплат).

const MAX_PURPOSE = 210;

export interface PaymentPurposeParts {
  invoiceNumber?: string | null;
  invoiceDate?: string | null; // ISO YYYY-MM-DD (или как есть)
  contractNumber?: string | null;
  contractDate?: string | null;
  serviceDescription?: string | null; // «за что»
  amount: number; // фактическая сумма платежа (с НДС, если vatIncluded)
  vatRate?: number | null; // процент: 22, 20, 0…
  vatIncluded?: boolean | null; // true = в т.ч.; false = без НДС; null = неизвестно
}

/** Убрать запрещённые Точкой символы (em/en-dash → дефис) и схлопнуть пробелы. */
export function sanitizePaymentPurpose(s: string): string {
  return s
    .replace(/[‒–—―−]/g, "-") // –—‒―− → -
    .replace(/[«»"]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** «2026-06-01» → «01.06.2026». Невалидную/пустую дату возвращаем как есть (без времени). */
function ruDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return value.trim().slice(0, 10);
}

/** «67622.95» — рубли с копейками через точку, без разрядов. */
function money2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function truncate(s: string): string {
  return s.length <= MAX_PURPOSE ? s : s.slice(0, MAX_PURPOSE).trimEnd();
}

/**
 * Собрать назначение: «Оплата по счёту № X от D [по договору № Y от D2] за {услуга}.
 * В т.ч. НДС {rate}% - {vat} руб.» Если счёта нет — по договору. НДС пересчитывается
 * от amount, когда vatIncluded.
 */
export function buildPaymentPurpose(parts: PaymentPurposeParts): string {
  const refs: string[] = [];
  if (parts.invoiceNumber?.trim()) {
    const d = ruDate(parts.invoiceDate);
    refs.push(`по счёту № ${parts.invoiceNumber.trim()}${d ? ` от ${d}` : ""}`);
  }
  if (parts.contractNumber?.trim()) {
    const d = ruDate(parts.contractDate);
    refs.push(`по договору № ${parts.contractNumber.trim()}${d ? ` от ${d}` : ""}`);
  }

  let head = refs.length ? `Оплата ${refs.join(" ")}` : "Оплата";
  if (parts.serviceDescription?.trim()) {
    head += ` за ${parts.serviceDescription.trim()}`;
  }
  head += ".";

  let vatClause = "";
  if (parts.vatIncluded === false) {
    vatClause = "Без НДС.";
  } else if (parts.vatRate != null && parts.vatRate > 0 && parts.amount > 0) {
    const vat = vatFromGross(parts.amount, parts.vatRate);
    vatClause = `В т.ч. НДС ${parts.vatRate}% - ${money2(vat)} руб.`;
  }

  return truncate(sanitizePaymentPurpose(vatClause ? `${head} ${vatClause}` : head));
}
