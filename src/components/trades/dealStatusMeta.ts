// Deal (orders) status → Russian label + Tailwind text tone for list/card badges.
// Mirrors directions/statusMeta.ts; the order lifecycle is draft→confirmed→active→completed|cancelled.
export const DEAL_STATUS_META: Record<string, { label: string; tone: string }> = {
  draft: { label: "Черновик", tone: "text-text-tertiary" },
  confirmed: { label: "Подтверждена", tone: "text-info" },
  active: { label: "В работе", tone: "text-success" },
  completed: { label: "Завершена", tone: "text-text-secondary" },
  cancelled: { label: "Отменена", tone: "text-danger" },
};

export function dealStatusMeta(status: string): { label: string; tone: string } {
  return DEAL_STATUS_META[status] ?? { label: status, tone: "text-text-secondary" };
}
