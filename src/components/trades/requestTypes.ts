// Shared types for the interactive «Запрос» quoting worksheet.

export type CargoType = "stone_only" | "wagons_only" | "stone_with_transport";

export interface PartyInit {
  id: string | null;
  name: string | null;
}

export interface RequestWorksheetProps {
  dealId: string;
  /** Order status: draft|confirmed|active|completed|cancelled. */
  status: string;
  /** Quoting sub-status: quoting|quoted|won. */
  quoteStatus: string;
  guNumber: string | null;
  dealType: CargoType | null;
  clientName: string | null;
  initial: {
    cargoType: CargoType;
    origin: { raw: string; esr: string | null } | null;
    dest: { raw: string; esr: string | null } | null;
    rateClient: string | null;
    /** Целевая ставка клиента из запроса (suggestion-only) — подсказка у «Ставка клиенту». */
    rateClientSuggested: string | null;
    rateOwner: string | null;
    wagonCount: number | null;
    priceSale: string | null;
    pricePurchase: string | null;
    tonnage: string | null;
    fraction: string | null;
    client: PartyInit | null;
    owner: PartyInit | null;
    quarry: PartyInit | null;
  };
}

// ── Server response shapes (mirror of MatrixResult from lib/tariff/quoteMatrix) ──

export interface MatrixCell {
  tariffNoVat: number;
  tariffWithVat: number;
  inventoryNoVat: number;
  inventoryWithVat: number;
  provisionNoVat: number;
  provisionWithVat: number;
}

export interface MatrixRow {
  band: string;
  bandLabel: string;
  representativeCount: number;
  classic: MatrixCell;
  innovative: MatrixCell;
}

export interface MatrixResult {
  scope: "supported" | "out-of-scope";
  confidence: "green" | "yellow" | "red";
  distanceKm: number | null;
  distanceLegs: ReadonlyArray<{ kind: string; km: number }>;
  tariffClass: 1 | 2 | 3 | null;
  etsngCode: string;
  etsngName: string | null;
  classicCapacityT: number;
  innovativeCapacityT: number;
  ownerCoeff: number;
  vatRate: number;
  rows: MatrixRow[];
  warnings: string[];
}

/** Standard API envelope (mirrors lib/api/response). */
export interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** True when the cargo type involves rail wagons (and thus route + tariff + wagon prices). */
export function hasWagons(t: CargoType): boolean {
  return t === "wagons_only" || t === "stone_with_transport";
}

/** True when the cargo type involves crushed stone (and thus stone prices). */
export function hasStone(t: CargoType): boolean {
  return t === "stone_only" || t === "stone_with_transport";
}
