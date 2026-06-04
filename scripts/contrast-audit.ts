import { readFileSync } from "node:fs";
import path from "node:path";

import { auditContrast, requiredFailures } from "../src/styles/contrast-audit";

// Prints the full WCAG contrast table for both themes (`pnpm contrast:audit`).
// The hard gate lives in src/styles/contrast.test.ts (runs in CI).
const css = readFileSync(path.join(process.cwd(), "src", "styles", "tokens.css"), "utf8");
const results = auditContrast(css);

for (const theme of ["dark", "light"] as const) {
  // eslint-disable-next-line no-console
  console.log(`\n── ${theme.toUpperCase()} ───────────────────────────────`);
  for (const r of results.filter((x) => x.theme === theme)) {
    const tag = r.required ? "" : " (info)";
    const mark = r.pass ? "✓" : "✗";
    // eslint-disable-next-line no-console
    console.log(
      `${mark} ${r.fg.padEnd(16)} on ${r.bg.padEnd(14)} ${r.ratio.toFixed(2)}:1  (min ${r.min})${tag}`,
    );
  }
}

const failures = requiredFailures(results);
// eslint-disable-next-line no-console
console.log(
  `\n${failures.length === 0 ? "✓ all required pairs pass" : `✗ ${failures.length} required failure(s)`}`,
);
process.exit(failures.length === 0 ? 0 : 1);
