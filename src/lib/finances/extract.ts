// Tolerant extractors for the Tochka OBP-style envelopes (`{ Data: { ... } }`).
// Pure — no HTTP/DB — so the envelope handling is unit-tested independently of
// the network. Live shape verified 2026-06 against /open-banking/v1.0.

type Raw = Record<string, unknown>;

function asRecord(v: unknown): Raw | null {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null;
}

function asArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (v !== null && v !== undefined) return [v]; // some envelopes return a single object
  return [];
}

function str(obj: Raw | null, key: string): string | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v === "string" && v.trim() !== "") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

function num(obj: Raw | null, key: string): number | null {
  if (!obj) return null;
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export interface ExtractedAccount {
  externalAccountId: string;
  customerCode: string | null;
  currency: string;
  status: string; // normalized: active|closed
  maskedNumber: string | null;
  title: string | null;
}

function maskAccountNumber(identification: string | null): string | null {
  if (!identification) return null;
  if (identification.length <= 6) return identification;
  return `${identification.slice(0, 4)}…${identification.slice(-4)}`;
}

/** Extract company accounts from a GET /accounts response. */
export function extractAccounts(response: unknown): ExtractedAccount[] {
  const root = asRecord(response);
  const data = asRecord(root?.Data) ?? root;
  const list = asArray(data?.Account ?? data?.accounts);

  const out: ExtractedAccount[] = [];
  for (const item of list) {
    const acc = asRecord(item);
    const externalAccountId = str(acc, "accountId");
    if (!externalAccountId) continue;
    const details = asRecord(asArray(acc?.accountDetails)[0]);
    const rawStatus = (str(acc, "status") ?? "").toLowerCase();
    out.push({
      externalAccountId,
      customerCode: str(acc, "customerCode"),
      currency: str(acc, "currency") ?? "RUB",
      status: rawStatus === "" || rawStatus.startsWith("enab") || rawStatus === "active"
        ? "active"
        : "closed",
      maskedNumber: maskAccountNumber(str(details, "identification")),
      title: str(details, "name"),
    });
  }
  return out;
}

export interface ExtractedStatement {
  accountId: string | null;
  statementId: string | null;
  status: string | null;
  startDateBalance: number | null;
  endDateBalance: number | null;
  endDateTime: string | null;
  transactions: unknown[];
}

/** Normalize a statement (init or fetched) into a flat shape. `Data.Statement`
 *  may be a single object or an array; transactions live under `Transaction`. */
export function extractStatements(response: unknown): ExtractedStatement[] {
  const root = asRecord(response);
  const data = asRecord(root?.Data) ?? root;
  const list = asArray(data?.Statement ?? data?.statement ?? data?.statements);

  return list.map((item) => {
    const st = asRecord(item);
    return {
      accountId: str(st, "accountId"),
      statementId: str(st, "statementId") ?? str(st, "id"),
      status: str(st, "status"),
      startDateBalance: num(st, "startDateBalance"),
      endDateBalance: num(st, "endDateBalance"),
      endDateTime: str(st, "endDateTime"),
      transactions: asArray(st?.Transaction ?? st?.transactions),
    };
  });
}

const READY = /ready|booked|done|complete/i;

/** Statement generation is async; this tells the poller when to stop. */
export function isStatementReady(status: string | null): boolean {
  return status !== null && READY.test(status);
}
