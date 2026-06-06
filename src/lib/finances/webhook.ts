import crypto from "node:crypto";

// Tochka webhook bodies are a signed JWT (RS256, text/plain). We verify the
// signature with Tochka's published public key, then read the event payload.

export interface WebhookPayload {
  webhookType?: string;
  event?: string;
  [k: string]: unknown;
}

function b64urlToBuffer(segment: string): Buffer {
  return Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Verify an RS256 JWT against a public key (PEM string or KeyObject). */
export function verifyJwtRS256(
  token: string,
  key: crypto.KeyObject | string,
): { valid: boolean; payload: WebhookPayload | null } {
  const parts = token.trim().split(".");
  if (parts.length !== 3) return { valid: false, payload: null };
  const [header, payloadSeg, signature] = parts;

  let valid = false;
  try {
    valid = crypto.verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payloadSeg}`),
      key,
      b64urlToBuffer(signature),
    );
  } catch {
    valid = false;
  }

  let payload: WebhookPayload | null = null;
  try {
    payload = JSON.parse(b64urlToBuffer(payloadSeg).toString("utf8")) as WebhookPayload;
  } catch {
    payload = null;
  }
  return { valid, payload };
}

// Module-level cache for the public key (it rarely rotates).
let cachedKey: crypto.KeyObject | string | null = null;

function parseKeyMaterial(text: string): crypto.KeyObject | string {
  const trimmed = text.trim();
  if (trimmed.startsWith("-----BEGIN")) return trimmed; // PEM
  // JSON: a single JWK or a JWKS {keys:[...]}.
  const json = JSON.parse(trimmed) as { keys?: unknown[]; kty?: string };
  const jwk = Array.isArray(json.keys) ? (json.keys[0] as crypto.JsonWebKey) : (json as crypto.JsonWebKey);
  return crypto.createPublicKey({ key: jwk, format: "jwk" });
}

const DEFAULT_PUBKEY_URL = "https://enter.tochka.com/doc/openapi/static/keys/public";

export async function fetchTochkaPublicKey(): Promise<crypto.KeyObject | string> {
  if (cachedKey) return cachedKey;
  const url = process.env.TOCHKA_WEBHOOK_PUBKEY_URL ?? DEFAULT_PUBKEY_URL;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`pubkey fetch failed: ${res.status}`);
  cachedKey = parseKeyMaterial(await res.text());
  return cachedKey;
}

const PAYMENT_EVENTS = /incomingpayment|outgoingpayment|incomingsbppayment/i;

/** Is this webhook a money-movement event we should react to with a re-sync? */
export function isPaymentEvent(payload: WebhookPayload | null): boolean {
  if (!payload) return false;
  const type = String(payload.webhookType ?? payload.event ?? "");
  return PAYMENT_EVENTS.test(type);
}
