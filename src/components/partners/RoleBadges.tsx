import { ROLE_LABELS_RU, type PartnerRole } from "@/lib/partners/schema";
import { cn } from "@/lib/utils";

const ROLE_CLASS: Partial<Record<PartnerRole, string>> = {
  client: "bg-info-quiet text-info",
  owner: "bg-success-quiet text-success",
  expeditor: "bg-accent-quiet text-accent",
  carrier: "bg-warn-quiet text-warn",
  quarry: "partner-badge--quarry",
};

function labelFor(role: string): string {
  return (ROLE_LABELS_RU as Record<string, string>)[role] ?? role;
}

/** Role chips for a company. Unknown roles render in a neutral tint. */
export function RoleBadges({ roles, className }: { roles: string[]; className?: string }) {
  if (roles.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {roles.map((role) => (
        <span
          key={role}
          className={cn(
            "rounded-pill px-2 py-0.5 text-2xs font-medium",
            ROLE_CLASS[role as PartnerRole] ?? "bg-surface-3 text-text-secondary",
          )}
        >
          {labelFor(role)}
        </span>
      ))}
    </div>
  );
}
