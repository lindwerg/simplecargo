import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The actual board now lives at /requests itself. Keep this route as a permanent
 * redirect so existing links/bookmarks (and BoardTabs base paths) resolve.
 */
type SP = Promise<{ view?: string; origin?: string; road?: string }>;

export default async function ActualBoardRedirect({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.view) qs.set("view", sp.view);
  if (sp.origin) qs.set("origin", sp.origin);
  if (sp.road) qs.set("road", sp.road);
  const query = qs.toString();
  redirect(query ? `/requests?${query}` : "/requests");
}
