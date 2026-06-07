import { describe, expect, it } from "vitest";

import { isRecentDoc, notifiedTimeFromPayload } from "./notify-time";
import type { WebhookPayload } from "./webhook";

describe("notifiedTimeFromPayload", () => {
  it("converts JWT iat (seconds) to a Date (ms)", () => {
    const iat = 1_780_000_000; // seconds
    const d = notifiedTimeFromPayload({ webhookType: "incomingPayment", iat } as WebhookPayload);
    expect(d).toBeInstanceOf(Date);
    expect(d?.getTime()).toBe(iat * 1000);
  });

  it("returns null when iat is absent (caller falls back to receipt time)", () => {
    expect(notifiedTimeFromPayload({ webhookType: "incomingPayment" } as WebhookPayload)).toBeNull();
  });

  it("returns null when iat is not a number", () => {
    expect(notifiedTimeFromPayload({ iat: "nope" } as unknown as WebhookPayload)).toBeNull();
  });

  it("returns null for a null payload", () => {
    expect(notifiedTimeFromPayload(null)).toBeNull();
  });
});

describe("isRecentDoc", () => {
  const now = new Date("2026-06-05T12:00:00Z");

  it("accepts a document dated today", () => {
    expect(isRecentDoc(new Date("2026-06-05T00:00:00Z"), { now })).toBe(true);
  });

  it("accepts a document dated yesterday", () => {
    expect(isRecentDoc(new Date("2026-06-04T00:00:00Z"), { now })).toBe(true);
  });

  it("rejects a document several days old (avoids stamping backfilled ops)", () => {
    expect(isRecentDoc(new Date("2026-06-01T00:00:00Z"), { now })).toBe(false);
  });

  it("tolerates a near-future date within the skew window (timezone/midnight)", () => {
    expect(isRecentDoc(new Date("2026-06-06T00:00:00Z"), { now })).toBe(true);
  });

  it("rejects a far-future date", () => {
    expect(isRecentDoc(new Date("2026-06-08T00:00:00Z"), { now })).toBe(false);
  });
});
