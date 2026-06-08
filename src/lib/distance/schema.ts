import { z } from "zod";

// Zod contracts for the ТР-4 distance engine (TARIFF_CALCULATOR §3.1, §5).
// DistanceInput is the boundary input (origin/dest ESR + optional empty-run flag);
// DistanceResult is the engine output: km may be null when the graph cannot resolve
// a route (missing backbone edge) — the engine NEVER fabricates a number, it returns
// confidence='red' with a warnings[] entry instead.

const ESR = z
  .string()
  .trim()
  .regex(/^\d{6}$/, "ESR должен быть 6 цифр");

export const distanceInputSchema = z.object({
  originEsr: ESR,
  destEsr: ESR,
  // Порожний пробег uses the IDENTICAL distance graph (§3.1); the flag is carried
  // through so callers/price layer can branch, it does not change the km computation.
  emptyRun: z.boolean().optional().default(false),
});

export type DistanceInput = z.infer<typeof distanceInputSchema>;

export const distanceConfidence = z.enum(["green", "yellow", "red"]);
export type DistanceConfidence = z.infer<typeof distanceConfidence>;

// One resolved leg of the chosen minimal route, for transparency / debugging.
export const distanceLegSchema = z.object({
  kind: z.enum(["spur-origin", "backbone", "spur-dest", "hub-adder", "special", "direct"]),
  fromEsr: z.string().nullable(),
  toEsr: z.string().nullable(),
  km: z.number(),
});

export type DistanceLeg = z.infer<typeof distanceLegSchema>;

export const distanceResultSchema = z.object({
  km: z.number().int().nonnegative().nullable(),
  legs: z.array(distanceLegSchema),
  confidence: distanceConfidence,
  warnings: z.array(z.string()),
});

export type DistanceResult = z.infer<typeof distanceResultSchema>;
