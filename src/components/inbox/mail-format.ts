// Дата/время письма «как в почте»: dd.MM.yyyy, HH:mm (ru-RU, без секунд).
// Один helper для списка и детали, чтобы формат не разъезжался.
export function formatMailDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
