# SimpleCargo — Design Direction & System (DEFINITIVE)

> **Status:** RATIFIED. This is the single source of truth for the visual system, tokens, and component contracts.
> **Supersedes:** the `visual-direction` and `component-system` findings where they conflict. Per the `design-perf` adversarial review:
> - **Token source of truth = THIS doc** (folds in `visual-direction`'s OKLCH dark-default system).
> - `component-system §0` tokens are **demoted to component-anatomy reference only** — palette/fonts here win (fix **C1**).
> - One mono family: **Geist Mono** (fallback IBM Plex Mono) (fix **C1**, ADR-D20).
> - Money numerals are **near-neutral, not amber** — amber is reserved for the act-here accent/CTA (fix **H2**).
> - Entities/funnel grain follow `funnel-integration` + `requests-ia`; VAT is **per-row data, default 22.00**, never a hardcoded constant (fix **L1**, **C2**).
> **Stack target:** Next.js 15 App Router · Tailwind v4 (`@theme` mapped to these CSS vars) · shadcn primitives re-skinned to these tokens.

---

## 1. The Direction (one decision)

**Dark-precision freight terminal: Swiss grid discipline × Linear/Vercel product polish, money-first.**

This is an internal ops tool stared at for hours. A calm, low-chroma dark surface reduces eye fatigue and lets **one** amber "act here" voltage plus a disciplined semantic palette do all the signalling. The UI reads like a logistics control board: hairline-ruled tables, ranging tabular money, the **funnel itself as the hero** (Запросы → Направления → Отчётность), motion that is compositor-only and fast.

**Dark is the default** — the deliberate, product-specific exception the ECC "do not default to dark" rule allows for: a long-session, data-dense, low-ambient control surface. **A light theme ships as a first-class peer** (full token set below) for daytime, printing, and accessibility — not an afterthought.

### Why this is not AI-slop
The product has one opinionated point of view (a freight control board organized around a literal funnel spine), not a sea of equal cards. Speed is baked into the aesthetic: hairlines and flat surfaces are cheap to paint; the accent is one variable; every motion is `transform`/`opacity`/`clip-path` only.

### Named references
| # | Reference | What we take | What we reject |
|---|---|---|---|
| 1 | **Linear** | Monochrome base + a single high-voltage accent used surgically; ~6px radii; storm-cloud secondary text on dark | Their lime accent; over-glassmorphism |
| 2 | **Vercel / Geist** | Geist Mono for IDs/numbers; hairline grid as structure not decoration; systematic spacing | Pure black-on-white sterility |
| 3 | **Stripe Dashboard** | Tabular-number alignment as first-class craft; money never wobbles; F-pattern density | Generic SaaS card sea |
| 4 | **Swiss / International editorial** (Müller-Brockmann) | Strict baseline grid, scale-contrast hierarchy, restraint, left-aligned ranging | Decoration for its own sake |
| 5 | **IBM Plex Mono** | Mono fallback — generous x-height, unambiguous `0/O`, `1/l` | As primary headline use (slightly utilitarian) |

---

## 2. `tokens.css` (ready to paste)

`src/styles/tokens.css`

```css
/* SimpleCargo design tokens. OKLCH. Dark = default; light = first-class peer. */

:root,
[data-theme="dark"] {
  color-scheme: dark;

  /* ── Surface ladder (depth via lightness, near-zero chroma) ── */
  --color-bg:             oklch(12% 0.012 260);  /* app canvas (locked base) */
  --color-surface-1:      oklch(15% 0.013 260);  /* panels, table bg, sticky headers */
  --color-surface-2:      oklch(18% 0.014 260);  /* cards, raised rows */
  --color-surface-3:      oklch(22% 0.015 260);  /* popovers, menus, modals */
  --color-surface-inset:  oklch(10% 0.012 260);  /* wells, inputs, sunken */

  /* ── Borders / hairlines (the Swiss ruling) ── */
  --color-border:         oklch(28% 0.012 260);  /* default hairline / table frame */
  --color-border-strong:  oklch(36% 0.014 260);  /* section dividers */
  --color-border-subtle:  oklch(22% 0.010 260);  /* inner row rules */

  /* ── Text ladder ── */
  --color-text:           oklch(96% 0.004 260);  /* primary — money numerals live here */
  --color-text-secondary: oklch(74% 0.010 260);  /* labels (storm-cloud) */
  --color-text-tertiary:  oklch(58% 0.012 260);  /* captions, placeholders, caps-labels */
  --color-text-disabled:  oklch(45% 0.012 260);
  --color-text-inverse:   oklch(15% 0.013 260);  /* on amber fills — AA dark text */

  /* ── Accent: amber "act here" voltage (locked). NOT used for money text. ── */
  --color-accent:         oklch(78% 0.155 75);   /* primary action, focus ring, row rail */
  --color-accent-hover:   oklch(83% 0.160 75);
  --color-accent-active:  oklch(72% 0.150 75);
  --color-accent-quiet:   oklch(78% 0.155 75 / 0.12); /* selected row tint */
  --color-accent-text:    oklch(82% 0.150 75);   /* accent-as-text on dark only (links/CTA label) */

  /* ── Semantic status ── */
  --color-success:        oklch(72% 0.165 150);  /* won / paid / live */
  --color-success-quiet:  oklch(72% 0.165 150 / 0.14);
  --color-warn:           oklch(80% 0.150 85);   /* sourcing / awaiting */
  --color-warn-quiet:     oklch(80% 0.150 85 / 0.14);
  --color-danger:         oklch(64% 0.205 27);   /* lost / negative margin / SLA breach */
  --color-danger-quiet:   oklch(64% 0.205 27 / 0.15);
  --color-info:           oklch(70% 0.130 240);  /* quoted / in-transit */
  --color-info-quiet:     oklch(70% 0.130 240 / 0.14);

  /* ── Money semantics (text color only — neutral base, semantic on sign) ── */
  --color-money:          oklch(96% 0.004 260);  /* default money = primary text (near-neutral) */
  --color-money-pos:      oklch(72% 0.165 150);  /* positive margin */
  --color-money-neg:      oklch(64% 0.205 27);   /* negative margin */
  --color-money-zero:     oklch(45% 0.012 260);  /* zero = disabled */

  /* ── Data-viz ramp (coverage %, sequential, dark-safe) ── */
  --viz-1: oklch(70% 0.130 240); --viz-2: oklch(72% 0.120 200);
  --viz-3: oklch(74% 0.130 160); --viz-4: oklch(78% 0.150 110);
  --viz-5: oklch(78% 0.155 75);

  /* ── Elevation (flat-first; ring does the work; real shadow only when floating) ── */
  --elev-0: none;
  --elev-1: 0 1px 0 0 var(--color-border-subtle);
  --elev-2: 0 1px 2px -1px oklch(0% 0 0 / 0.5), 0 0 0 1px var(--color-border);
  --elev-3: 0 8px 24px -8px oklch(0% 0 0 / 0.55), 0 0 0 1px var(--color-border-strong);
  --ring-focus: 0 0 0 2px var(--color-bg), 0 0 0 4px var(--color-accent);
}

[data-theme="light"] {
  color-scheme: light;
  --color-bg:             oklch(98.5% 0.003 260);
  --color-surface-1:      oklch(100% 0 0);
  --color-surface-2:      oklch(98% 0.004 260);
  --color-surface-3:      oklch(100% 0 0);
  --color-surface-inset:  oklch(96% 0.005 260);

  --color-border:         oklch(90% 0.006 260);
  --color-border-strong:  oklch(83% 0.008 260);
  --color-border-subtle:  oklch(93% 0.005 260);

  --color-text:           oklch(22% 0.012 260);
  --color-text-secondary: oklch(45% 0.012 260);
  --color-text-tertiary:  oklch(58% 0.012 260);
  --color-text-disabled:  oklch(72% 0.010 260);
  --color-text-inverse:   oklch(99% 0.003 260);

  /* darker amber for AA when used as a fill/CTA with dark text on it */
  --color-accent:         oklch(62% 0.165 70);
  --color-accent-hover:   oklch(57% 0.165 70);
  --color-accent-active:  oklch(52% 0.160 70);
  --color-accent-quiet:   oklch(62% 0.165 70 / 0.12);
  /* accent-as-text on white is a known AA risk → only for large/bold link labels */
  --color-accent-text:    oklch(48% 0.150 70);

  --color-success:        oklch(52% 0.155 150);
  --color-success-quiet:  oklch(52% 0.155 150 / 0.12);
  --color-warn:           oklch(58% 0.130 75);   /* darkened: amber-on-white needs ≥4.5:1 */
  --color-warn-quiet:     oklch(58% 0.130 75 / 0.14);
  --color-danger:         oklch(52% 0.210 27);
  --color-danger-quiet:   oklch(52% 0.210 27 / 0.12);
  --color-info:           oklch(52% 0.140 245);
  --color-info-quiet:     oklch(52% 0.140 245 / 0.12);

  --color-money:          oklch(22% 0.012 260);
  --color-money-pos:      oklch(48% 0.150 150);
  --color-money-neg:      oklch(50% 0.210 27);
  --color-money-zero:     oklch(72% 0.010 260);

  --viz-1: oklch(52% 0.140 245); --viz-2: oklch(55% 0.125 200);
  --viz-3: oklch(55% 0.135 160); --viz-4: oklch(60% 0.150 110);
  --viz-5: oklch(62% 0.165 70);

  --elev-1: 0 1px 0 0 var(--color-border-subtle);
  --elev-2: 0 1px 2px -1px oklch(0% 0 0 / 0.10), 0 0 0 1px var(--color-border);
  --elev-3: 0 12px 28px -10px oklch(0% 0 0 / 0.16), 0 0 0 1px var(--color-border-strong);
  --ring-focus: 0 0 0 2px var(--color-surface-1), 0 0 0 4px var(--color-accent);
}

:root {
  /* ── Typography: exactly 2 families (font budget). Inter (UI) + Geist Mono (numbers/IDs) ── */
  --font-sans: "Inter", "Inter var", system-ui, -apple-system, "Segoe UI", sans-serif;
  --font-mono: "Geist Mono", "IBM Plex Mono", ui-monospace, "SF Mono", monospace;

  /* Type scale — Swiss contrast: tight body, dramatic display jump */
  --text-2xs:     0.6875rem;  /* 11px micro caps-labels */
  --text-xs:      0.75rem;    /* 12px table meta */
  --text-sm:      0.8125rem;  /* 13px dense body */
  --text-base:    0.875rem;   /* 14px body */
  --text-md:      1rem;       /* 16px */
  --text-lg:      clamp(1.125rem, 1.05rem + 0.4vw, 1.375rem);  /* section title */
  --text-xl:      clamp(1.5rem,  1.2rem  + 1.2vw, 2.25rem);    /* page / big KPI */
  --text-display: clamp(2.25rem, 1.4rem + 3.4vw, 4rem);        /* funnel hero number */

  --leading-tight: 1.15; --leading-snug: 1.3; --leading-base: 1.5;
  --tracking-tight: -0.011em;   /* Inter headings */
  --tracking-caps:   0.06em;    /* uppercase micro-labels */
  --weight-regular: 430; --weight-medium: 530; --weight-semibold: 620; --weight-bold: 720;

  /* ── Spacing — 4px base, intentional rhythm (NOT uniform padding everywhere) ── */
  --space-px: 1px;
  --space-1: 0.25rem; --space-2: 0.5rem;  --space-3: 0.75rem; --space-4: 1rem;
  --space-5: 1.25rem; --space-6: 1.5rem;  --space-8: 2rem;    --space-10: 2.5rem;
  --space-12: 3rem;   --space-16: 4rem;
  --space-gutter:  clamp(1rem, 0.5rem + 2vw, 2rem);    /* page side gutter */
  --space-section: clamp(2.5rem, 1.5rem + 3vw, 5rem);  /* major band rhythm */
  --row-h: 2.5rem;  --row-h-dense: 2rem;               /* table row heights */

  /* ── Radii — small + consistent (Linear-ish family), scales by element class ── */
  --radius-xs: 3px; --radius-sm: 5px; --radius-md: 7px; --radius-lg: 10px;
  --radius-xl: 14px; --radius-pill: 999px;

  /* ── Motion — compositor-only, fast by default ── */
  --duration-fast: 120ms; --duration-normal: 200ms; --duration-slow: 320ms;
  --ease-out-quad: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);

  /* ── Layout ── */
  --content-max: 88rem; --rail-w: 13.5rem; --rail-w-collapsed: 3.5rem;
  --drawer-w: 560px; --drawer-w-md: 480px;

  /* business constants surfaced as tokens for traceability (NOT used to compute VAT) */
  --vat-default-rate: 22; /* default only — VAT is per-row data (D-PD-3); never hardcode in math */
}

/* Fix H3: reduced motion kills durations AND stops looping keyframes (not just 1ms) */
@media (prefers-reduced-motion: reduce) {
  :root { --duration-fast: 1ms; --duration-normal: 1ms; --duration-slow: 1ms; }
  .status-dot--pulse { animation: none !important; }       /* static dot, no loop */
  .graduation { transition: opacity var(--duration-fast) linear !important; }
  .graduation { transform: none !important; }              /* cross-fade only, no translate */
}
```

`src/styles/typography.css`

```css
/* Fix L3: preload BOTH Inter (UI) and the single Geist Mono weight used for money. */
/* money is first-class above-the-fold content — deferring mono risks money-column CLS. */
@font-face {
  font-family: "Inter"; src: url("/fonts/Inter.var.woff2") format("woff2");
  font-weight: 100 900; font-display: swap; font-style: normal;
}
@font-face {
  font-family: "Geist Mono"; src: url("/fonts/GeistMono.var.woff2") format("woff2");
  font-weight: 100 900; font-display: swap; font-style: normal;
  /* size-adjust prevents money-column reflow during swap (CLS guard) */
  size-adjust: 100%; ascent-override: 90%;
}

body {
  font-family: var(--font-sans); font-size: var(--text-base);
  line-height: var(--leading-base); color: var(--color-text);
  background: var(--color-bg); -webkit-font-smoothing: antialiased;
  font-feature-settings: "cv11", "ss01"; /* Inter: open digits, single-story a */
}

/* Money / quantities / IDs / ESR codes — always mono, always aligned, always neutral-by-default */
.num, .money, td.num, [data-numeric] {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums slashed-zero;
  font-feature-settings: "tnum" 1, "zero" 1;
  letter-spacing: -0.01em;
  color: var(--color-money);          /* H2: money text is neutral, NOT amber */
}
.money { text-align: right; }                       /* ranging-right ledgers */
.money--pos { color: var(--color-money-pos); }
.money--neg { color: var(--color-money-neg); }
.money--zero { color: var(--color-money-zero); }
.label-caps {
  font-size: var(--text-2xs); text-transform: uppercase;
  letter-spacing: var(--tracking-caps); color: var(--color-text-tertiary);
}
```

### Tailwind v4 wiring (`globals.css`)
```css
@import "tailwindcss";
@import "./tokens.css";
@import "./typography.css";

@theme inline {
  --color-bg: var(--color-bg);
  --color-surface-1: var(--color-surface-1);
  --color-accent: var(--color-accent);
  --color-success: var(--color-success);
  --color-danger: var(--color-danger);
  /* …map every token so utilities (bg-surface-1, text-accent, etc.) resolve to the vars */
  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --radius-md: var(--radius-md);
}
```
shadcn primitives are re-skinned by pointing their CSS vars at these tokens (3–10px radii, hairline rings, amber accent) — **not** stock zinc/slate.

---

## 3. System model (depth, motion, interaction)

- **Depth / elevation — flat-first.** Depth comes from the **surface lightness ladder** (`bg → surface-1/2/3`) + **hairline rings**, not drop shadows. Real shadow (`--elev-3`) appears only on truly floating layers (popover, modal, mobile sheet).
- **Borders — structural Swiss ruling.** Tables: `--color-border-subtle` inner row rules, `--color-border` frame, `--color-border-strong` section dividers. Rules organize; they don't decorate. No box on every element.
- **Motion principles.** `transform` / `opacity` / `clip-path` only. Tab/page transitions 120–200ms `--ease-out-quad`. Funnel stage advance = short slide+fade of the **changed row only**, never a full re-layout. `will-change` applied narrowly and removed on `animationend`. Honors `prefers-reduced-motion` (fix H3).
- **Optimistic interaction (fix H1).** Status changes flip the row's lane + pill **instantly** (transform/opacity), fire the server mutation in the background (TanStack Query mutation), and **roll back on failure** with visible error feedback. Coverage/margin recompute is **client-side arithmetic** from already-loaded quote rows — no round-trip in the interaction path. Targets INP < 200ms even on a 4×-throttled mid Android.

---

## 4. Component Catalog

> All components inherit the tokens above. Hover/focus/active are **designed**, never default. Money cells: `font-mono` + `tabular-nums` + right-aligned + neutral color (semantic only on sign).

### 4.1 Funnel Nav Shell — `components/nav/FunnelNav.tsx`
The single grid-breaking, anti-template move: nav **is** the pipeline.

```
┌─────────────────────────────────────────────────────────────┐
│  ЗАПРОСЫ ──────▶ НАПРАВЛЕНИЯ ──────▶ ОТЧЁТНОСТЬ              │
│   ◆ 8 live        ● 14 live          ▦ июнь                  │
└─────────────────────────────────────────────────────────────┘
```
- Desktop: top rail 48px, three stages connected by a thin stroke + live count badge per stage. Active stage: `--color-text` weight 620 + 2px `--color-accent` underline (animates via `transform: scaleX(0→1)`).
- Mobile: **plain tap-only** bottom 3-item bar (fix H4 — no row-swipe-to-advance on the smallest breakpoint; advance via tap-and-hold action sheet to avoid gesture collision with OS back-swipe).
- A **won** запрос "graduates" rightward into Направления (cross-fade + slide, `transform`/`opacity`; reduced-motion → cross-fade only).
- **ADR-D12 (flagged):** default landing `/` → `/requests` overrides the locked `/ → /directions` redirect. **Surface to operator as explicit yes/no — do not let it ride as a styling consequence.**

```tsx
interface FunnelNavProps {
  active: "requests" | "directions" | "reports";
  counts: { requests: number; directions: number; reportLabel: string };
}
```

### 4.2 Data Table — `components/data-table/DataTable.tsx`
Primary workhorse for all three surfaces (50–500 rows). Zero layout shift on sort.

- Row height 36px desktop / 44px mobile (touch). Column headers ALL-CAPS `--text-2xs`, `--tracking-caps`, `--color-text-tertiary`.
- **No alternating stripes** — single 1px `--color-border-subtle` bottom rule + hover state.
- **Sticky header uses opaque `--color-surface-1` + hairline bottom border, NOT `backdrop-filter: blur` (fix M1)** — blur on a scrolling sticky element forces per-frame re-raster and jank on mid phones.
- Money columns: `font-mono` + `tabular-nums`, right-aligned, neutral by default.
- **Rendering (fix H1/L2):** use CSS `content-visibility: auto` + `contain-intrinsic-size` for ≤~200 rows (cheap to paint, no JS virtualization, no drag conflict). Only reach for a virtualization lib if measured >~300 rows. Don't optimize before measuring.

| State | Treatment |
|---|---|
| Hover row | bg → `--color-surface-2`; 2px `--color-accent` left inset bar (transform, no layout shift) |
| Selected | bg `--color-accent-quiet`; 3px accent left border |
| Active (click) | `opacity: 0.85`, `scale(0.998)` 100ms snap |
| Focus (kbd) | `--ring-focus` (always, keyboard-first) |
| Sorted header | accent color + solid sort glyph; toggles via `transform: rotate()` |
| Loading | skeleton mirrors exact column widths; shimmer via `transform: translateX` |
| Empty / Error | §4.10 components |

### 4.3 KPI / Stat Tile — `components/kpi/StatTile.tsx`
**Not** a uniform card grid — a horizontal strip with **irregular, content-driven widths**; the most important number is the largest object on screen.

- Value: `--text-xl`/`--text-display`, weight 720, `tabular-nums`, neutral money color.
- Label: `--text-2xs` ALL-CAPS `--tracking-caps` tertiary.
- Variants add a 3px left rail: `accent` / `positive` (`--color-money-pos`) / `negative` (`--color-money-neg`).
- Interactive hover: `translateY(-2px)` (compositor); active `translateY(0)` + `opacity .9`.

### 4.4 Status Pill — `components/ui/StatusPill.tsx`
Terminal states use a **different glyph shape**, not just a different color (genuine differentiation).

| Status | Glyph | Treatment |
|---|---|---|
| new | `●` | `--color-info-quiet` bg, neutral feel |
| sourcing | `●` **pulsing** | `--color-warn-quiet` bg; pulse = `opacity`+`scale` keyframe on a pseudo-element |
| quoted | `●` | `--color-info-quiet` bg, no pulse |
| won | `◆` diamond | `--color-success-quiet` bg, weight 620 |
| lost / expired / cancelled | `✕` | `--color-danger-quiet` (lost) / muted; weight 430 |

```css
@keyframes status-pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.8)} }
.status-dot--pulse { animation: status-pulse 2s var(--ease-standard) infinite; }
/* fix H3: under prefers-reduced-motion this rule is overridden to animation:none (static dot) */
```

### 4.5 Request Card — `components/requests/RequestCard.tsx`
Three distinct density zones (identity / commercial / coverage) — **intentional rhythm, not uniform padding**.

- Route is the type hero (`--text-md`, weight 620); ID `--text-xs` tertiary; numbers mono.
- Coverage bar: **`transform: scaleX` for an empty fill bar with the label OUTSIDE** (fix M3 — standardized; use `clip-path: inset()` only if the % label lives inside the fill). Track `--color-surface-inset` h:4px; fill `--viz` ramp by coverage.
- Quick actions appear on hover via `opacity 0→1` + `translateY(4px→0)`.
- States: hover `translateY(-2px)`; selected 3px accent left border + tint; **won** green left rail; **lost** `opacity .6` + sunken bg.
- **Negative-margin guard (reuses H1 activation physics):** if `projected_margin ≤ 0`, margin cell is `--color-money-neg` and the Convert/Won action shows a hard warning before proceeding.

### 4.6 Direction Card / Wire-Up Panel — `components/directions/DirectionWire.tsx`, `components/requests/OwnerPollPanel.tsx`
Communicates data flow (owner inbound mailbox → РНС → client-forward), and the опрос собов graph (which owners polled, who replied, their spot rate).

- Connector lines: SVG, `stroke-dashoffset` animated on mount (compositor-safe).
- Node boxes: `--color-surface-2`, `--color-border`, `--radius-md`; arrows `--color-accent` (the one place amber points the eye).
- Owner rows: CSS grid (not `<table>`); pending = dashed left border + pulsing dot + tertiary text; replied = solid `--color-success` left border + full text; best quote = `--color-accent-quiet` bg.
- VAT shown **per row** from `vat_rate` data; non-VAT-payer owners flagged visually (they look cheaper but РНС can't reclaim входной НДС).

### 4.7 Money Formatting — `components/ui/Money.tsx`, `lib/format.ts`
```ts
const RUB = new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:0});
export const formatRub = (v:number,o?:{precise?:boolean}) =>
  (o?.precise ? new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",minimumFractionDigits:2,maximumFractionDigits:2}) : RUB).format(v);
export const formatRubShort = (v:number) =>
  Math.abs(v)>=1e6 ? `₽ ${(v/1e6).toFixed(1)}M`
  : Math.abs(v)>=1e3 ? `₽ ${Math.round(v/1e3)}к` : `₽ ${v}`;

/* fix L1: VAT is per-row data — rate is an ARGUMENT, default only as fallback. NEVER hardcode 0.22. */
export const vatAmount = (netExcl:number, rate:number = 22) => netExcl * (rate/100);
export const withVat   = (netExcl:number, rate:number = 22) => netExcl * (1 + rate/100);
```
`<Money>` props: `value`, `form: 'full'|'short'|'per-wagon'`, `sign?`, `vatRate?` (from row), `vatTreatment?: 'inclusive'|'exclusive'|'not_vat_payer'`. Color is neutral; `--color-money-pos/neg` applied only by sign.

### 4.8 Filter Bar / Segmented Control — `components/filters/*`
- Segmented control indicator slides via `transform: translateX`.
- Dropdown panels open/close via `clip-path: inset()` (180ms out / 120ms in), `--elev-3` shadow (floating layer — shadow allowed here).
- Active filter chips: `--color-accent-quiet` bg; ✕ appears on hover.

### 4.9 Detail Drawer — `components/ui/DetailDrawer.tsx` (shadcn Sheet base)
- Desktop: right drawer `--drawer-w` (560px), board **dims but stays usable** (no full modal). Slide via `transform: translateX`.
- Mobile: bottom sheet 80vh with internal scroll + sticky footer actions; handle bar 36×4px.
- Focus trap when open; `Esc` closes; `--elev-3`.

### 4.10 Empty / Loading / Error — `components/ui/{EmptyState,SkeletonRow,ErrorState}.tsx`
- **Empty:** contextual icon (e.g. Inbox for empty Запросы) at 40% opacity accent tint + title + action. Not a generic placeholder.
- **Loading:** skeleton mirrors the *exact* layout it replaces (table = real column widths, tile = tile proportions). Shimmer via `transform: translateX` only.
- **Error:** inline (table) = single full-width row, `--color-danger` icon + message + retry link; page = centered card with danger left rail. Never swallow errors silently.

---

## 5. How each banned anti-template pattern is avoided

| Banned pattern | How we avoid it |
|---|---|
| Default card-grid / uniform card sea | Primary surfaces are **hairline-ruled tables + the funnel header**, not equal cards |
| Stock gradient-blob hero | The "hero" is the **funnel + live KPI numbers** in `--text-display` mono; no decorative gradient |
| Unmodified shadcn defaults | Primitives re-skinned to these tokens (3–10px radii, hairline rings, amber accent) — not stock zinc/slate |
| Flat / no depth | Depth via 5-step surface ladder + rings; real shadow reserved for floating layers |
| Uniform radius/spacing/shadow | Intentional rhythm: `--space-section` bands vs `--row-h-dense`; radius scales by element class |
| Gray-on-white + one decorative accent | Low-chroma **blue-gray** base (not neutral gray) + amber accent **plus a working semantic palette** |
| Dashboard-by-numbers (sidebar+cards+charts, no POV) | POV = the **funnel spine** as the org principle; coverage % and margin are the heroes |
| Default font stacks w/o reason | Deliberate Inter + Geist Mono; **mono + tabular + slashed-zero mandatory for all money/IDs** |

---

## 6. Accessibility

- **Contrast (fix H2):** before build, compute APCA/WCAG for every text-on-surface and semantic-on-surface pair in **both** themes; require ≥4.5:1 for body/money text, ≥3:1 for large/UI. **Money text stays neutral** (`--color-money`), never amber; amber is acceptable only as a fill with `--color-text-inverse` (dark) text on it, or as a large/bold link label. Light-theme `--color-warn` is darkened (oklch 58%) specifically to clear AA on white.
- **Focus:** keyboard-first. Every interactive element gets `--ring-focus` (always visible, never `outline:none` without replacement). Drawers/sheets trap focus and restore on close. Funnel nav and tables fully keyboard-navigable.
- **Reduced motion (fix H3):** under `prefers-reduced-motion: reduce` we (a) zero durations, (b) **replace the looping status pulse with a static solid dot** (gated by media query, not just 1ms — an `opacity` keyframe loop keeps looping at 1ms), (c) make the won→graduation a cross-fade with **no translate**.
- **Semantic HTML:** `<header><nav aria-label="Funnel"> … <main> <section aria-labelledby> … <table>` for ledgers; status pills carry `aria-label` (text not color-only); coverage bars expose `role="progressbar"` + `aria-valuenow`.
- **Color is never the only signal:** terminal statuses use distinct glyphs; negative margin uses color **and** sign **and** a warning before destructive confirm.

---

## 7. Committed performance budget

| Metric | Commit (under ECC) |
|---|---|
| LCP | < 2.0s (ECC 2.5s) |
| INP | < 200ms incl. the lane-advance interaction (optimistic + client-side recompute — fix H1) |
| CLS | < 0.05 (money font preloaded + `size-adjust` — fix L3) |
| App-page JS (gz) | < 250kb (ECC 300kb). **Board interaction deps counted explicitly (fix M2):** prefer CSS-driven drag + a minimal pointer handler over a full DnD lib; prefer `content-visibility` over a virtualization lib; keep TanStack Query as the SWR/optimistic substrate. Charts dynamically imported. |
| CSS (gz) | < 40kb |
| Fonts | 2 woff2 var families, `font-display: swap`, subset Latin+Cyrillic; **preload Inter AND the single Geist Mono money weight** (fix L3) |
| Motion | compositor-only (`transform`/`opacity`/`clip-path`); `will-change` narrow + removed on `animationend` |
| Sticky headers | opaque surface + hairline, **no `backdrop-filter` on scrolling stickies** (fix M1) |
| Images | none in core ops UI (data, not media) |

### Perf checklist (add to web testing)
- [ ] Lane-advance INP measured on 4× CPU throttle, < 200ms
- [ ] Money column has zero CLS through font swap
- [ ] All animated props are transform/opacity/clip-path only
- [ ] Board interaction JS deps fit the 250kb budget
- [ ] Contrast ratios verified for both themes

---

## 8. ADRs (flagged for operator approval — none contradict locked physics)

| ID | Decision | Status |
|---|---|---|
| **ADR-D19** | Dark theme is default (justified long-session control-board exception); light ships first-class | PROPOSED |
| **ADR-D20** | Geist Mono (fallback IBM Plex Mono) is the mandatory numeric/money/ID typeface, `tabular-nums slashed-zero` enforced globally | PROPOSED |
| **ADR-D12** | Default landing `/` → `/requests`; two-item tab bar becomes a three-stage funnel nav | PROPOSED — needs explicit yes/no |
| **C1-resolved** | This doc is the sole token source of truth; `component-system §0` palette demoted to anatomy-only; one mono family | RATIFIED here |
| **H2-resolved** | Money numerals are neutral, never amber; amber = accent/CTA/fill only | RATIFIED here |
| **L1-resolved** | VAT is per-row data; `vatAmount/withVat` take a rate arg, default 22 fallback only | RATIFIED here |
```

---

LOCKED DESIGN DECISIONS (6-line summary):
1. Direction: dark-precision freight terminal — Swiss grid × Linear/Vercel polish, amber "act-here" voltage, funnel-as-hero; dark default + first-class light peer (refs: Linear, Vercel/Geist, Stripe, Swiss editorial, IBM Plex Mono).
2. Single token source of truth in this doc (`tokens.css` OKLCH light+dark); `component-system §0` palette demoted to anatomy-only; one mono = Geist Mono (fallback IBM Plex Mono) (fix C1).
3. Money numerals are NEUTRAL mono + tabular-nums + slashed-zero, right-aligned, semantic color only on sign; amber is reserved for accent/CTA/fill — never money text (fix H2); VAT is per-row data, never a hardcoded 0.22 (fix L1).
4. Interactions are optimistic with client-side coverage/margin recompute and rollback-on-failure; sticky headers use opaque surface + hairline (no backdrop-blur); `content-visibility` over JS virtualization; board deps counted against 250kb (fixes H1, M1, M2, L2).
5. Accessibility: APCA/WCAG ≥4.5:1 verified both themes, always-visible focus ring, reduced-motion replaces the looping pulse with a static dot and drops graduation translate, color never the only signal (fix H2, H3).
6. Perf committed: LCP<2.0s, INP<200ms incl. lane-advance, CLS<0.05 with money font preloaded + size-adjust, app JS<250kb gz, CSS<40kb, compositor-only motion (fix L3).

