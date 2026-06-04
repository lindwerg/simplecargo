import { wcagContrast } from "culori";

// Contrast audit for the design tokens (P0-11, DESIGN_DIRECTION §6 "fix H2").
// Pure + side-effect-free: callers pass the tokens.css source. tokens.css is the
// single source of truth, so we parse it rather than duplicating the OKLCH values
// (no drift). WCAG thresholds: body/money text ≥4.5:1, large/UI/graphical ≥3:1.

export type ThemeName = "dark" | "light";
export type TokenMap = Readonly<Record<string, string>>;
export type PairKind = "body" | "ui";

export interface ContrastResult {
  readonly theme: ThemeName;
  readonly fg: string;
  readonly bg: string;
  readonly ratio: number;
  readonly min: number;
  readonly kind: PairKind;
  readonly required: boolean;
  readonly pass: boolean;
}

const BODY_MIN = 4.5; // body + money text
const UI_MIN = 3.0; // large text, UI boundaries, graphical indicators (status dots)

// Extract solid `--color-*: oklch(...)` declarations from a single theme block.
// Alpha tints (`oklch(... / 0.12)`) are quiet backgrounds, not solid fg/bg pairs,
// so they are skipped. Keys drop the `--color-` prefix (e.g. "text-tertiary").
function parseBlock(block: string): TokenMap {
  const map: Record<string, string> = {};
  const re = /--color-([\w-]+):\s*(oklch\([^)]*\))\s*;/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const value = m[2];
    if (value.includes("/")) continue; // alpha tint — not a solid surface/text color
    map[m[1]] = value;
  }
  return map;
}

function sliceBlock(css: string, selectorMarker: string): string {
  const start = css.indexOf(selectorMarker);
  if (start === -1) return "";
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  return open === -1 || close === -1 ? "" : css.slice(open + 1, close);
}

export function parseThemeTokens(css: string): Record<ThemeName, TokenMap> {
  // Dark lives on the combined `:root,[data-theme="dark"]` selector; light on its own.
  return {
    dark: parseBlock(sliceBlock(css, '[data-theme="dark"]')),
    light: parseBlock(sliceBlock(css, '[data-theme="light"]')),
  };
}

// Required pairs. Surfaces text can land on; thresholds per WCAG role.
const TEXT_SURFACES = ["bg", "surface-1", "surface-2", "surface-3", "surface-inset"] as const;
const CONTENT_SURFACES = ["bg", "surface-1", "surface-2"] as const;
const PRIMARY_SURFACES = ["bg", "surface-1"] as const;

interface PairSpec {
  readonly fg: string;
  readonly bgs: readonly string[];
  readonly kind: PairKind;
}

// Body/money text → 4.5. Status colors are GLYPH dots (graphical) + accent is a
// ring/rail/large-link → 3.0. Disabled (text-disabled, money-zero) is WCAG-exempt
// and reported informationally, never asserted.
const REQUIRED_PAIRS: readonly PairSpec[] = [
  { fg: "text", bgs: TEXT_SURFACES, kind: "body" },
  { fg: "text-secondary", bgs: CONTENT_SURFACES, kind: "body" },
  { fg: "text-tertiary", bgs: PRIMARY_SURFACES, kind: "body" }, // label-caps/captions = small text
  { fg: "money", bgs: CONTENT_SURFACES, kind: "body" },
  { fg: "money-pos", bgs: CONTENT_SURFACES, kind: "body" },
  { fg: "money-neg", bgs: CONTENT_SURFACES, kind: "body" },
  { fg: "text-inverse", bgs: ["accent"], kind: "body" }, // dark label on amber fill (Button)
  { fg: "accent", bgs: PRIMARY_SURFACES, kind: "ui" }, // focus ring / row rail / CTA edge
  { fg: "accent-text", bgs: PRIMARY_SURFACES, kind: "ui" }, // large/bold link label
  { fg: "success", bgs: PRIMARY_SURFACES, kind: "ui" }, // status dots
  { fg: "warn", bgs: PRIMARY_SURFACES, kind: "ui" },
  { fg: "danger", bgs: PRIMARY_SURFACES, kind: "ui" },
  { fg: "info", bgs: PRIMARY_SURFACES, kind: "ui" },
];

const INFORMATIONAL_PAIRS: readonly PairSpec[] = [
  { fg: "text-disabled", bgs: PRIMARY_SURFACES, kind: "body" }, // WCAG-exempt (disabled)
  { fg: "money-zero", bgs: CONTENT_SURFACES, kind: "body" }, // zero = disabled tone, exempt
  { fg: "border-strong", bgs: ["bg"], kind: "ui" }, // hairline divider, decorative
  // shadcn maps --destructive-foreground → text-inverse. The destructive Button
  // variant is unbuilt in P0; when first used, a red fill wants white text, so its
  // foreground likely needs to decouple from the (dark) amber inverse. Surfaced here.
  { fg: "text-inverse", bgs: ["danger"], kind: "body" },
];

function ratioFor(tokens: TokenMap, fg: string, bg: string): number {
  const fgColor = tokens[fg];
  const bgColor = tokens[bg];
  if (!fgColor || !bgColor) {
    throw new Error(`Missing token for contrast pair: ${fg} on ${bg}`);
  }
  return wcagContrast(fgColor, bgColor);
}

function evalPairs(
  theme: ThemeName,
  tokens: TokenMap,
  specs: readonly PairSpec[],
  required: boolean,
): ContrastResult[] {
  const results: ContrastResult[] = [];
  for (const spec of specs) {
    const min = spec.kind === "body" ? BODY_MIN : UI_MIN;
    for (const bg of spec.bgs) {
      const ratio = ratioFor(tokens, spec.fg, bg);
      results.push({ theme, fg: spec.fg, bg, ratio, min, kind: spec.kind, required, pass: ratio >= min });
    }
  }
  return results;
}

export function auditContrast(css: string): ContrastResult[] {
  const themes = parseThemeTokens(css);
  const out: ContrastResult[] = [];
  for (const theme of ["dark", "light"] as const) {
    out.push(...evalPairs(theme, themes[theme], REQUIRED_PAIRS, true));
    out.push(...evalPairs(theme, themes[theme], INFORMATIONAL_PAIRS, false));
  }
  return out;
}

export function requiredFailures(results: readonly ContrastResult[]): ContrastResult[] {
  return results.filter((r) => r.required && !r.pass);
}
