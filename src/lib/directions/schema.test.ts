import { describe, expect, it } from "vitest";

import {
  clientBindingSchema,
  createDirectionSchema,
  ownerBindingSchema,
  transitionDirectionSchema,
  updateDirectionSchema,
} from "./schema";

describe("createDirectionSchema", () => {
  it("accepts a minimal draft: route only, null rates, no client (D16)", () => {
    const parsed = createDirectionSchema.safeParse({
      stationOriginRaw: "Асбест",
      stationDestRaw: "Голышманово",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.client).toBeUndefined();
      expect(parsed.data.rateClient).toBeUndefined();
      expect(parsed.data.ratesConfirmed).toBe(false);
      expect(parsed.data.rateModel).toBe("per_wagon_trip");
    }
  });

  it("rejects an empty origin/destination", () => {
    expect(createDirectionSchema.safeParse({ stationOriginRaw: "", stationDestRaw: "X" }).success).toBe(
      false,
    );
    expect(createDirectionSchema.safeParse({ stationOriginRaw: "X", stationDestRaw: "" }).success).toBe(
      false,
    );
  });

  it("coerces a string rate and rejects ≤0", () => {
    const ok = createDirectionSchema.safeParse({
      stationOriginRaw: "A",
      stationDestRaw: "B",
      rateClient: "2800",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.rateClient).toBe(2800);

    expect(
      createDirectionSchema.safeParse({ stationOriginRaw: "A", stationDestRaw: "B", rateClient: "0" })
        .success,
    ).toBe(false);
  });

  it("accepts an existing-id or inline-create counterparty", () => {
    const byId = createDirectionSchema.safeParse({
      stationOriginRaw: "A",
      stationDestRaw: "B",
      owner: { id: "11111111-1111-4111-8111-111111111111" },
    });
    expect(byId.success).toBe(true);

    const inline = createDirectionSchema.safeParse({
      stationOriginRaw: "A",
      stationDestRaw: "B",
      client: { name: "ООО «Вектор»" },
    });
    expect(inline.success).toBe(true);
  });
});

describe("updateDirectionSchema", () => {
  it("accepts a single-field patch", () => {
    const parsed = updateDirectionSchema.safeParse({ cargoName: "щебень" });
    expect(parsed.success).toBe(true);
  });
});

describe("transitionDirectionSchema", () => {
  it("rejects an out-of-enum target status", () => {
    expect(transitionDirectionSchema.safeParse({ to: "archived" }).success).toBe(false);
    expect(transitionDirectionSchema.safeParse({ to: "active" }).success).toBe(true);
  });
});

describe("binding schemas", () => {
  it("lowercases the owner inbound mailbox and validates the address", () => {
    const parsed = ownerBindingSchema.safeParse({
      owner: { name: "Вагон-Сервис" },
      inboundMailbox: "Owner@Firm.RU",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.inboundMailbox).toBe("owner@firm.ru");

    expect(
      ownerBindingSchema.safeParse({ owner: { name: "X" }, inboundMailbox: "not-an-email" }).success,
    ).toBe(false);
  });

  it("validates the client forward email", () => {
    expect(
      clientBindingSchema.safeParse({
        client: { id: "11111111-1111-4111-8111-111111111111" },
        forwardToEmail: "client@firm.ru",
      }).success,
    ).toBe(true);
    expect(
      clientBindingSchema.safeParse({ client: { name: "X" }, forwardToEmail: "bad" }).success,
    ).toBe(false);
  });
});
