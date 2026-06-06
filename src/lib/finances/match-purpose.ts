// Pure helpers that mine a payment purpose (назначение платежа) for the tokens we
// reconcile against: счёт/счёт-фактура numbers and ИНН. No HTTP/DB — unit-tested.

// Invoice markers seen in real Tochka descriptions: "Счет № 245", "по счёту 245",
// "сч. 245", "СФ 1270", "счёт-фактура № 1270", "счет-фактуре N 18".
const INVOICE_MARKER =
  /(?:сч[её]т[\s-]*фактур[а-яё]*|сч[её]т[а-яё]*|сф|сч\.?)\s*[№nN#]?\s*(\d{1,10})/giu;

// ИНН: 10 (org) or 12 (individual) digits, optionally prefixed by "ИНН".
const INN_TAGGED = /инн\s*[:№]?\s*(\d{10}|\d{12})/giu;
const INN_BARE = /(?<!\d)(\d{10}|\d{12})(?!\d)/g;

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

/** Extract candidate invoice numbers from a purpose string (dedup, in order). */
export function extractInvoiceNumbers(purpose: string | null | undefined): string[] {
  if (!purpose) return [];
  const out: string[] = [];
  for (const m of purpose.matchAll(INVOICE_MARKER)) {
    if (m[1]) out.push(m[1]);
  }
  return uniq(out);
}

/** Extract candidate ИНН from a purpose string. Tagged ("ИНН …") matches win,
 *  then bare 10/12-digit groups. Deduped, tagged-first. */
export function extractInns(purpose: string | null | undefined): string[] {
  if (!purpose) return [];
  const tagged: string[] = [];
  for (const m of purpose.matchAll(INN_TAGGED)) {
    if (m[1]) tagged.push(m[1]);
  }
  const bare: string[] = [];
  for (const m of purpose.matchAll(INN_BARE)) {
    if (m[1]) bare.push(m[1]);
  }
  return uniq([...tagged, ...bare]);
}

/** Does a purpose reference a given invoice number? Tolerant to leading zeros. */
export function purposeMentionsInvoice(
  purpose: string | null | undefined,
  invoiceNumber: string | null | undefined,
): boolean {
  if (!purpose || !invoiceNumber) return false;
  const target = invoiceNumber.replace(/^0+/, "");
  return extractInvoiceNumbers(purpose).some((n) => n.replace(/^0+/, "") === target);
}
