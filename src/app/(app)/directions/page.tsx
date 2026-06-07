import { redirect } from "next/navigation";

// «Направления» свёрнуты в единую вкладку «Сделки» (Фаза 6).
// Список перенаправляет на /deals; детальные роуты (/directions/[id]/edit,
// /directions/new, /directions/pricing) остаются живыми.
export default function DirectionsPage() {
  redirect("/deals");
}
