// Pure conversion-scenario helpers (Фаза 3). No DB import — unit-testable. Decides which
// component a request line becomes when a won RFQ is converted into a deal.

// Per-line component choice. "auto" picks transport when the line carries a usable route
// + wagon count, otherwise stone.
export type LineComponent = "transport" | "stone" | "auto";

// Conversion scenario: a default applied to every line, optionally overridden per line.
export interface ConvertScenario {
  default: LineComponent;
  perLine?: Record<string, LineComponent> | undefined;
}

// Minimal shape needed to classify a line — keeps the pure helper free of Drizzle types.
export interface LineShape {
  id: string;
  originRaw: string | null;
  destRaw: string | null;
  wagonsRequested: number | null;
}

// A transport leg needs origin + dest + a positive wagon count; everything else is stone.
export function hasTransportShape(line: LineShape): boolean {
  const hasRoute = Boolean(line.originRaw?.trim() && line.destRaw?.trim());
  const hasWagons = (line.wagonsRequested ?? 0) > 0;
  return hasRoute && hasWagons;
}

// Resolve the concrete component for one line given an explicit/auto choice.
export function resolveLineComponent(line: LineShape, choice: LineComponent): "transport" | "stone" {
  if (choice === "transport") return "transport";
  if (choice === "stone") return "stone";
  return hasTransportShape(line) ? "transport" : "stone";
}

// Resolve the effective choice for a line from the scenario (per-line override → default).
export function effectiveChoice(scenario: ConvertScenario, lineId: string): LineComponent {
  return scenario.perLine?.[lineId] ?? scenario.default;
}
