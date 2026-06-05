import { describe, expect, it } from "vitest";

import { counterpartyRoleFor, deriveSide } from "./side";

describe("deriveSide", () => {
  it("maps РНС=ЗАКАЗЧИК to owner_cost (counterparty is the wagon owner)", () => {
    expect(deriveSide("zakazchik")).toBe("owner_cost");
  });

  it("maps РНС=ИСПОЛНИТЕЛЬ to client_revenue (counterparty is the client)", () => {
    expect(deriveSide("ispolnitel")).toBe("client_revenue");
  });
});

describe("counterpartyRoleFor", () => {
  it("owner_cost → owner", () => {
    expect(counterpartyRoleFor("owner_cost")).toBe("owner");
  });

  it("client_revenue → client", () => {
    expect(counterpartyRoleFor("client_revenue")).toBe("client");
  });
});
