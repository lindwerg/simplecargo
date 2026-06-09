// PURE КП (commercial proposal) model builder (Goal 5, part B). No DB, no React.
// Turns a request + its lines into a flat, render-ready KpModel for KpDocument.
//
// Determinism: the caller passes `todayIso` IN as a plain string — this builder
// must NOT touch the Date constructor so it stays unit-testable against a fixed ISO.

import { format, parseISO } from "date-fns";

import { COMPANY } from "@/lib/config/company";
import { wagonTypeLabel } from "@/lib/wagons/wagon-type";
import {
  formatRateExpression,
  type RateExpression,
  type RateKind,
} from "@/lib/pricing/rate-expression";

const RUB_LOCALE = "ru-RU";
const TARIFF_KINDS: ReadonlySet<RateKind> = new Set<RateKind>([
  "tariff_indicative",
  "tariff_plus_markup",
]);

export interface KpRow {
  idx: number;
  route: string;
  wagonType: string;
  count: string;
  rateText: string;
}

export interface KpModel {
  issNumber: string;
  dateLabel: string;
  clientName: string;
  greeting: string;
  introLines: string[];
  rows: KpRow[];
  vatNote: string;
  closingLines: string[];
}

export interface KpLineInput {
  originRaw: string;
  originRoadRaw?: string | null;
  destRaw: string;
  destRoadRaw?: string | null;
  cargoName?: string | null;
  wagonsRequested?: number | null;
  wagonType?: string | null;
  targetRatePerWagon?: string | number | null;
  targetRateRaw?: string | null;
  targetRateKind?: string | null;
  targetRateMarkupPct?: string | number | null;
  targetTariffClass?: number | null;
  /** Ссылка на тариф из AI-извлечения (напр. "10-01"); без неё КП печатает действующий ТР-1. */
  targetTariffRef?: string | null;
}

export interface BuildProposalKpInput {
  requestNumber?: string | null;
  clientName?: string | null;
  lines: KpLineInput[];
  headerWagonType?: string | null;
  todayIso: string;
  issNumber?: string;
}

/** True only for a non-empty, trimmed string. */
function has(value?: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Coerce a string|number|null (Drizzle numerics arrive as strings) to a finite number or null. */
function toNumber(value?: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** "Станция (ДОРОГА)" or just "Станция" when the road is empty. */
function station(name: string, road?: string | null): string {
  return has(road) ? `${name.trim()} (${road.trim()})` : name.trim();
}

/** "30 000 ₽/ваг" formatting for an absolute amount. */
function formatRub(amount: number): string {
  return `${new Intl.NumberFormat(RUB_LOCALE).format(amount)} ₽/ваг`;
}

function isTariffKind(kind?: string | null): kind is RateKind {
  return typeof kind === "string" && TARIFF_KINDS.has(kind as RateKind);
}

/** Resolve a single line into КП-facing rate text, strictest source first. */
function rateText(line: KpLineInput): string {
  if (isTariffKind(line.targetRateKind)) {
    const expr: RateExpression = {
      kind: line.targetRateKind,
      markupPct: toNumber(line.targetRateMarkupPct),
      tariffRef: line.targetTariffRef ?? null,
    };
    return formatRateExpression(expr);
  }

  const flat = toNumber(line.targetRatePerWagon);
  if (flat !== null && flat > 0) return formatRub(flat);

  if (has(line.targetRateRaw)) return line.targetRateRaw.trim();
  return "по запросу";
}

/** wagonTypeLabel for the line's own type, falling back to the request header type. */
function rowWagonType(line: KpLineInput, headerWagonType?: string | null): string {
  const code = has(line.wagonType) ? line.wagonType : has(headerWagonType) ? headerWagonType : null;
  if (!code) return "—";
  return wagonTypeLabel(code) ?? "—";
}

function rowCount(line: KpLineInput): string {
  const n = toNumber(line.wagonsRequested);
  return n !== null && n > 0 ? `${n} ваг` : "—";
}

/** Default "NN/01" from a request number's trailing digits, else "____". */
function deriveIssNumber(requestNumber?: string | null): string {
  if (!has(requestNumber)) return "____";
  const match = requestNumber.match(/(\d+)\s*$/);
  if (!match) return "____";
  return `${match[1]}/01`;
}

/** Parse an ISO string into "dd.MM.yyyy"; deterministic, no `new Date()` clock read. */
function dateLabelFromIso(todayIso: string): string {
  return format(parseISO(todayIso), "dd.MM.yyyy");
}

export function buildProposalKp(input: BuildProposalKpInput): KpModel {
  const clientName = has(input.clientName) ? input.clientName.trim() : "клиенту";

  const rows: KpRow[] = input.lines.map((line, i) => ({
    idx: i + 1,
    route: `${station(line.originRaw, line.originRoadRaw)} → ${station(line.destRaw, line.destRoadRaw)}`,
    wagonType: rowWagonType(line, input.headerWagonType),
    count: rowCount(line),
    rateText: rateText(line),
  }));

  return {
    issNumber: has(input.issNumber) ? input.issNumber.trim() : deriveIssNumber(input.requestNumber),
    dateLabel: dateLabelFromIso(input.todayIso),
    clientName,
    greeting: "Уважаемые коллеги!",
    introLines: [
      `${COMPANY.name} благодарит Вас за интерес к нашим услугам по предоставлению железнодорожного подвижного состава.`,
      "Предлагаем Вам следующие условия предоставления вагонов:",
    ],
    rows,
    vatNote: `Указанные ставки приведены с учётом НДС ${COMPANY.vatRatePct}%.`,
    closingLines: [
      "Ставки являются предварительными и подлежат подтверждению на момент согласования заявки.",
      "Будем рады сотрудничеству и готовы обсудить условия подробнее.",
    ],
  };
}
