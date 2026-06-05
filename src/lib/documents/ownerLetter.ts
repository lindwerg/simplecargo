// PURE plain-text builder for the wagon-owner quote-request letter (Goal 5, part 1).
// No DB / no fetch — composes a copy-paste Russian letter from optional fields.
// Missing fields are omitted gracefully: no "null"/"undefined", no empty parentheses.

import { COMPANY, CONTACT_DEFAULT } from "@/lib/config/company";

export interface OwnerLetterInput {
  ownerName?: string;
  originName: string;
  originRoad?: string | null;
  destName: string;
  destRoad?: string | null;
  wagonTypeLabel?: string | null;
  wagonsCount?: number | null;
  cargoName?: string | null;
  periodFrom?: string | null;
  periodTo?: string | null;
  targetRate?: string | null;
  notes?: string | null;
}

/** True only for a non-empty, trimmed string value. */
function has(value?: string | null): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** "Станция (ДОРОГА)" or just "Станция" when the road is absent. */
function station(name: string, road?: string | null): string {
  return has(road) ? `${name.trim()} (${road.trim()})` : name.trim();
}

function greeting(ownerName?: string): string {
  return has(ownerName) ? `Уважаемый, ${ownerName.trim()}!` : "Уважаемые коллеги!";
}

function wagonPhrase(count?: number | null, typeLabel?: string | null): string {
  const parts: string[] = [];
  if (typeof count === "number" && Number.isFinite(count) && count > 0) {
    parts.push(String(count));
  }
  if (has(typeLabel)) parts.push(typeLabel.trim());
  return parts.length > 0 ? `${parts.join(" ")} ` : "";
}

function periodPhrase(from?: string | null, to?: string | null): string | null {
  if (has(from) && has(to)) return `Период: с ${from.trim()} по ${to.trim()}.`;
  if (has(from)) return `Период: с ${from.trim()}.`;
  if (has(to)) return `Период: по ${to.trim()}.`;
  return null;
}

export function buildOwnerLetterText(input: OwnerLetterInput): string {
  const route = `${station(input.originName, input.originRoad)} → ${station(input.destName, input.destRoad)}`;
  const wagons = wagonPhrase(input.wagonsCount, input.wagonTypeLabel);

  const lines: (string | null)[] = [
    greeting(input.ownerName),
    "",
    `Просим предоставить ставку на предоставление ${wagons}по направлению ${route}.`,
    has(input.cargoName) ? `Груз: ${input.cargoName.trim()}.` : null,
    periodPhrase(input.periodFrom, input.periodTo),
    has(input.targetRate) ? `Ориентир по ставке: ${input.targetRate.trim()}.` : null,
    has(input.notes) ? input.notes.trim() : null,
    "",
    "Будем признательны за оперативный ответ.",
    "",
    "С уважением,",
    COMPANY.shortName,
    `${CONTACT_DEFAULT.name}, тел. ${CONTACT_DEFAULT.phone}, ${CONTACT_DEFAULT.email}`,
  ];

  return lines.filter((line) => line !== null).join("\n");
}
