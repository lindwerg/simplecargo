import { z } from "zod";

// Zod validators for the Запросы (RFQ intake) slice. PURE — no DB import, so the
// CI test step (no Postgres/env) can exercise every schema. Mirrors the
// directions/pricing schema style (optText/optRate helpers, find-or-create union).

// ── shared primitives ────────────────────────────────────────────────────────

// Tolerant optionals: accept null / "" / whitespace (the AI and external callers
// may send null) and normalize to undefined so .optional() validators pass.
const optText = z.preprocess((v) => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s.length > 0 ? s : undefined;
}, z.string().optional());

const nullToUndef = (v: unknown): unknown =>
  v === null || v === "" ? undefined : v;

const optRate = z.preprocess(
  nullToUndef,
  z.coerce.number().positive("Ставка должна быть больше 0").optional(),
);

const optNum = z.preprocess(nullToUndef, z.coerce.number().positive().optional());
const optEsr = z.preprocess(nullToUndef, z.string().length(6).optional());

export const REQUEST_CHANNELS = ["upload", "voice", "paste", "manual"] as const;
export const LOSS_REASONS = [
  "price",
  "no_capacity",
  "client_cancelled",
  "timing",
  "competitor",
  "other",
] as const;

// ── requestLineInput — one route card ────────────────────────────────────────

export const requestLineInputSchema = z.object({
  originRaw: z.string().trim().min(1, "Станция отправления обязательна"),
  originRoadRaw: optText,
  destRaw: z.string().trim().min(1, "Станция назначения обязательна"),
  destRoadRaw: optText,
  // ESR resolved externally (dict lookup) — nullable, never invented (D15)
  originEsr: optEsr,
  destEsr: optEsr,
  cargoName: optText,
  etsngCode: optText,
  wagonsRequested: z.coerce.number().int().min(1, "Количество вагонов ≥ 1"),
  tonnagePerWagon: optNum,
  targetRatePerWagon: optRate, // D16: client's desired rate — SUGGESTED only
  targetRateRaw: optText,
  // Goal 3: per-line wagon type (canonical code or raw, never invented)
  wagonType: optText,
  // Goal 4: rate expression — markup may be 0 or negative, so NOT coerced positive
  targetRateKind: z.enum(["flat_rub", "tariff_indicative", "tariff_plus_markup"]).optional(),
  targetRateMarkupPct: z.preprocess(nullToUndef, z.coerce.number().optional()),
  targetTariffClass: z.preprocess(nullToUndef, z.coerce.number().int().min(1).max(3).optional()),
  targetTariffRef: optText,
  sortOrder: z.coerce.number().int().min(0).optional(),
});

export type RequestLineInput = z.infer<typeof requestLineInputSchema>;

// ── requestCreateInput ────────────────────────────────────────────────────────

export const requestCreateSchema = z.object({
  // D16: a real counterparty id OR a free-text TEMP label (clientRaw); both nullable
  clientSuggestedId: z.uuid().optional(),
  clientRaw: optText,
  channel: z.enum(REQUEST_CHANNELS).default("manual"),
  wagonType: optText,
  cargoName: optText,
  periodFrom: optText, // ISO datetime string
  periodTo: optText,
  receivedAt: optText,
  validUntil: optText,
  sourceRef: optText,
  notes: optText,
  lines: z.array(requestLineInputSchema).min(1, "Нужна хотя бы одна строка маршрута"),
});

export type RequestCreateInput = z.infer<typeof requestCreateSchema>;

// ── requestUpdate — header fields only ────────────────────────────────────────

export const requestUpdateSchema = z.object({
  clientSuggestedId: z.uuid().optional(),
  clientRaw: optText,
  wagonType: optText,
  cargoName: optText,
  periodFrom: optText,
  periodTo: optText,
  validUntil: optText,
  notes: optText,
  channel: z.enum(REQUEST_CHANNELS).optional(),
});

export type RequestUpdateInput = z.infer<typeof requestUpdateSchema>;

// ── status transition ────────────────────────────────────────────────────────

const requestStatusEnum = z.enum([
  "new",
  "sourcing",
  "quoted",
  "won",
  "lost",
  "no_bid",
  "expired",
  "cancelled",
]);

export const requestTransitionSchema = z.object({
  to: requestStatusEnum,
  lossReason: z.enum(LOSS_REASONS).optional(),
  competitorPrice: optRate,
  lostTo: optText,
});

export type RequestTransitionInput = z.infer<typeof requestTransitionSchema>;

// ── linkClient — promote a TEMP clientRaw label to a real counterparty (D16) ──

export const linkClientSchema = z.object({
  counterparty: z.union([
    z.object({ id: z.uuid() }),
    z.object({ name: z.string().trim().min(1, "Название клиента обязательно"), inn: z.string().optional() }),
  ]),
});

export type LinkClientInput = z.infer<typeof linkClientSchema>;

// ── list filter ──────────────────────────────────────────────────────────────

export const requestListFilterSchema = z.object({
  bucket: z.enum(["active", "archive"]).default("active"),
  clientId: z.uuid().optional(),
  originRaw: z.string().trim().optional(),
  roadRaw: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
});

export type RequestListFilter = z.infer<typeof requestListFilterSchema>;

// ── AI extraction (REQUESTS_SOURCING §11) ─────────────────────────────────────
// The LLM is asked to EMIT nullable fields (never omit); the pure normalizer
// (normalize.ts) then forward-fills blank origins, drops Итого rows, normalizes
// road codes, and coerces numbers. The post-normalize payload is what the API
// returns for the operator to confirm.

export const extractedLineSchema = z.object({
  originRaw: z.string().nullable().default(null),
  originRoadRaw: z.string().nullable().default(null),
  destRaw: z.string().nullable().default(null),
  destRoadRaw: z.string().nullable().default(null),
  cargoName: z.string().nullable().default(null),
  etsngCode: z.string().nullable().default(null),
  wagonsRequested: z.number().nullable().default(null),
  tonnagePerWagon: z.number().nullable().default(null),
  targetRatePerWagon: z.number().nullable().default(null),
  targetRateRaw: z.string().nullable().default(null),
  // Goal 3 + Goal 4: per-line wagon type + rate expression (AI may emit; never invented)
  wagonType: z.string().nullable().default(null),
  targetRateKind: z.string().nullable().default(null),
  targetRateMarkupPct: z.number().nullable().default(null),
  targetTariffClass: z.number().nullable().default(null),
  targetTariffRef: z.string().nullable().default(null),
});

export type ExtractedLine = z.infer<typeof extractedLineSchema>;

export const extractionResultSchema = z.object({
  clientGuess: z.string().nullable().default(null), // D16: SUGGESTION only
  wagonType: z.string().nullable().default(null),
  periodFrom: z.string().nullable().default(null),
  periodTo: z.string().nullable().default(null),
  lines: z.array(extractedLineSchema).default([]),
  warnings: z.array(z.string()).default([]),
});

export type ExtractionResult = z.infer<typeof extractionResultSchema>;

// ── extract endpoint input (JSON modalities) ──────────────────────────────────
// XLSX/image-file uploads arrive as multipart; the route converts them and
// re-dispatches as text/image. The JSON body covers text/image/audio directly.

const MAX_TEXT_CHARS = 200_000;
const DATA_URL_RE =
  /^data:(image\/(png|jpe?g|webp)|audio\/(wav|mpeg|mp3|webm|ogg|m4a|mp4));base64,/;

export const extractInputSchema = z.discriminatedUnion("modality", [
  z.object({
    modality: z.literal("text"),
    text: z.string().trim().min(1, "Пустой текст").max(MAX_TEXT_CHARS),
    clientHint: z.string().trim().max(200).optional(),
    isTable: z.boolean().optional(),
  }),
  z.object({
    modality: z.literal("image"),
    dataUrl: z.string().regex(DATA_URL_RE, "Ожидается image data URL"),
    clientHint: z.string().trim().max(200).optional(),
  }),
  z.object({
    modality: z.literal("audio"),
    dataUrl: z.string().regex(DATA_URL_RE, "Ожидается audio data URL"),
    clientHint: z.string().trim().max(200).optional(),
  }),
]);

export type ExtractInput = z.infer<typeof extractInputSchema>;
