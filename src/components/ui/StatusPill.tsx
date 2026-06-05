import { cn } from "@/lib/utils";

export type RequestStatus =
  | "new"
  | "sourcing"
  | "quoted"
  | "won"
  | "lost"
  | "no_bid"
  | "expired"
  | "cancelled";

interface StatusConfig {
  /** Terminal states use a DIFFERENT glyph shape, not just color (§4.4). */
  glyph: string;
  bgClass: string;
  toneClass: string;
  pulse: boolean;
  bold: boolean;
  ru: string;
}

const STATUS_CONFIG: Record<RequestStatus, StatusConfig> = {
  new: { glyph: "●", bgClass: "bg-info-quiet", toneClass: "text-info", pulse: false, bold: false, ru: "Новый" },
  sourcing: { glyph: "●", bgClass: "bg-warn-quiet", toneClass: "text-warn", pulse: true, bold: false, ru: "Опрос" },
  quoted: { glyph: "●", bgClass: "bg-info-quiet", toneClass: "text-info", pulse: false, bold: false, ru: "Предложено" },
  won: { glyph: "◆", bgClass: "bg-success-quiet", toneClass: "text-success", pulse: false, bold: true, ru: "Выигран" },
  lost: { glyph: "✕", bgClass: "bg-danger-quiet", toneClass: "text-danger", pulse: false, bold: false, ru: "Проигран" },
  no_bid: { glyph: "✕", bgClass: "bg-surface-2", toneClass: "text-text-tertiary", pulse: false, bold: false, ru: "Не беремся" },
  expired: { glyph: "✕", bgClass: "bg-surface-2", toneClass: "text-text-tertiary", pulse: false, bold: false, ru: "Истёк" },
  cancelled: { glyph: "✕", bgClass: "bg-surface-2", toneClass: "text-text-tertiary", pulse: false, bold: false, ru: "Отменён" },
};

interface StatusPillProps {
  status: RequestStatus;
  /** Override the default Russian label. */
  label?: string;
  className?: string;
}

/**
 * Status pill — glyph shape + color encode state (color-blind safe). The `sourcing` dot pulses
 * via CSS; the pulse is stopped under prefers-reduced-motion (tokens.css). Server Component.
 */
export function StatusPill({ status, label, className }: StatusPillProps) {
  const cfg = STATUS_CONFIG[status];
  const text = label ?? cfg.ru;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-xs",
        cfg.bgClass,
        cfg.bold ? "font-semibold" : "font-medium",
        className,
      )}
      aria-label={text}
    >
      <span
        aria-hidden
        className={cn("text-[0.7em] leading-none", cfg.toneClass, cfg.pulse && "status-dot--pulse")}
      >
        {cfg.glyph}
      </span>
      <span className="text-text">{text}</span>
    </span>
  );
}
