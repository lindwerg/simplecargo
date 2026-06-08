// Zod-схема намерения голосового расчёта тарифа. Модель возвращает JSON по этой форме;
// маршрут /api/tariff/voice валидирует ответ перед резолвом станций и расчётом матрицы.

import { z } from "zod";

export const voiceIntentSchema = z.object({
  /** Станция отправления как названа (без нормализации/ЭСР). */
  originRaw: z.string().trim().min(1).nullable(),
  /** Станция назначения как названа. */
  destRaw: z.string().trim().min(1).nullable(),
  /** Наценка предоставления, % к тарифу («под +15» → 15). null — если не названа. */
  markupPct: z.number().finite().nullable(),
  /** Г/п обычного полувагона, т, если названа («по 69»). */
  classicCapacityT: z.number().finite().positive().nullable().optional(),
  /** Г/п инновационного полувагона, т, если названа («и 74»). */
  innovativeCapacityT: z.number().finite().positive().nullable().optional(),
  /** Груз, если назван (по умолчанию щебень — модель не выдумывает). */
  etsngHint: z.string().trim().nullable().optional(),
  /** Полная расшифровка фразы — для показа оператору. */
  transcript: z.string().nullable().optional(),
});

export type VoiceIntent = z.infer<typeof voiceIntentSchema>;
