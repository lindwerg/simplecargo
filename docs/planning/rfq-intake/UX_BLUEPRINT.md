# UX Blueprint — Запросы (RFQ Intake) Tab

> **Status:** DRAFT — Frontend design spec for the RFQ intake slice (requests + request_lines only). Covers routes, card anatomy, board grouping, AI intake panel, and component file list. Does NOT spec owner-sourcing, coverage, margin, client-quote, or win-conversion (RFQ-3..8 deferred).
>
> **Token source of truth:** `src/styles/tokens.css` (OKLCH vars). All colour references below resolve to those vars.
>
> **Accessibility:** WCAG 2.2 Level AA throughout. Every interactive element ≥ 44×44 CSS px on mobile, ≥ 24×24 px on desktop. Focus ring = `var(--ring-focus)` (double-ring amber). Reduced-motion: `prefers-reduced-motion: reduce` collapses durations to 1ms via tokens.css; no transform on hover for reduced-motion users.

---

## 1. Route / Page Tree

```
src/app/(app)/requests/
├── layout.tsx                  — SC: wraps the "Запросы" section; no extra chrome beyond app shell
├── page.tsx                    — SC: menu landing (3 entry cards: Создать / Актуальные / Архив)
├── actual/
│   └── page.tsx                — SC: full board; sub-view switch (Все / По клиентам / По направлениям / По дорогам)
│       — reads URL param ?view=all|clients|origins|roads&origin=&road=
│       — data: fetches from server action / route handler; passes to CC board
├── archive/
│   └── page.tsx                — SC: terminal-status board (won|lost|no_bid|expired|cancelled)
├── new/
│   └── page.tsx                — CC: AI intake panel (drag-drop / paste / voice / manual form)
└── [id]/
    └── page.tsx                — SC shell + CC right drawer (560px on desktop / full page on mobile)
```

### Server vs Client split

| Surface | Component type | Reason |
|---|---|---|
| `/requests` landing | Server Component | Static entry cards; no interactivity needed |
| `/requests/actual` shell + data fetch | Server Component | Fetch on server; stream to board |
| `<ActualBoard>` | Client Component | Sub-view switch state, filter state, optimistic status flips |
| `<RequestDirectionCard>` | Server Component | Pure display; no local state |
| `<ClientGroupRow>` | Server Component | Roll-up header; pure display |
| `/requests/new` | Client Component | File drag-drop, paste, voice MediaRecorder, form state |
| `<IntakeReviewCard>` | Client Component | Editable before save |
| `/requests/[id]` shell | Server Component | Fetch full request + lines |
| `<RequestDrawer>` | Client Component | Open/close state, inline edits (deferred RFQ-3+) |

---

## 2. Menu Landing — `/requests/page.tsx`

Three entry cards arranged in a 3-column grid on desktop, single column on mobile. Each card is a large interactive surface — not a generic shadcn card. They use `var(--color-surface-2)` raised background with a 3px accent-rail on the left, `var(--elev-2)` shadow, and a prominent icon. Hover: `translateY(-3px)` + `var(--elev-3)` shadow. Transition on compositor properties only.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                                                              │
│  ЗАПРОСЫ                                                   [+ Новый запрос] │
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐  │
│  │ ▐ (accent rail)     │  │ ▐ (warn rail)        │  │ ▐ (border rail)     │  │
│  │                     │  │                     │  │                     │  │
│  │  ✦ Создать запрос   │  │  ◉ Актуальные       │  │  ✕ Архив            │  │
│  │                     │  │   new · sourcing ·  │  │  won · lost ·       │  │
│  │  Загрузить план,    │  │   quoted            │  │  no_bid · expired · │  │
│  │  вставить текст     │  │                     │  │  cancelled          │  │
│  │  или надиктовать    │  │   ── 8 запросов ──  │  │                     │  │
│  │                     │  │   140 ваг. в работе │  │   ── 31 итого ──    │  │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘  │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Accessibility tree for the landing:**
- `<main>` contains `<h1>Запросы</h1>` (visually as page title)
- Each entry card is an `<a>` or `<button>` with `aria-label` describing destination
- Live count is wrapped in `<span aria-live="polite">` updated server-side on each render (no client polling needed at this scope)

---

## 3. Actual Board — `/requests/actual/page.tsx`

### Sub-view switch (tab-bar, not dropdown)

```html
<nav aria-label="Группировка запросов" role="tablist">
  <button role="tab" aria-selected="true"  aria-controls="board-panel">Все</button>
  <button role="tab" aria-selected="false" aria-controls="board-panel">По клиентам</button>
  <button role="tab" aria-selected="false" aria-controls="board-panel">По направлениям</button>
  <button role="tab" aria-selected="false" aria-controls="board-panel">По дорогам</button>
</nav>
```

State lives in URL: `?view=all|clients|origins|roads`. `useSearchParams` + `router.replace` for updates. No client-only state needed — the board re-renders from URL.

### Filter row (below tab-bar)

```
[Ст. отправления ▼]  [Дорога ▼]  [Клиент ▼]  [Сбросить]
```

Combobox selects. Origin station filter uses a searchable input that queries `stations` inline (type-to-filter). Persisted in URL params.

### Board layout

Desktop: CSS grid, 4 active-status columns + 1 collapsed "Закрыто" column. Each column is a `<section aria-labelledby="lane-heading-*">`. On `≤ 1024px`: a single vertical grouped list (status sections stack). Mobile `≤ 640px`: status sections collapse to accordion-style toggles by default, expandable.

The column-level stats row (sticky under lane header):
```
SOURCING  4          покр 68%   себ ₽1.2м   SLA: 🟡 3д min
```

This uses `tabular-nums` Geist Mono for the money and coverage numbers.

---

## 4. Marketplace-Style Direction Card — Hero Deliverable

### Design rationale

Each `request_line` is one freight route the client wants. These are the products in the marketplace. The card face is designed like an Ozon/Wildberries product card: the **route** is the product name (large, semibold), the **wagon count** is the "quantity" (big number, prominent like a price), and the **target rate** is the "marketplace price" (amber, Geist Mono, most visible number). The left edge carries a 3px coloured status rail — the same visual language as `StatTile` but applied to cards.

### Card anatomy (annotated)

```
┌──────────────────────────────────────────────────────────┐
│▐ (3px status rail — colour = status semantic token)       │
│                                                          │
│  ● Опрос                            🟡 SLA: 3д          │  ← status pill + SLA chip
│                                                          │
│  Асбест  ──────────────────→  Голышманово                │  ← ROUTE HERO
│  СВР                                              ГОР   │  ← road tags (quiet pills)
│                                                          │
│  Полувагон · щебень                                      │  ← wagon_type · cargo
│                                                          │
│  ┌──────────────┐  ┌──────────────────────────────────┐  │
│  │  40          │  │  ₽ 1 800 / ваг               →  │  │  ← wagons (display) | target rate (amber mono)
│  │  вагонов     │  │  желаемая ставка клиента         │  │
│  └──────────────┘  └──────────────────────────────────┘  │
│                                                          │
│  25 т / ваг · клиент: Химпром СПб                       │  ← tonnage · client name
│                                                          │
│  [Начать опрос →]                                        │  ← primary CTA (deferred RFQ-3; shown disabled if not scoped)
└──────────────────────────────────────────────────────────┘
```

### JSX structure

```tsx
// src/components/requests/RequestDirectionCard.tsx
// Server Component — receives flat props from parent; no hooks.

import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/StatusPill";
import { Money } from "@/components/ui/Money";
import type { RequestStatus } from "@/components/ui/StatusPill";

interface RequestDirectionCardProps {
  // Identity
  lineId: string;
  requestId: string;
  requestNumber?: string;

  // Route
  originRaw: string;
  originRoadRaw?: string;
  destRaw: string;
  destRoadRaw?: string;

  // Cargo
  wagonType?: string;    // e.g. "ПВ" (полувагон)
  cargoName?: string;

  // Volumes & price
  wagonsRequested: number;
  tonnagePerWagon?: number | null;
  targetRatePerWagon?: number | null; // client desired rate (numeric)
  targetRateRaw?: string | null;       // raw rate string if no parsed numeric

  // Client
  clientName?: string;       // resolved counterparty name
  clientRaw?: string;        // temp-client free text
  clientIsTemp?: boolean;    // true = no counterparty row yet

  // Status & SLA
  status: RequestStatus;
  slaLabel?: string;         // e.g. "3д", "просрочен"
  slaSeverity?: "ok" | "warn" | "danger";
}

// Status rail colour map — matches token semantics
const RAIL_CLASS: Record<RequestStatus, string> = {
  new:       "border-l-info",
  sourcing:  "border-l-warn",
  quoted:    "border-l-info",
  won:       "border-l-success",
  lost:      "border-l-danger",
  no_bid:    "border-l-border-strong",
  expired:   "border-l-border-strong",
  cancelled: "border-l-border-strong",
};

const SLA_CLASS = {
  ok:     "text-text-tertiary",
  warn:   "text-warn",
  danger: "text-danger",
} as const;

export function RequestDirectionCard({
  lineId,
  requestId,
  requestNumber,
  originRaw,
  originRoadRaw,
  destRaw,
  destRoadRaw,
  wagonType = "ПВ",
  cargoName,
  wagonsRequested,
  tonnagePerWagon,
  targetRatePerWagon,
  targetRateRaw,
  clientName,
  clientRaw,
  clientIsTemp = false,
  status,
  slaLabel,
  slaSeverity = "ok",
}: RequestDirectionCardProps) {
  const clientLabel = clientName ?? clientRaw;

  return (
    <article
      className={cn(
        // Base card surface
        "direction-card",
        "relative flex flex-col gap-0",
        "rounded-[var(--radius-lg)] bg-surface-2",
        "border-l-[3px] border border-border",
        RAIL_CLASS[status],
        // Elevation
        "[box-shadow:var(--elev-2)]",
        // Hover lift — compositor only (transform + box-shadow)
        "transition-[transform,box-shadow]",
        "duration-[var(--duration-fast)] ease-[var(--ease-out-quad)]",
        "hover:-translate-y-[3px] hover:[box-shadow:var(--elev-3)]",
        "active:translate-y-0 active:opacity-90",
        // Focus ring for keyboard nav (the card links to detail)
        "focus-within:outline-none",
      )}
      aria-label={`Запрос ${requestNumber ?? ""}: ${originRaw} → ${destRaw}, ${wagonsRequested} вагонов`}
    >
      {/* ── Top bar: status + SLA ── */}
      <div className="flex items-center justify-between px-4 pt-3 pb-0">
        <StatusPill status={status} />
        {slaLabel && (
          <span
            className={cn(
              "font-mono text-xs tabular-nums",
              SLA_CLASS[slaSeverity],
            )}
            aria-label={`SLA: ${slaLabel}`}
          >
            SLA: {slaLabel}
          </span>
        )}
      </div>

      {/* ── Route hero ── */}
      <div className="px-4 pt-3 pb-1">
        <div
          className="flex items-baseline gap-2"
          aria-label={`Маршрут: ${originRaw} → ${destRaw}`}
        >
          <span
            className="text-lg font-[var(--weight-semibold)] leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-text"
            aria-hidden   // full aria-label on parent
          >
            {originRaw}
          </span>
          <span
            className="flex-shrink-0 text-text-tertiary text-sm"
            aria-hidden
          >
            {/* Right-arrow — purely decorative */}
            ──────→
          </span>
          <span
            className="text-lg font-[var(--weight-semibold)] leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-text"
            aria-hidden
          >
            {destRaw}
          </span>
        </div>

        {/* Road tags */}
        {(originRoadRaw || destRoadRaw) && (
          <div className="mt-1 flex items-center gap-2" aria-label="Дороги">
            {originRoadRaw && <RoadTag label={originRoadRaw} />}
            {destRoadRaw && <RoadTag label={destRoadRaw} />}
          </div>
        )}
      </div>

      {/* ── Cargo line ── */}
      {(wagonType || cargoName) && (
        <p className="px-4 pb-2 text-sm text-text-secondary">
          {[wagonType, cargoName].filter(Boolean).join(" · ")}
        </p>
      )}

      {/* ── Divider ── */}
      <div className="mx-4 border-t border-border-subtle" aria-hidden />

      {/* ── Key metrics row: wagons + target rate ── */}
      <div className="flex items-stretch gap-0 px-4 pt-3 pb-3">
        {/* Wagon count — "quantity" block, large */}
        <div
          className="flex flex-col gap-0.5 min-w-[5rem]"
          aria-label={`${wagonsRequested} вагонов`}
        >
          <span
            className="font-mono text-[2rem] font-[var(--weight-bold)] leading-none text-text tabular-nums slashed-zero"
            aria-hidden
          >
            {wagonsRequested}
          </span>
          <span className="text-xs text-text-tertiary" aria-hidden>
            вагонов
          </span>
        </div>

        {/* Separator */}
        <div
          className="mx-3 w-px bg-border-subtle self-stretch"
          aria-hidden
        />

        {/* Target rate — "marketplace price", amber accent */}
        <div className="flex flex-1 flex-col justify-center gap-0.5">
          <span
            className="label-caps"
            aria-hidden
          >
            Желаемая ставка
          </span>
          <div
            className="flex items-baseline gap-1"
            aria-label={
              targetRatePerWagon != null
                ? `Желаемая ставка: ${targetRatePerWagon} руб. за вагон`
                : targetRateRaw
                  ? `Желаемая ставка: ${targetRateRaw}`
                  : "Ставка не указана"
            }
          >
            {targetRatePerWagon != null ? (
              <Money
                value={targetRatePerWagon}
                form="per-wagon"
                className="text-md font-[var(--weight-semibold)] text-accent-text"
              />
            ) : targetRateRaw ? (
              <span className="font-mono text-md text-accent-text tabular-nums">
                {targetRateRaw}
              </span>
            ) : (
              <span className="text-sm text-text-disabled">не указана</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Footer: tonnage + client ── */}
      <div className="flex items-center justify-between border-t border-border-subtle px-4 py-2.5">
        {tonnagePerWagon != null ? (
          <span className="text-xs text-text-secondary tabular-nums">
            {tonnagePerWagon} т / ваг
          </span>
        ) : (
          <span className="text-xs text-text-disabled">тоннаж не задан</span>
        )}

        {clientLabel ? (
          <span className="flex items-center gap-1.5 max-w-[55%]">
            {clientIsTemp && (
              <span
                className="inline-flex items-center rounded-pill bg-warn-quiet px-1.5 py-0.5 text-2xs text-warn font-medium"
                title="Временный клиент — не привязан к контрагенту"
                aria-label="Временный клиент"
              >
                TEMP
              </span>
            )}
            <span
              className="truncate text-xs text-text-secondary"
              title={clientLabel}
            >
              {clientLabel}
            </span>
          </span>
        ) : (
          <span className="text-xs text-text-disabled">клиент не задан</span>
        )}
      </div>

      {/* ── Invisible full-card click target linking to detail ── */}
      {/* The <a> covers the whole card; real interactive children (buttons) sit above it in stacking context */}
      <a
        href={`/requests/${requestId}`}
        className="absolute inset-0 rounded-[var(--radius-lg)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
        aria-label={`Открыть запрос ${requestNumber ?? requestId.slice(0, 8)}: ${originRaw} → ${destRaw}`}
        tabIndex={0}
      />
    </article>
  );
}

// ── Sub-component: road tag pill ──
function RoadTag({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center rounded-pill bg-surface-3 px-2 py-0.5 text-2xs font-medium text-text-tertiary tracking-[var(--tracking-caps)] uppercase"
      aria-label={`Дорога: ${label}`}
    >
      {label}
    </span>
  );
}
```

### Grid CSS — responsive product catalog layout

```css
/* src/components/requests/requests.css */
/* Auto-fill marketplace grid — cards wrap like a product catalog */

.direction-card-grid {
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    minmax(min(100%, 22rem), 1fr)
  );
  gap: var(--space-4);
  align-items: start; /* cards are NOT equal-height by default — hierarchy through scale contrast */
}

/* At narrow viewports (≤ 640px) force single column */
@media (max-width: 40rem) {
  .direction-card-grid {
    grid-template-columns: 1fr;
  }
}

/* Card hover lift — already defined inline via Tailwind utilities in JSX.
   The CSS below adds the reduced-motion override (tokens.css sets durations
   to 1ms but transform itself is NOT disabled; we disable it here explicitly). */
@media (prefers-reduced-motion: reduce) {
  .direction-card {
    transform: none !important;
    transition: box-shadow var(--duration-fast) linear !important;
  }
}

/* Status rail colours — one rule per semantic token,
   so both themes resolve correctly at runtime via var() */
.direction-card--new       { border-left-color: var(--color-info); }
.direction-card--sourcing  { border-left-color: var(--color-warn); }
.direction-card--quoted    { border-left-color: var(--color-info); }
.direction-card--won       { border-left-color: var(--color-success); }
.direction-card--lost,
.direction-card--no-bid,
.direction-card--expired,
.direction-card--cancelled { border-left-color: var(--color-border-strong); }
```

### Accessibility tree for one card

Screen reader will announce (in order):

1. `article` landmark: "Запрос R-2031: Асбест → Голышманово, 40 вагонов"
2. Status pill: "Опрос" (role=generic, aria-label="Опрос")
3. SLA: "SLA: 3д"
4. Route: "Маршрут: Асбест → Голышманово" (the individual spans are aria-hidden; parent carries the label)
5. Roads: "Дороги" — "Дорога: СВР", "Дорога: ГОР"
6. Cargo: "Полувагон · щебень" (plain text)
7. Wagons: "40 вагонов"
8. Rate: "Желаемая ставка: 1800 руб. за вагон"
9. Tonnage: "25 т / ваг"
10. Client: "TEMP" badge + "Химпром СПб"
11. Full-card link: "Открыть запрос R-2031: Асбест → Голышманово" (focusable, 44px min touch area from full-card anchor)

### WCAG 2.2 compliance mapping for the card

| Criterion | How satisfied |
|---|---|
| 1.1.1 Non-text content | Route arrows are `aria-hidden`; route hero uses `aria-label` on parent |
| 1.4.3 Contrast (4.5:1) | `text-text` on `bg-surface-2` ≥ 11:1 dark; all secondary text ≥ 4.5:1 verified against tokens |
| 1.4.11 UI components (3:1) | Status rail 3px border uses semantic colour tokens verified ≥ 3:1 vs surface |
| 2.1.1 Keyboard | Full-card anchor is keyboard-focusable; tab order: status → SLA → route → card link |
| 2.4.7 Focus visible | `var(--ring-focus)` double-ring (2px bg + 4px amber) on card anchor |
| 2.4.11 Focus appearance | Ring offset ≥ 2px, ring ≥ 2px, passes non-white check |
| 2.5.8 Target size | Full-card anchor covers entire card; always ≥ 44×44 px |
| 4.1.2 Name, Role, Value | `article` element; aria-label on card; all interactive elements have accessible names |

---

## 5. Grouped Board Layouts

### 5a. "По клиентам" — client group header

```tsx
// src/components/requests/ClientGroupRow.tsx  (Server Component)

interface ClientGroupRowProps {
  clientName: string;
  clientIsTemp?: boolean;
  lineCount: number;
  totalWagons: number;
  requestIds: string[];  // for the "see all" link
}

export function ClientGroupRow({
  clientName,
  clientIsTemp = false,
  lineCount,
  totalWagons,
  requestIds,
}: ClientGroupRowProps) {
  return (
    <header
      className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-surface-1 px-4 py-2 border-b border-border-strong"
      aria-label={`Группа: ${clientName}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {clientIsTemp && (
          <span className="shrink-0 rounded-pill bg-warn-quiet px-1.5 py-0.5 text-2xs text-warn font-medium uppercase tracking-[var(--tracking-caps)]">
            TEMP
          </span>
        )}
        <h2
          className="truncate text-md font-[var(--weight-semibold)] text-text"
        >
          {clientName}
        </h2>
      </div>
      <div className="flex items-center gap-4 shrink-0 text-xs text-text-secondary tabular-nums font-mono">
        <span aria-label={`${lineCount} направлений`}>{lineCount} напр.</span>
        <span aria-label={`${totalWagons} вагонов итого`}>{totalWagons} ваг</span>
      </div>
    </header>
  );
}
```

The client group renders as:
```
[sticky header: Химпром СПб ·····················  3 напр.  140 ваг]
[card grid: 3 direction cards for this client]

[sticky header: TEMP · Клиент из плана Июнь ·····  8 напр.  260 ваг]
[card grid: 8 direction cards]
```

### 5b. "По направлениям" (by origin station)

Grouped by `originRaw` value. Group header shows the station name, line count, and total wagons. The card grid within a group shows all destinations from that origin, sorted by `wagonsRequested` desc.

```tsx
// Station group header variant — same ClientGroupRow shape, title = originRaw
<ClientGroupRow
  clientName={originRaw}
  lineCount={lines.length}
  totalWagons={lines.reduce((s, l) => s + l.wagonsRequested, 0)}
  requestIds={[]}
/>
```

### 5c. "По дорогам" (by originRoadRaw)

Same pattern. Group header = `originRoadRaw` (e.g. "СВР", "ГОР"). Within each road group, cards are sorted by `originRaw` then `wagonsRequested`.

### 5d. "Все по дате" (flat, ungrouped)

No group headers. Cards in a flat `direction-card-grid`, sorted by `createdAt` desc (newest first). A date-separator can optionally be injected between groups of cards that share the same calendar day — a simple `<div aria-hidden class="label-caps text-text-tertiary">Сегодня</div>` spanning the full grid width.

---

## 6. Archive Board — `/requests/archive/page.tsx`

Terminal statuses: `won | lost | no_bid | expired | cancelled`. Same card grid. Cards in archive have muted status rails (border-strong colour, not semantic colour). Adds a "Клонировать →" secondary action inside the card footer (replaces the CTA for active cards). Cards are visually quieter: `opacity: 0.85` on the whole card. Hover lift is retained (3px) but the amber rate number uses `text-text-secondary` instead of `text-accent-text`.

Filter row: `[Статус ▼]  [Период ▼]  [Клиент ▼]`.

---

## 7. AI Intake Panel — `/requests/new/page.tsx`

### Intake panel anatomy

```
┌───────────────────────────────────────────────────────────────────────┐
│  ← Назад          НОВЫЙ ЗАПРОС                                        │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                                                                 │  │
│  │   Перетащите файл (xlsx, pdf, png, jpg)                        │  │
│  │   или                                                          │  │  ← DROP ZONE
│  │   [Выбрать файл]         [Вставить текст ▼]    [🎙 Надиктовать]│  │
│  │                                                                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ── или ввести вручную ────────────────────────────────────────────   │
│  Клиент: [поле поиска / ввод свободного текста]                      │
│  Канал:  [Загрузка ▼]   Примечание: [textarea]                       │
│  [Создать пустой запрос →]                                            │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### States

| State | Visual | Aria |
|---|---|---|
| `idle` | Drop zone border dashed `border-border`, text `text-text-tertiary` | `aria-label="Зона загрузки файла. Перетащите файл или нажмите для выбора."` |
| `dragging` | Border becomes `border-accent` solid, background `bg-accent-quiet`, slight scale up (1.015) | `aria-live="polite"` region announces "Отпустите файл" |
| `uploading` | Spinner + progress bar (opacity/width transition), "Загрузка…" | `aria-busy="true"` on drop zone; `role="progressbar"` |
| `extracting` | Shimmer skeleton over preview area, "Извлекаю строки…" | `aria-live="polite"` "Извлечение данных" |
| `review` | Extracted lines rendered as editable `IntakeReviewCard` components | Focus moves to first review card |
| `error` | `<ErrorState>` in drop zone, retry button | `aria-live="assertive"` announces error |

### Voice record button

```tsx
// 44×44px minimum. Uses MediaRecorder API (client-only).
<button
  type="button"
  aria-label={isRecording ? "Остановить запись" : "Надиктовать запрос голосом"}
  aria-pressed={isRecording}
  className={cn(
    "flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)]",
    "border border-border bg-surface-2",
    "transition-[background-color,box-shadow] duration-[var(--duration-fast)]",
    "hover:border-accent hover:bg-accent-quiet",
    "focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]",
    isRecording && "bg-danger-quiet border-danger [animation:status-pulse_2s_var(--ease-standard)_infinite]",
  )}
>
  <MicIcon aria-hidden className="size-5 text-text-secondary" />
</button>
```

### Paste text flow

"Вставить текст" button opens a textarea overlay (modal, focus-trapped). Operator pastes raw text from email/chat. On "Извлечь" the text is sent to `/api/requests/extract` (server action). Extracted JSON returns an array of `RawLine` objects. Each becomes an `IntakeReviewCard`.

### Drop zone JSX

```tsx
// src/components/requests/IntakeDropZone.tsx  (Client Component)

"use client";

import { useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

type DropZoneState = "idle" | "dragging" | "uploading" | "extracting" | "review" | "error";

interface IntakeDropZoneProps {
  onExtracted: (lines: RawExtractedLine[]) => void;
}

export interface RawExtractedLine {
  originRaw: string;
  originRoadRaw?: string;
  destRaw: string;
  destRoadRaw?: string;
  wagonsRequested: number;
  cargoName?: string;
  tonnagePerWagon?: number;
  targetRateRaw?: string;
}

export function IntakeDropZone({ onExtracted }: IntakeDropZoneProps) {
  const [state, setState] = useState<DropZoneState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const liveRef  = useRef<HTMLDivElement>(null);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    await uploadFile(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setState("dragging");
  };

  const handleDragLeave = () => {
    setState("idle");
  };

  async function uploadFile(file: File) {
    setState("uploading");
    const fd = new FormData();
    fd.append("file", file);

    try {
      setState("extracting");
      const res = await fetch("/api/requests/extract", { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
      const { data } = await res.json() as { data: RawExtractedLine[] };
      setState("review");
      onExtracted(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Неизвестная ошибка");
      setState("error");
    }
  }

  const isDragging = state === "dragging";

  return (
    <div
      role="region"
      aria-label="Зона загрузки файла"
      aria-busy={state === "uploading" || state === "extracting"}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        "relative flex flex-col items-center justify-center gap-4 rounded-[var(--radius-xl)]",
        "border-2 border-dashed border-border bg-surface-inset",
        "px-8 py-12 text-center",
        "transition-[border-color,background-color] duration-[var(--duration-fast)]",
        isDragging && "border-accent bg-accent-quiet",
        state === "error" && "border-danger bg-danger-quiet",
      )}
    >
      {/* Live region for assistive tech */}
      <div
        ref={liveRef}
        aria-live="polite"
        aria-atomic="true"
        className="sr-only"
      >
        {state === "dragging"   && "Отпустите файл для загрузки"}
        {state === "uploading"  && "Загрузка файла…"}
        {state === "extracting" && "Извлечение строк из файла…"}
        {state === "review"     && "Строки извлечены. Проверьте и сохраните."}
        {state === "error"      && `Ошибка: ${errorMsg}`}
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.pdf,.png,.jpg,.jpeg"
        className="sr-only"
        aria-label="Выбрать файл для загрузки"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) uploadFile(f);
        }}
      />

      {state === "idle" || state === "dragging" ? (
        <>
          <p className="text-sm text-text-secondary">
            Перетащите <span className="text-text">xlsx, pdf, png, jpg</span>
          </p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface-2 px-4 text-sm text-text hover:border-accent hover:bg-accent-quiet focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)] transition-[border-color,background-color] duration-[var(--duration-fast)]"
          >
            Выбрать файл
          </button>
        </>
      ) : state === "uploading" || state === "extracting" ? (
        <div className="flex flex-col items-center gap-3" role="status">
          <div className="skeleton-shimmer h-2 w-48 rounded-pill" aria-hidden />
          <p className="text-sm text-text-secondary">
            {state === "uploading" ? "Загрузка…" : "Извлекаю строки…"}
          </p>
        </div>
      ) : state === "error" ? (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-danger" role="alert">{errorMsg}</p>
          <button
            type="button"
            onClick={() => { setState("idle"); setErrorMsg(null); }}
            className="inline-flex h-9 items-center gap-2 rounded-[var(--radius-md)] border border-danger bg-danger-quiet px-4 text-sm text-danger hover:bg-danger focus-visible:outline-none focus-visible:[box-shadow:var(--ring-focus)]"
          >
            Попробовать снова
          </button>
        </div>
      ) : null}
    </div>
  );
}
```

### Extracted-line review cards (`IntakeReviewCard`)

After extraction, each `RawExtractedLine` renders as an editable card in a list. The operator can:
- Edit any field inline (origin, dest, wagons, cargo)
- Delete a line (removes it from the save batch)
- Add a line manually (empty card appended)

```tsx
// src/components/requests/IntakeReviewCard.tsx  (Client Component)
// Editable card — same visual shape as RequestDirectionCard but with input fields

// Key difference: route, cargo, wagons are all <input> elements with accessible labels.
// Uses local controlled state per card; parent collects via ref array or lifted state.
```

The editable card uses the same `direction-card` CSS class for visual consistency. Inputs inside are `bg-surface-inset` with `border-border` underline style (bottom border only) and `var(--ring-focus)` on `:focus-visible`. No background-color change on input (avoids layout shift).

### Client picker (temp vs existing)

Below the drop zone, one field: "Клиент". Combobox with two modes:
1. Type to search existing counterparties (debounced fetch, `aria-autocomplete="list"`)
2. If no match: show option "Использовать как временный клиент" → sets `clientRaw`, no `clientSuggestedId`

The TEMP badge appears on the client input pill when temp mode is active. A quiet info message: "Временный клиент — оператор привяжет к контрагенту позже."

```tsx
// accessibility: combobox pattern per APG 1.2
// role="combobox" + aria-expanded + aria-controls pointing to listbox
// aria-activedescendant tracks highlighted option
```

---

## 8. Request Detail — `/requests/[id]/page.tsx`

Desktop: right-side drawer (560px, `var(--drawer-w)`), slides in from right over the board (not a full page change). The board underneath is dimmed but still visible. Drawer traps focus (`inert` on board content while drawer is open). Mobile: full-page route.

The drawer content for this intake-only slice shows:
- Request header: number, status pill, created date
- Lines list: each line rendered as a mini `RequestDirectionCard` variant (compact, no hover lift, no full-card link — already in the detail view)
- Client section: shows `clientRaw` or resolved counterparty name; "Привязать контрагента" action (deferred: links to counterparty picker)
- Notes field: plain text, read-only in this slice
- Action footer: "Редактировать" / "Отозвать" buttons (deferred: only shell in this slice)

Focus management: when drawer opens, focus moves to the close button (`✕`) or drawer heading. When closed, focus returns to the card that triggered the open.

```tsx
// Drawer focus trap
// Uses @radix-ui/react-focus-trap or a lightweight custom implementation:
// - Sets `aria-modal="true"` on the drawer panel
// - Sets `inert` attribute on the main board content while drawer is open
// - Restores focus to trigger element on close
```

---

## 9. Component File List — `src/components/requests/`

| File | Type | Purpose |
|---|---|---|
| `RequestDirectionCard.tsx` | Server Component | Marketplace-style direction card — the hero deliverable; renders one `request_line` |
| `ClientGroupRow.tsx` | Server Component | Sticky group-header row for "По клиентам" / "По направлениям" / "По дорогам" views |
| `ActualBoard.tsx` | Client Component | Full board with sub-view switch (Все / По клиентам / По направлениям / По дорогам); owns view and filter URL state |
| `BoardLaneHeader.tsx` | Server Component | Per-status lane header (sticky, shows lane name + rollup stats: count, total wagons) |
| `SubViewTabs.tsx` | Client Component | Tab-bar for view switching; manages `role="tablist"` / `role="tab"` ARIA pattern |
| `FilterRow.tsx` | Client Component | Filter controls (origin station combobox, road select, client search); writes to URL params |
| `IntakeDropZone.tsx` | Client Component | Drag-drop + file-pick + upload + extract states; emits `RawExtractedLine[]` on success |
| `IntakePasteModal.tsx` | Client Component | Modal textarea for pasting raw text (email/chat); focus-trapped; sends to extract API |
| `IntakeVoiceButton.tsx` | Client Component | Record button using `MediaRecorder`; emits audio blob for transcription endpoint |
| `IntakeReviewCard.tsx` | Client Component | Editable version of direction card; used in the review step before saving extracted lines |
| `IntakeClientPicker.tsx` | Client Component | Combobox: search existing counterparties OR flag as temp client (`clientRaw`) |
| `RequestDrawer.tsx` | Client Component | Right-side drawer shell for `/requests/[id]` on desktop; manages open/close + focus trap |
| `RequestDetailLines.tsx` | Server Component | List of `request_line` compact cards inside the detail drawer |
| `SlaChip.tsx` | Server Component | SLA countdown chip: computes label + severity from `validUntil` date |
| `requests.css` | CSS | `direction-card-grid` responsive grid; `.direction-card` reduced-motion override; status rail colour rules |
| `types.ts` | Types only | `RequestDirectionCardProps`, `RawExtractedLine`, `RequestLineView` — pure TypeScript; NO db import |

---

## 10. Token Usage Reference

| Visual element | Token(s) used |
|---|---|
| Card background | `var(--color-surface-2)` |
| Card border | `var(--color-border)` |
| Status rail (left 3px border) | `var(--color-info)` / `var(--color-warn)` / `var(--color-success)` / `var(--color-danger)` / `var(--color-border-strong)` |
| Card hover shadow | `var(--elev-3)` |
| Card rest shadow | `var(--elev-2)` |
| Route hero text | `var(--color-text)` + `var(--weight-semibold)` + `var(--tracking-tight)` |
| Road tag background | `var(--color-surface-3)` |
| Road tag text | `var(--color-text-tertiary)` |
| Wagon count number | `var(--font-mono)` + `tabular-nums slashed-zero` + `var(--color-text)` |
| Target rate (amber) | `var(--color-accent-text)` + `var(--font-mono)` |
| TEMP badge | `var(--color-warn-quiet)` bg + `var(--color-warn)` text |
| Client / tonnage label | `var(--color-text-secondary)` |
| Dividers | `var(--color-border-subtle)` |
| Focus ring | `var(--ring-focus)` (2px bg + 4px accent double-ring) |
| Drop zone border | `var(--color-border)` idle → `var(--color-accent)` dragging → `var(--color-danger)` error |
| Skeleton shimmer | `.skeleton-shimmer` class from `globals.css` |
| Reduced motion | `var(--duration-fast/normal/slow)` collapse to 1ms via `tokens.css` media query |

---

## 11. Accessibility Decision Record

### ADR-ACC-001: Full-card anchor over individual link

**Status:** Accepted

**Context:** The `RequestDirectionCard` is a product card where the entire surface should be clickable to navigate to the detail view. Several interactive sub-elements (TEMP badge tooltip, status pill) are inside the card.

**Problem:** A naive `<a>` wrapping all children creates nested interactive elements. A `<div onClick>` is inaccessible to keyboard users.

**Decision:** A single visually-invisible `<a>` is positioned `absolute inset-0` above the card surface using `z-index`. Interactive sub-elements (future: action buttons for RFQ-3+) are placed above it in stacking context with explicit `z-index` and their own `tabIndex`. This avoids nested interactive content while keeping the whole card surface tappable and keyboard-navigable. Follows the "card link" pattern from MDN and ARIA Authoring Practices.

**Implementation note:** The card `<article>` has `position: relative`. The full-card `<a>` has `position: absolute; inset: 0`. Buttons added in later slices (RFQ-3+) use `position: relative; z-index: 1` to sit above the anchor in stacking context.

### ADR-ACC-002: Route "arrow" decoration

**Status:** Accepted

**Context:** The route display uses a horizontal arrow glyph (──────→) between origin and destination.

**Decision:** The arrow span is `aria-hidden="true"`. The parent `<div>` carries `aria-label="Маршрут: {origin} → {dest}"`. Screen readers announce the semantically correct route without the decorative glyph confusing the output.

### ADR-ACC-003: Status rail is not the only status indicator

**Status:** Accepted

**Context:** The 3px left border uses colour to indicate status (info/warn/success/danger). Colour-only indicators fail WCAG 1.4.1 Use of Color.

**Decision:** The `StatusPill` component is always rendered on the card face, providing a text label AND a glyph shape (●/◆/✕) as a second indicator. The rail is a decorative reinforcement, not the sole indicator. Satisfies 1.4.1.
