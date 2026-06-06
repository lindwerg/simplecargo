import crypto from "node:crypto";
import { describe, expect, it } from "vitest";

import { isPaymentEvent, isTokenFresh, verifyJwtRS256, type WebhookPayload } from "./webhook";

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signJwt(payload: object, privateKey: crypto.KeyObject): string {
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${body}`), privateKey);
  return `${header}.${body}.${b64url(sig)}`;
}

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });

describe("verifyJwtRS256", () => {
  it("accepts a correctly signed token and returns the payload", () => {
    const token = signJwt({ webhookType: "incomingPayment", amount: "375000" }, privateKey);
    const { valid, payload } = verifyJwtRS256(token, publicKey);
    expect(valid).toBe(true);
    expect(payload?.webhookType).toBe("incomingPayment");
  });

  it("rejects a tampered payload", () => {
    const token = signJwt({ webhookType: "incomingPayment" }, privateKey);
    const [h, , s] = token.split(".");
    const forged = `${h}.${b64url(JSON.stringify({ webhookType: "hacked" }))}.${s}`;
    expect(verifyJwtRS256(forged, publicKey).valid).toBe(false);
  });

  it("rejects a wrong-key signature", () => {
    const other = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const token = signJwt({ webhookType: "incomingPayment" }, other.privateKey);
    expect(verifyJwtRS256(token, publicKey).valid).toBe(false);
  });

  it("rejects a malformed token", () => {
    expect(verifyJwtRS256("not-a-jwt", publicKey).valid).toBe(false);
  });
});

describe("isPaymentEvent", () => {
  it("matches incoming/outgoing/SBP payment events", () => {
    expect(isPaymentEvent({ webhookType: "incomingPayment" } as WebhookPayload)).toBe(true);
    expect(isPaymentEvent({ webhookType: "outgoingPayment" } as WebhookPayload)).toBe(true);
    expect(isPaymentEvent({ webhookType: "incomingSbpPayment" } as WebhookPayload)).toBe(true);
  });

  it("ignores unrelated events and null", () => {
    expect(isPaymentEvent({ webhookType: "accountUpdate" } as WebhookPayload)).toBe(false);
    expect(isPaymentEvent(null)).toBe(false);
  });
});

describe("isTokenFresh", () => {
  const now = 1_000_000;

  it("passes a token without iat/exp (can't judge — signature still gates)", () => {
    expect(isTokenFresh({ webhookType: "incomingPayment" } as WebhookPayload, { nowSec: now })).toBe(true);
  });

  it("passes a recent iat", () => {
    expect(isTokenFresh({ iat: now - 10 } as WebhookPayload, { nowSec: now })).toBe(true);
  });

  it("rejects a too-old iat (replay)", () => {
    expect(isTokenFresh({ iat: now - 10_000 } as WebhookPayload, { nowSec: now, maxAgeSec: 300 })).toBe(false);
  });

  it("rejects an expired exp", () => {
    expect(isTokenFresh({ exp: now - 1000 } as WebhookPayload, { nowSec: now })).toBe(false);
  });

  it("rejects null", () => {
    expect(isTokenFresh(null)).toBe(false);
  });
});
