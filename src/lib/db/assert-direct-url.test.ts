import { describe, expect, it } from "vitest";

import { assertDirectMigrationUrl } from "./assert-direct-url";
import { envSchema } from "@/lib/env-schema";

describe("assertDirectMigrationUrl", () => {
  it("returns a direct Postgres URL unchanged", () => {
    // Arrange
    const url = "postgres://user:pw@db.railway.internal:5432/railway";

    // Act
    const result = assertDirectMigrationUrl(url);

    // Assert
    expect(result).toBe(url);
  });

  it("throws when the URL targets a pgbouncer pooler", () => {
    expect(() =>
      assertDirectMigrationUrl("postgres://user:pw@pgbouncer.railway.internal:6432/railway"),
    ).toThrow(/pooler/i);
  });

  it("throws when the host contains 'pooler'", () => {
    expect(() =>
      assertDirectMigrationUrl("postgres://user:pw@db-pooler.example.com:5432/railway"),
    ).toThrow(/pooler/i);
  });

  it("throws when the URL is missing", () => {
    expect(() => assertDirectMigrationUrl(undefined)).toThrow(/required/i);
  });
});

describe("envSchema", () => {
  it("fails with readable issues when required vars are missing", () => {
    // Act
    const parsed = envSchema.safeParse({});

    // Assert
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const keys = parsed.error.issues.map((i) => i.path.join("."));
      expect(keys).toContain("DATABASE_URL");
      expect(keys).toContain("DATABASE_URL_DIRECT");
      expect(keys).toContain("BETTER_AUTH_SECRET");
    }
  });

  it("accepts a complete Phase-0 environment and defaults NODE_ENV/APP_TZ_DISPLAY", () => {
    // Act
    const parsed = envSchema.safeParse({
      DATABASE_URL: "postgres://u:p@host:5432/db",
      DATABASE_URL_DIRECT: "postgres://u:p@host:5432/db",
      BETTER_AUTH_SECRET: "x".repeat(64),
      BETTER_AUTH_URL: "https://web-production.up.railway.app",
    });

    // Assert
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.NODE_ENV).toBe("development");
      expect(parsed.data.APP_TZ_DISPLAY).toBe("Europe/Moscow");
    }
  });
});
