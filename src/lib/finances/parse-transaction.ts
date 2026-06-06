// Pure, tolerant parser: a raw Tochka statement/webhook transaction → our
// normalized shape. Kept free of any HTTP/DB so it is trivially unit-testable.
//
// Тонкость направления (DB_SCHEMA): при ПРИХОДЕ (Credit) контрагент — плательщик
// (Debtor*), «от кого пришли». При РАСХОДЕ (Debit) — получатель (Creditor*),
// «кому оплатили». Tochka исторически отдаёт поля в разных регистрах/вариантах,
// поэтому читаем по списку кандидатов и сохраняем `raw` для доразбора.

export interface NormalizedTransaction {
  externalTxId: string;
  paymentId: string | null;
  direction: "in" | "out";
  amount: number; // absolute value, in transaction currency
  amountNat: number | null; // в валюте счёта, если отдаётся отдельно
  currency: string;
  postedAt: Date;
  purposeRaw: string | null;
  counterpartyInn: string | null;
  counterpartyKpp: string | null;
  counterpartyName: string | null;
  counterpartyAccount: string | null;
  counterpartyBankBic: string | null;
  status: "booked" | "pending";
  raw: unknown;
}

export class TochkaParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TochkaParseError";
  }
}

type Raw = Record<string, unknown>;

function asRecord(v: unknown): Raw | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
}

function pickString(obj: Raw | null, keys: readonly string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNumber(obj: Raw | null, keys: readonly string[]): number | null {
  const s = pickString(obj, keys);
  if (s === null) return null;
  // Russian statements may use comma decimals or spaces as group separators.
  const normalized = s.replace(/\s/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function pickNested(obj: Raw | null, keys: readonly string[]): Raw | null {
  if (!obj) return null;
  for (const k of keys) {
    const nested = asRecord(obj[k]);
    if (nested) return nested;
  }
  return null;
}

const DIRECTION_KEYS = ["creditDebitIndicator", "CreditDebitIndicator", "direction", "type"] as const;
const TXID_KEYS = ["transactionId", "TransactionId", "id", "operationId", "documentId"] as const;
const PAYMENTID_KEYS = ["paymentId", "PaymentId", "paymentID"] as const;
const PURPOSE_KEYS = [
  "description",
  "paymentPurpose",
  "purpose",
  "TransactionInformation",
  "transactionInformation",
  "comment",
] as const;
const DATE_KEYS = [
  "documentProcessDate",
  "documentProductDate",
  "bookingDateTime",
  "BookingDateTime",
  "transactionDate",
  "date",
  "valueDate",
  "createdAt",
] as const;
const STATUS_KEYS = ["status", "Status"] as const;

const INN_KEYS = ["inn", "Inn", "INN", "payerInn", "receiverInn"] as const;
const KPP_KEYS = ["kpp", "Kpp", "KPP"] as const;
const NAME_KEYS = ["name", "Name", "fullName", "shortName", "payerName", "receiverName"] as const;
// Live Tochka puts the counterparty account number in *Account.identification.
const ACCOUNT_KEYS = [
  "identification",
  "Identification",
  "account",
  "Account",
  "accountNumber",
  "number",
] as const;
// БИК lives in *Agent.identification (9 digits); flat variants kept as fallback.
const AGENT_BIC_KEYS = ["bic", "Bic", "BIC", "bankBic", "bankCode", "identification"] as const;
const FLAT_BIC_KEYS = ["bic", "Bic", "BIC", "bankBic", "bankCode", "payerBankBic", "receiverBankBic"] as const;

// Containers holding the counterparty, by direction. `in` (Credit) → debtor side;
// `out` (Debit) → creditor side. `counterParty` is Tochka's flatter variant.
const CREDIT_CONTAINERS = [
  "DebtorParty",
  "debtorParty",
  "Debtor",
  "debtor",
  "payer",
  "sender",
  "counterParty",
  "counterparty",
] as const;
const DEBIT_CONTAINERS = [
  "CreditorParty",
  "creditorParty",
  "Creditor",
  "creditor",
  "payee",
  "receiver",
  "counterParty",
  "counterparty",
] as const;
const CREDIT_ACCOUNT_CONTAINERS = ["DebtorAccount", "debtorAccount"] as const;
const DEBIT_ACCOUNT_CONTAINERS = ["CreditorAccount", "creditorAccount"] as const;
const CREDIT_AGENT_CONTAINERS = ["DebtorAgent", "debtorAgent"] as const;
const DEBIT_AGENT_CONTAINERS = ["CreditorAgent", "creditorAgent"] as const;

function normalizeDirection(value: string | null): "in" | "out" | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.startsWith("cred") || v === "in" || v === "incoming") return "in";
  if (v.startsWith("deb") || v === "out" || v === "outgoing") return "out";
  return null;
}

function normalizeStatus(value: string | null): "booked" | "pending" {
  if (!value) return "booked";
  return value.toLowerCase().startsWith("pend") ? "pending" : "booked";
}

/**
 * Parse one raw Tochka transaction. Throws TochkaParseError only when an essential
 * field (id, direction, amount, date) is missing/unparseable — everything else is
 * best-effort and may be null.
 */
export function parseTransaction(input: unknown): NormalizedTransaction {
  const tx = asRecord(input);
  if (!tx) {
    throw new TochkaParseError("Transaction is not an object");
  }

  const externalTxId = pickString(tx, TXID_KEYS);
  if (!externalTxId) {
    throw new TochkaParseError("Transaction is missing a stable id");
  }

  const direction = normalizeDirection(pickString(tx, DIRECTION_KEYS));
  if (!direction) {
    throw new TochkaParseError(`Unrecognized direction for transaction ${externalTxId}`);
  }

  // Amount may be nested under Amount/{amount,currency} or flat.
  const amountObj = pickNested(tx, ["amount", "Amount"]);
  const amount =
    pickNumber(amountObj, ["amount", "Amount", "value"]) ??
    pickNumber(tx, ["amount", "Amount", "sum", "value"]);
  if (amount === null) {
    throw new TochkaParseError(`Transaction ${externalTxId} has no parseable amount`);
  }

  const currency =
    pickString(amountObj, ["currency", "Currency"]) ??
    pickString(tx, ["currency", "Currency"]) ??
    "RUB";

  const amountNat =
    pickNumber(amountObj, ["amountNat", "AmountNat"]) ??
    pickNumber(tx, ["amountNat", "AmountNat"]);

  const dateStr = pickString(tx, DATE_KEYS);
  const postedAt = dateStr ? new Date(dateStr) : null;
  if (!postedAt || Number.isNaN(postedAt.getTime())) {
    throw new TochkaParseError(`Transaction ${externalTxId} has no parseable date`);
  }

  const partyContainers = direction === "in" ? CREDIT_CONTAINERS : DEBIT_CONTAINERS;
  const accountContainers =
    direction === "in" ? CREDIT_ACCOUNT_CONTAINERS : DEBIT_ACCOUNT_CONTAINERS;
  const agentContainers = direction === "in" ? CREDIT_AGENT_CONTAINERS : DEBIT_AGENT_CONTAINERS;

  const party = pickNested(tx, partyContainers);
  const account = pickNested(tx, accountContainers);
  const agent = pickNested(tx, agentContainers);

  // Identity (inn/kpp/name): party → account → agent → flat top-level.
  const searchIdentity = (keys: readonly string[]): string | null =>
    pickString(party, keys) ??
    pickString(account, keys) ??
    pickString(agent, keys) ??
    pickString(tx, keys);

  // Account number: account container first, then party, then flat — NEVER the
  // agent (whose `identification` is the БИК, not the account number).
  const counterpartyAccount =
    pickString(account, ACCOUNT_KEYS) ??
    pickString(party, ACCOUNT_KEYS) ??
    pickString(tx, ["counterpartyAccount", "payerAccount", "receiverAccount", "account", "accountNumber"]);

  // БИК: agent container (its `identification` is the БИК), else flat.
  const counterpartyBankBic =
    pickString(agent, AGENT_BIC_KEYS) ?? pickString(tx, FLAT_BIC_KEYS);

  return {
    externalTxId,
    paymentId: pickString(tx, PAYMENTID_KEYS),
    direction,
    amount: Math.abs(amount),
    amountNat: amountNat === null ? null : Math.abs(amountNat),
    currency,
    postedAt,
    purposeRaw: pickString(tx, PURPOSE_KEYS),
    counterpartyInn: searchIdentity(INN_KEYS),
    counterpartyKpp: searchIdentity(KPP_KEYS),
    counterpartyName: searchIdentity(NAME_KEYS),
    counterpartyAccount,
    counterpartyBankBic,
    status: normalizeStatus(pickString(tx, STATUS_KEYS)),
    raw: input,
  };
}
