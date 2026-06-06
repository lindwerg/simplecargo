import { Home, Inbox, MailWarning, Route, Building2, Wallet, BarChart3, type LucideIcon } from "lucide-react";

/** A single primary-navigation destination. Shared by the desktop rail and the mobile bar. */
export interface NavItem {
  key: string;
  href: string;
  ru: string;
  Icon: LucideIcon;
}

// Single source of truth for primary nav (used by SideRail + BottomBar).
// Order is the operator's mental model: dashboard, then the funnel stages.
export const NAV_ITEMS: readonly NavItem[] = [
  { key: "dashboard", href: "/dashboard", ru: "Главная", Icon: Home },
  { key: "inbox", href: "/inbox", ru: "Входящие", Icon: MailWarning },
  { key: "requests", href: "/requests", ru: "Запросы", Icon: Inbox },
  { key: "directions", href: "/directions", ru: "Направления", Icon: Route },
  { key: "partners", href: "/partners", ru: "Партнёры", Icon: Building2 },
  { key: "finances", href: "/finances", ru: "Финансы", Icon: Wallet },
  { key: "reports", href: "/reports", ru: "Отчётность", Icon: BarChart3 },
];

/**
 * Active when the URL is the item's route or a child of it
 * (e.g. /directions/[id]/edit still highlights "Направления").
 */
export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
