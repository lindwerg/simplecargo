import type { WebhookPayload } from "./webhook";

// Реальное время операции для денежного потока. Выписка Точки времени не отдаёт
// (documentProcessDate — только дата), но вебхук о проведении платежа приходит
// в реальном времени и несёт подписанный JWT с `iat` ≈ моментом операции.
// Эти чистые помощники извлекают это время и решают, какой операции его ставить.

const RECENT_DOC_WINDOW_MS = 2 * 24 * 60 * 60 * 1000; // 2 дня в прошлое
const FUTURE_SKEW_MS = 24 * 60 * 60 * 1000; // 1 день вперёд (таймзона/полночь)

/**
 * Время уведомления из webhook-пейлоада. `iat` — момент выпуска JWT (в секундах)
 * ≈ момент проведения операции. Возвращаем Date либо null, если `iat` нет/битый —
 * тогда вызывающий подставит время приёма вебхука.
 */
export function notifiedTimeFromPayload(payload: WebhookPayload | null): Date | null {
  if (!payload) return null;
  const iat = typeof payload.iat === "number" ? payload.iat : null;
  if (iat === null) return null;
  const d = new Date(iat * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Стоит ли проставлять реальное время операции с датой `postedAt`. Вебхук всегда
 * про только что прошедшую операцию (дата документа ~сегодня), поэтому помечаем
 * только «свежие». Иначе пере-синк, догоняющий пропущенную старую операцию,
 * проставил бы ей время «сейчас» и выкинул бы её наверх своего дня.
 */
export function isRecentDoc(
  postedAt: Date,
  opts: { now?: Date; windowMs?: number } = {},
): boolean {
  const now = opts.now ?? new Date();
  const windowMs = opts.windowMs ?? RECENT_DOC_WINDOW_MS;
  const diff = now.getTime() - postedAt.getTime();
  return diff >= -FUTURE_SKEW_MS && diff <= windowMs;
}
