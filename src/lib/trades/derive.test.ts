import { describe, expect, it } from "vitest";

import { deriveDealType } from "./derive";

describe("deriveDealType", () => {
  it("returns null for an empty deal", () => {
    expect(deriveDealType(false, false)).toBeNull();
  });

  it("returns stone_only when only stone lines exist", () => {
    expect(deriveDealType(true, false)).toBe("stone_only");
  });

  it("returns wagons_only when only transport directions exist", () => {
    expect(deriveDealType(false, true)).toBe("wagons_only");
  });

  it("returns stone_with_transport when both are present", () => {
    expect(deriveDealType(true, true)).toBe("stone_with_transport");
  });
});
