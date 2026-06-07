import type { ExecutionBucket } from "@/lib/execution/classify";

// Execution bucket → Russian funnel label + a Tailwind text tone + funnel order.
// Mirrors directions/statusMeta.ts. `order` drives the left→right layout.
export const BUCKET_META: Record<ExecutionBucket, { label: string; tone: string; order: number }> = {
  addressed: { label: "Заадресовано", tone: "text-text-tertiary", order: 0 },
  approaching: { label: "В подходе", tone: "text-info", order: 1 },
  at_station: { label: "На станции", tone: "text-text-secondary", order: 2 },
  loading: { label: "В погрузке", tone: "text-warn", order: 3 },
  loaded_waiting: { label: "Погружен, ждёт", tone: "text-accent", order: 4 },
  in_transit: { label: "В пути", tone: "text-success", order: 5 },
  unloaded: { label: "Выгружено", tone: "text-text-secondary", order: 6 },
};

export function bucketMeta(bucket: ExecutionBucket): { label: string; tone: string; order: number } {
  return BUCKET_META[bucket] ?? { label: bucket, tone: "text-text-secondary", order: 99 };
}

// Distance sub-bucket labels for the approaching / in_transit breakdown.
export const DIST_LABEL: Record<string, string> = {
  le100: "≤100 км",
  le300: "≤300 км",
  le500: "≤500 км",
  gt500: ">500 км",
  unknown: "—",
};
