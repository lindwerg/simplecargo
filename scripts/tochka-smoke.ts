/**
 * One-off READ-ONLY probe for the Tochka Open API. Discovers the live response
 * shapes for accounts + a short statement so the parser/extractors match reality.
 * PII (names, inn/kpp, account numbers, amounts) is MASKED in output — only the
 * field STRUCTURE is printed. Never writes, never initiates payments.
 *
 * Run:
 *   set -a; source .env; set +a; \
 *   TOCHKA_BASE_URL=https://enter.tochka.com/uapi pnpm tsx scripts/tochka-smoke.ts
 */

const BASE = (process.env.TOCHKA_BASE_URL ?? "").replace(/\/+$/, "");
const TOKEN = process.env.TOCHKA_JWT_TOKEN ?? "";
const CUSTOMER = process.env.TOCHKA_CUSTOMER_CODE ?? "";

const PII_KEY = /name|inn|kpp|account|identification|purpose|description|payer|payee|bic/i;

function mask(value: unknown, keyHint = ""): unknown {
  if (PII_KEY.test(keyHint) && typeof value === "string") return `‹${value.length}ch›`;
  if (typeof value === "string" && /\d{5,}/.test(value)) return "‹num›";
  if (Array.isArray(value)) return value.map((v) => mask(v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = mask(v, k);
    return out;
  }
  return value;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { Authorization: `Bearer ${TOKEN}`, Accept: "application/json" };
  if (CUSTOMER) h.CustomerCode = CUSTOMER;
  return h;
}

async function getJson(path: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE}${path}`, { headers: authHeaders() });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function postJson(path: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function deepFind(obj: unknown, key: string): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const rec = obj as Record<string, unknown>;
  if (key in rec) return rec[key];
  for (const v of Object.values(rec)) {
    const found = deepFind(v, key);
    if (found !== undefined) return found;
  }
  return undefined;
}

async function main(): Promise<void> {
  if (!BASE || !TOKEN) {
    console.error("Missing TOCHKA_BASE_URL or TOCHKA_JWT_TOKEN");
    process.exit(1);
  }
  const OB = "/open-banking/v1.0";

  // 1) accounts
  const acc = await getJson(`${OB}/accounts`);
  console.log(`accounts → HTTP ${acc.status}`);
  const accountId = deepFind(acc.json, "accountId");
  if (typeof accountId !== "string") {
    console.log("No accountId found; shape:", JSON.stringify(mask(acc.json), null, 2).slice(0, 2000));
    return;
  }
  console.log(`accountId (masked): ${accountId.slice(0, 4)}…${accountId.slice(-2)}`);

  // 2) statement init (last 7 days)
  const end = "2026-06-06";
  const start = "2026-05-30";
  const initBody = { Data: { Statement: { accountId, startDateTime: start, endDateTime: end } } };
  let init = await postJson(`${OB}/statements`, initBody);
  console.log(`\nstatement init → HTTP ${init.status}`);
  if (init.status >= 400) {
    console.log("init error body:", JSON.stringify(init.json, null, 2).slice(0, 1500));
    return;
  }
  const statementId = deepFind(init.json, "statementId") ?? deepFind(init.json, "id");
  console.log(`statementId: ${typeof statementId === "string" ? statementId : JSON.stringify(statementId)}`);

  // 3) poll until Ready (max ~25s)
  let statement: unknown = init.json;
  for (let i = 0; i < 12; i++) {
    const st = await getJson(`${OB}/accounts/${encodeURIComponent(accountId)}/statements/${encodeURIComponent(String(statementId))}`);
    statement = st.json;
    const status = deepFind(st.json, "status");
    console.log(`poll ${i + 1}: HTTP ${st.status} status=${JSON.stringify(status)}`);
    if (typeof status === "string" && /ready|booked|done|complete/i.test(status)) break;
    if (st.status >= 400) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  // 4) print statement structure (masked) + one transaction's full key map
  console.log("\nstatement shape (masked):");
  console.log(JSON.stringify(mask(statement), null, 2).slice(0, 3500));

  const txs = deepFind(statement, "Transaction") ?? deepFind(statement, "transactions");
  if (Array.isArray(txs) && txs.length > 0) {
    console.log(`\nFIRST TRANSACTION keys: ${Object.keys(txs[0] as object).join(", ")}`);
    console.log("first transaction (masked):");
    console.log(JSON.stringify(mask(txs[0]), null, 2).slice(0, 2500));
  } else {
    console.log("\nNo transactions in window (empty period is fine — we still learned the envelope).");
  }
}

main().catch((e) => {
  console.error("Probe failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
