import { describe, expect, it } from "vitest";

import { EXPECTED_MIGRATIONS, isSchemaReady } from "./readiness";

describe("isSchemaReady", () => {
  it("is ready when applied count equals expected", () => {
    // Arrange
    const expected = 3;

    // Act
    const ready = isSchemaReady(3, expected);

    // Assert
    expect(ready).toBe(true);
  });

  it("is not ready when fewer migrations are applied (half-migrated)", () => {
    expect(isSchemaReady(2, 3)).toBe(false);
  });

  it("is not ready when more migrations are applied than the build expects", () => {
    expect(isSchemaReady(4, 3)).toBe(false);
  });

  it("derives a positive expected count from the migration journal", () => {
    expect(EXPECTED_MIGRATIONS).toBeGreaterThan(0);
  });
});
