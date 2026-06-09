import { z } from "zod";

// Zod boundary validation for the ТР-1 2026 tariff engine (TARIFF_CALCULATOR §5).
// computeTariff() takes a validated TariffInput and returns a TariffBreakdown whose
// `source`/`confidence`/`warnings[]` make graceful degradation explicit: when any
// required table/row is missing the engine returns confidence 'red' with a warning,
// it never fabricates a number.

export const OWNERSHIPS = ["rzd", "own"] as const;
export const SHIPMENT_TYPES = ["wagon", "group", "route"] as const;
export const TRAFFIC_KINDS = ["domestic", "export", "import"] as const;
export const CONFIDENCE_LEVELS = ["green", "yellow", "red"] as const;
export const TARIFF_SOURCES = ["computed", "remembered"] as const;

export type Ownership = (typeof OWNERSHIPS)[number];
export type ShipmentType = (typeof SHIPMENT_TYPES)[number];
export type TrafficKind = (typeof TRAFFIC_KINDS)[number];
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];
export type TariffSource = (typeof TARIFF_SOURCES)[number];
export type FreightClass = 1 | 2 | 3;

// Input to the engine. Distance is computed internally from origin/dest ESR via the
// distance engine; the pure core is fed an already-resolved distance (see TariffData).
export const tariffInputSchema = z.object({
  originEsr: z.string().trim().min(1, "Станция отправления (ЕСР)"),
  destEsr: z.string().trim().min(1, "Станция назначения (ЕСР)"),
  wagonType: z.string().trim().min(1, "Тип вагона"), // canonical (src/lib/wagons)
  ownership: z.enum(OWNERSHIPS),
  shipmentType: z.enum(SHIPMENT_TYPES),
  etsngCode: z.string().trim().min(1, "Код ЕТСНГ"),
  actualWeightTons: z.coerce.number().positive("Вес должен быть > 0"),
  axles: z.coerce.number().int().positive().optional(), // for порожний
  asOfDate: z.coerce.date(), // drives indexation compounding
  traffic: z.enum(TRAFFIC_KINDS),
  emptyReturn: z.boolean().optional(),
  /** Number of wagons in the отправка — drives K4 (отправочный) from wagon-count × distance table. */
  wagonCount: z.coerce.number().int().positive().optional(),
  /** Wagon model string (e.g. "12-9761-02") — drives innovative 0.9595 lookup from tr1-innovative-models. */
  wagonModel: z.string().trim().optional(),
  /**
   * Container size code for контейнерные отправки (schemes N85-94). One of the canonical
   * sizes in tr1-i-belts-container.json: "3т" | "5т" | "10т" | "20ft" | "40ft". Required
   * to resolve the per-container linearAB plate (A + B×KL). Absent for non-container wagons.
   */
  containerSize: z.string().trim().optional(),
});

/** Canonical container-size codes (mirror tr1-i-belts-container.json containerSizeMap keys). */
export const CONTAINER_SIZES = ["3т", "5т", "10т", "20ft", "40ft"] as const;
export type ContainerSize = (typeof CONTAINER_SIZES)[number];

export type TariffInput = z.infer<typeof tariffInputSchema>;

// The price breakdown the engine returns. All ₽ amounts are per-wagon, без НДС until
// the final `total` (which carries НДС). `confidence`/`warnings` gate downstream use:
// КП auto-fill consumes only 'green'; 'yellow' shows with a flag; 'red' forces manual.
export interface TariffBreakdown {
  distanceKm: number;
  iComponent: number;
  vComponent: number;
  emptyRun: number;
  surcharges: number;
  preIndex: number; // без НДС, before indexation
  indexFactor: number; // ∏(1 + index_i/100)
  postIndex: number; // без НДС, after indexation
  vatRate: number; // 22 domestic / 0 export
  total: number; // с НДС
  tariffClass: FreightClass;
  chargeableTons: number;
  source: TariffSource;
  confidence: Confidence;
  warnings: string[];
}
