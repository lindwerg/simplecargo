import { describe, expect, it } from "vitest";

import { canDecideQuote, parseQuoteDraft, planQuoteUpsert } from "./quote-logic";

describe("canDecideQuote", () => {
  it("allows accepting a responded quote", () => {
    expect(canDecideQuote("responded", "accepted")).toEqual({ ok: true, noop: false });
  });

  it("allows declining a responded quote", () => {
    expect(canDecideQuote("responded", "declined")).toEqual({ ok: true, noop: false });
  });

  it("is idempotent when the decision is already applied", () => {
    expect(canDecideQuote("accepted", "accepted")).toEqual({ ok: true, noop: true });
    expect(canDecideQuote("declined", "declined")).toEqual({ ok: true, noop: true });
  });

  it("rejects deciding on a polled quote (carrier has not answered)", () => {
    const res = canDecideQuote("polled", "accepted");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("не ответил");
  });

  it("rejects flipping an already-decided quote", () => {
    const res = canDecideQuote("accepted", "declined");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain("accepted");
  });

  it("rejects deciding on an expired quote", () => {
    expect(canDecideQuote("expired", "accepted").ok).toBe(false);
  });
});

describe("planQuoteUpsert (повторная отправка RFQ не плодит дубли)", () => {
  it("inserts when no row exists for the pair", () => {
    expect(planQuoteUpsert(["l1", "l2"], [], { updatableStatuses: ["polled"] })).toEqual({
      updateIds: [],
      insertLineIds: ["l1", "l2"],
    });
  });

  it("updates the existing polled row instead of inserting a duplicate", () => {
    const plan = planQuoteUpsert(
      ["l1", "l2"],
      [{ id: "q1", requestLineId: "l1", status: "polled" }],
      { updatableStatuses: ["polled"] },
    );
    expect(plan).toEqual({ updateIds: ["q1"], insertLineIds: ["l2"] });
  });

  it("leaves decided rows alone — no update, no duplicate insert", () => {
    const plan = planQuoteUpsert(
      ["l1"],
      [{ id: "q1", requestLineId: "l1", status: "accepted" }],
      { updatableStatuses: ["polled"] },
    );
    expect(plan).toEqual({ updateIds: [], insertLineIds: [] });
  });

  it("updates responded rows too when manual attach allows it", () => {
    const plan = planQuoteUpsert(
      ["l1"],
      [{ id: "q1", requestLineId: "l1", status: "responded" }],
      { updatableStatuses: ["polled", "responded"] },
    );
    expect(plan).toEqual({ updateIds: ["q1"], insertLineIds: [] });
  });

  it("updates every matching row when a line has several polled rows", () => {
    const plan = planQuoteUpsert(
      ["l1"],
      [
        { id: "q1", requestLineId: "l1", status: "polled" },
        { id: "q2", requestLineId: "l1", status: "polled" },
      ],
      { updatableStatuses: ["polled"] },
    );
    expect(plan).toEqual({ updateIds: ["q1", "q2"], insertLineIds: [] });
  });
});

describe("parseQuoteDraft", () => {
  it("extracts the quote saved by the orchestrator", () => {
    const draft = parseQuoteDraft({
      quote: { costPerWagon: 1900, wagonsOffered: 10, validTo: "2026-07-01", currency: "RUB" },
      from: "carrier@example.com",
      subject: "Re: Запрос ставок",
    });
    expect(draft).toEqual({
      costPerWagon: 1900,
      wagonsOffered: 10,
      validTo: "2026-07-01",
      from: "carrier@example.com",
    });
  });

  it("tolerates a quote with nulls", () => {
    const draft = parseQuoteDraft({ quote: { costPerWagon: null }, from: null });
    expect(draft).toEqual({ costPerWagon: null, wagonsOffered: null, validTo: null, from: null });
  });

  it("returns null when there is no quote object", () => {
    expect(parseQuoteDraft(null)).toBeNull();
    expect(parseQuoteDraft("str")).toBeNull();
    expect(parseQuoteDraft({})).toBeNull();
    expect(parseQuoteDraft({ quote: "not-an-object" })).toBeNull();
  });
});
