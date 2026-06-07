// Deal type (orders.deal_type) → Russian label. NULL = empty deal (no components yet).
export const DEAL_TYPE_LABEL: Record<string, string> = {
  stone_only: "Щебень",
  wagons_only: "Перевозка",
  stone_with_transport: "Щебень с доставкой",
};

export function dealTypeLabel(dealType: string | null): string {
  if (!dealType) return "Состав не задан";
  return DEAL_TYPE_LABEL[dealType] ?? dealType;
}
