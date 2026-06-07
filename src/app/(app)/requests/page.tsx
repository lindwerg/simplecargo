import { redirect } from "next/navigation";

// «Запросы» свёрнуты в единую вкладку «Сделки» (Фаза 6).
// Список перенаправляет на /deals; служебные роуты (/requests/[id],
// /requests/new, /requests/[id]/kp) остаются живыми.
export default function RequestsBoardPage() {
  redirect("/deals");
}
