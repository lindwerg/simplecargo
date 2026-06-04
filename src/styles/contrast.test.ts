import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { auditContrast, requiredFailures } from "./contrast-audit";

// Contrast gate (P0-11, DESIGN_DIRECTION §6). Runs in CI via `pnpm test`. Parses
// the real tokens.css so a token edit that drops any body/money pair below 4.5:1
// or any large/UI pair below 3:1 — in either theme — fails the build.
const css = readFileSync(fileURLToPath(new URL("./tokens.css", import.meta.url)), "utf8");
const results = auditContrast(css);

describe("token contrast (WCAG AA, both themes)", () => {
  it("has no required-pair failures", () => {
    const failures = requiredFailures(results);
    const detail = failures
      .map((f) => `${f.theme} ${f.fg} on ${f.bg}: ${f.ratio.toFixed(2)}:1 (min ${f.min})`)
      .join("\n");
    expect(failures, `\n${detail}`).toHaveLength(0);
  });

  it("audits both themes", () => {
    expect(new Set(results.map((r) => r.theme))).toEqual(new Set(["dark", "light"]));
  });

  it("checks primary text on every surface at 4.5:1", () => {
    const textPairs = results.filter((r) => r.fg === "text" && r.required);
    expect(textPairs.length).toBeGreaterThanOrEqual(10); // 5 surfaces × 2 themes
    expect(textPairs.every((r) => r.pass)).toBe(true);
  });
});
