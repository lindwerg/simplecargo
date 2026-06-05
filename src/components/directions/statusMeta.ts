import type { DirectionStatus } from "@/lib/directions/lifecycle";

// Direction status → Russian label + a Tailwind text tone for the list/drill-in badges.
// Kept separate from the shared StatusPill (whose enum is request-domain specific).
export const DIRECTION_STATUS_META: Record<DirectionStatus, { label: string; tone: string }> = {
  draft: { label: "Черновик", tone: "text-text-tertiary" },
  open: { label: "Открыто", tone: "text-info" },
  active: { label: "Активно", tone: "text-success" },
  paused: { label: "Пауза", tone: "text-warn" },
  completed: { label: "Завершено", tone: "text-text-secondary" },
  cancelled: { label: "Отменено", tone: "text-danger" },
};

export function directionStatusMeta(status: string): { label: string; tone: string } {
  return (
    DIRECTION_STATUS_META[status as DirectionStatus] ?? {
      label: status,
      tone: "text-text-secondary",
    }
  );
}
