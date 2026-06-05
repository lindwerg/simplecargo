// Pure grouping/sorting for the "Запросы" board (REQUESTS_SOURCING §4, §11.3).
// The board unit is ONE DIRECTION = one request_line, rendered as a marketplace
// card. A client request explodes into N such cards. No DB import — operates on
// the flat DirectionCardView the repository projects, so it is fully unit-testable
// and reusable on server and client.

import { ACTIVE_STATUSES, type RequestStatus } from "./lifecycle";

export interface DirectionCardView {
  lineId: string;
  requestId: string;
  requestNumber: string | null;
  status: string; // parent request status
  // client (from parent request) — D16: real id, TEMP raw label, or unlinked
  clientSuggestedId: string | null;
  clientRaw: string | null;
  clientName: string | null; // resolved counterparty name (null for TEMP/unlinked)
  // route (the line)
  originRaw: string;
  originRoadRaw: string | null;
  destRaw: string;
  destRoadRaw: string | null;
  cargoName: string | null;
  wagonType: string;
  wagonsRequested: number;
  tonnagePerWagon: number | null;
  targetRatePerWagon: number | null;
  targetRateRaw: string | null;
  createdAt: Date;
  validUntil: Date | null;
}

export const UNLINKED_KEY = "__unlinked__";
export const UNKNOWN_KEY = "__unknown__";

export interface Group {
  key: string;
  label: string;
  isTemp: boolean;
  totalWagons: number;
  cardCount: number;
  items: DirectionCardView[];
}

function clientKeyOf(c: DirectionCardView): { key: string; label: string; isTemp: boolean } {
  if (c.clientSuggestedId) {
    return { key: c.clientSuggestedId, label: c.clientName ?? "Клиент", isTemp: false };
  }
  if (c.clientRaw && c.clientRaw.trim().length > 0) {
    return { key: `raw:${c.clientRaw.trim()}`, label: c.clientRaw.trim(), isTemp: true };
  }
  return { key: UNLINKED_KEY, label: "Без клиента", isTemp: true };
}

function rollup(items: readonly DirectionCardView[]): { totalWagons: number; cardCount: number } {
  let totalWagons = 0;
  for (const c of items) totalWagons += c.wagonsRequested ?? 0;
  return { totalWagons, cardCount: items.length };
}

/** Group by client (real counterparty id, TEMP raw label, or unlinked). §11.3 */
export function groupByClient(cards: readonly DirectionCardView[]): Group[] {
  const buckets = new Map<string, { label: string; isTemp: boolean; items: DirectionCardView[] }>();
  for (const c of cards) {
    const { key, label, isTemp } = clientKeyOf(c);
    const bucket = buckets.get(key) ?? { label, isTemp, items: [] };
    bucket.items.push(c);
    buckets.set(key, bucket);
  }
  return finalize(buckets);
}

/** Group by origin station (board «По направлениям»). */
export function groupByOriginStation(cards: readonly DirectionCardView[]): Group[] {
  return groupBySingleKey(cards, (c) => c.originRaw, "Станция не определена");
}

/** Group by origin road code (board «По дорогам») — raw code from the file. */
export function groupByRoad(cards: readonly DirectionCardView[]): Group[] {
  return groupBySingleKey(cards, (c) => c.originRoadRaw, "Дорога не определена");
}

function groupBySingleKey(
  cards: readonly DirectionCardView[],
  keyOf: (c: DirectionCardView) => string | null,
  unknownLabel: string,
): Group[] {
  const buckets = new Map<string, { label: string; isTemp: boolean; items: DirectionCardView[] }>();
  for (const c of cards) {
    const raw = keyOf(c);
    const key = raw && raw.trim().length > 0 ? raw.trim() : UNKNOWN_KEY;
    const label = key === UNKNOWN_KEY ? unknownLabel : key;
    const bucket = buckets.get(key) ?? { label, isTemp: false, items: [] };
    bucket.items.push(c);
    buckets.set(key, bucket);
  }
  return finalize(buckets);
}

function finalize(
  buckets: Map<string, { label: string; isTemp: boolean; items: DirectionCardView[] }>,
): Group[] {
  const groups: Group[] = [];
  for (const [key, b] of buckets) {
    const { totalWagons, cardCount } = rollup(b.items);
    groups.push({ key, label: b.label, isTemp: b.isTemp, totalWagons, cardCount, items: sortByCreatedAt(b.items) });
  }
  return groups.sort((a, b) => {
    const aUnknown = a.key === UNKNOWN_KEY || a.key === UNLINKED_KEY;
    const bUnknown = b.key === UNKNOWN_KEY || b.key === UNLINKED_KEY;
    if (aUnknown !== bUnknown) return aUnknown ? 1 : -1;
    return b.totalWagons - a.totalWagons;
  });
}

/** Sort flat (board «Все по дате заведения»). Newest first by default. */
export function sortByCreatedAt(
  cards: readonly DirectionCardView[],
  order: "desc" | "asc" = "desc",
): DirectionCardView[] {
  return [...cards].sort((a, b) => {
    const diff = a.createdAt.getTime() - b.createdAt.getTime();
    return order === "desc" ? -diff : diff;
  });
}

export function partitionByBucket(cards: readonly DirectionCardView[]): {
  active: DirectionCardView[];
  archive: DirectionCardView[];
} {
  const active: DirectionCardView[] = [];
  const archive: DirectionCardView[] = [];
  for (const c of cards) {
    if (ACTIVE_STATUSES.has(c.status as RequestStatus)) active.push(c);
    else archive.push(c);
  }
  return { active, archive };
}
