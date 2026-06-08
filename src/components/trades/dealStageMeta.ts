// Воронка сделки: три стадии «Запрос → Заявка → Исполнение» поверх статусов orders.
// Единственное место маппинга статус→стадия — оператор поменяет здесь, когда введёт
// свои внутренние статусы. Текущий жизненный цикл: draft→confirmed→active→completed|cancelled.

export type DealStage = "request" | "application" | "execution";

export const DEAL_STAGES: { stage: DealStage; label: string; subtitle: string }[] = [
  { stage: "request", label: "Запрос", subtitle: "Просчёт" },
  { stage: "application", label: "Заявка", subtitle: "Документы" },
  { stage: "execution", label: "Исполнение", subtitle: "Отгрузка" },
];

// draft → просчитывается; confirmed → собраны документы; active|completed → отгрузка/слежение.
// cancelled и неизвестные статусы в воронку не попадают (null).
export function stageForStatus(status: string): DealStage | null {
  switch (status) {
    case "draft":
      return "request";
    case "confirmed":
      return "application";
    case "active":
    case "completed":
      return "execution";
    default:
      return null;
  }
}

export function isDealStage(value: string | undefined): value is DealStage {
  return value === "request" || value === "application" || value === "execution";
}
