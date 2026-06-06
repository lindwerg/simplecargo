// mail-worker — always-on Node/TS service (MAIL_AI_INTEGRATION §2.1/Фаза 3).
// Polls mail.ru IMAP, runs the AI intake orchestrator, writes to Postgres, and
// NOTIFYs the web SSE. Single replica (multiple IMAP connections get banned).
// Run: `pnpm worker` (tsx). Without creds/flag it idle-exits 0 (no restart loop).

import crypto from "node:crypto";

import { env } from "@/lib/env";
import { fetchNewEmails, getInboxStatus, isImapConfigured, markProcessed } from "@/lib/mail/imap-client";
import { getCursor, setCursor } from "@/lib/mail/cursor";
import {
  buildIntakeDeps,
  insertQuarantineRow,
  markFileCommitted,
  markFileQuarantined,
  recordIngestedFile,
  resolveSystemUserId,
} from "@/lib/mail/intake-repo";
import { upsertKnownEmails } from "@/lib/mail/known-emails";
import { processEmail } from "@/lib/mail-intake/orchestrator";
import { buildQuarantineRow } from "@/lib/mail-intake/quarantine-map";
import type { SeenAddress } from "@/lib/mail/known-emails";
import { syncTochka } from "@/lib/finances/sync";
import {
  DEFAULT_WEBHOOK_EVENTS,
  getWebhooks,
  isTochkaConfigured,
  registerWebhook,
} from "@/lib/finances/tochka-client";

function sleep(ms: number, abort: { stopped: boolean }): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(resolve, ms);
    if (abort.stopped) {
      clearTimeout(t);
      resolve();
    }
  });
}

async function pollCycle(systemUserId: string): Promise<void> {
  const folder = env.MAILRU_IMAP_INBOX;
  const cursor = await getCursor(folder);

  // First-ever run: DON'T reprocess the whole historical inbox. Seed the cursor to
  // the current high-water mark so only mail arriving AFTER deployment is handled.
  if (!cursor.exists) {
    const status = await getInboxStatus();
    await setCursor(folder, status.highestUid, status.uidValidity);
    console.log(
      `[mail-worker] первый запуск — курсор установлен на UID ${status.highestUid}; история (всё, что было) не обрабатывается, ловим только новые письма`,
    );
    return;
  }

  const { uidValidity, highestUid, emails } = await fetchNewEmails(cursor.lastSeenUid);

  // UIDVALIDITY changed → UID space reset; drop cursor and re-scan next cycle.
  if (uidValidity !== 0 && cursor.uidValidity !== null && cursor.uidValidity !== uidValidity) {
    console.warn(`[mail-worker] UIDVALIDITY changed (${cursor.uidValidity}→${uidValidity}) — resetting cursor`);
    await setCursor(folder, 0, uidValidity);
    return;
  }

  if (emails.length > 0) {
    console.log(`[mail-worker] ${emails.length} new message(s)`);
  }

  const processedUids: number[] = [];
  for (const { uid, raw, parsed } of emails) {
    let failedFileId: string | null = null;
    try {
      const sha = crypto.createHash("sha256").update(raw).digest("hex");
      const { fileId, isNew } = await recordIngestedFile({
        contentSha256: sha,
        filename: parsed.subject || parsed.messageId || "email",
        senderEmail: parsed.from || null,
        messageId: parsed.messageId || null,
      });
      failedFileId = fileId;

      // Address directory (§6.5): sender + cc as incoming.
      const seen: SeenAddress[] = [
        { email: parsed.from, name: parsed.fromName ?? null, direction: "incoming", subject: parsed.subject },
        ...(parsed.cc ?? []).map(
          (e): SeenAddress => ({ email: e, direction: "incoming", subject: parsed.subject }),
        ),
      ];
      await upsertKnownEmails(seen);

      if (isNew) {
        const deps = buildIntakeDeps({ systemUserId, sourceFileId: fileId });
        const outcome = await processEmail(parsed, deps);
        await markFileCommitted(fileId);
        console.log(
          `[mail-worker] uid=${uid} ${outcome.classification.bodyKind} → req=${outcome.createdRequestId ?? "—"} inv=${outcome.invoiceIds.length} quote=${outcome.carrierQuotesMatched} quar=${outcome.quarantinedCount}`,
        );
      }
      processedUids.push(uid);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`[mail-worker] uid=${uid} failed:`, detail);
      // DON'T silently lose the email: park it in quarantine so the operator can
      // reprocess it, instead of just advancing the cursor into a black hole.
      try {
        await insertQuarantineRow(
          buildQuarantineRow({
            reason: "PROCESSING_ERROR",
            sourceFileId: failedFileId,
            agentReason: `Письмо упало при обработке: ${detail}`,
            draft: { uid, from: parsed.from, subject: parsed.subject, messageId: parsed.messageId },
          }),
        );
        if (failedFileId) await markFileQuarantined(failedFileId);
      } catch (qErr: unknown) {
        console.error(
          `[mail-worker] uid=${uid} не удалось записать в карантин:`,
          qErr instanceof Error ? qErr.message : qErr,
        );
      }
      processedUids.push(uid);
    }
  }

  if (processedUids.length > 0) {
    await markProcessed(processedUids);
  }
  if (highestUid > cursor.lastSeenUid) {
    await setCursor(folder, highestUid, uidValidity || cursor.uidValidity || 0);
  }
}

// ── finance: periodic statement sync (safety net if a webhook is lost) ────────
async function financeSyncJob(): Promise<void> {
  const res = await syncTochka({ months: 1 });
  console.log(
    `[finance-poll] sync: +${res.inserted} опер., разнесено ${res.linked}, счета ${res.invoicesMatched}` +
      (res.warnings.length ? `, предупреждений ${res.warnings.length}` : ""),
  );
}

// ── finance: register the Tochka webhook on boot so a fresh deploy isn't deaf to
// payments until someone clicks a button (idempotent — skip if already present). ─
async function ensureWebhookRegistered(): Promise<void> {
  if (!isTochkaConfigured() || !env.TOCHKA_WEBHOOK_URL || !env.TOCHKA_CLIENT_ID) return;
  try {
    const existing = (await getWebhooks()) as { webhooksList?: unknown; url?: unknown } | null;
    const currentUrl = existing && typeof existing === "object" ? String(existing.url ?? "") : "";
    if (currentUrl === env.TOCHKA_WEBHOOK_URL) {
      console.log("[finance-poll] вебхук уже зарегистрирован");
      return;
    }
    await registerWebhook(env.TOCHKA_WEBHOOK_URL, DEFAULT_WEBHOOK_EVENTS);
    console.log(`[finance-poll] вебхук зарегистрирован на ${env.TOCHKA_WEBHOOK_URL}`);
  } catch (error: unknown) {
    console.error(
      "[finance-poll] авто-регистрация вебхука не удалась:",
      error instanceof Error ? error.message : error,
    );
  }
}

async function main(): Promise<void> {
  const mailEnabled = env.MAIL_INTAKE_ENABLED && isImapConfigured();
  const financeEnabled = isTochkaConfigured() && env.FINANCE_POLL_MS > 0;

  if (!mailEnabled && !financeEnabled) {
    console.log("[mail-worker] почта и финансы не настроены — idle exit");
    process.exit(0);
  }

  const systemUserId = mailEnabled ? await resolveSystemUserId() : "";
  console.log(
    `[mail-worker] старт; почта=${mailEnabled ? `${env.MAILRU_IMAP_POLL_MS}мс` : "off"}, ` +
      `финансы=${financeEnabled ? `${env.FINANCE_POLL_MS}мс` : "off"}`,
  );

  const abort = { stopped: false };
  const stop = () => {
    abort.stopped = true;
    console.log("[mail-worker] остановка по сигналу");
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  if (financeEnabled) await ensureWebhookRegistered();

  // Both jobs share one process; each runs on its own cadence off a monotonic
  // "next due" clock so the tight mail poll never starves the slower finance sync.
  let nextFinanceAt = financeEnabled ? Date.now() : Infinity;
  const tickMs = mailEnabled
    ? env.MAILRU_IMAP_POLL_MS
    : Math.min(env.FINANCE_POLL_MS, 60_000);

  while (!abort.stopped) {
    if (mailEnabled) {
      try {
        await pollCycle(systemUserId);
      } catch (error: unknown) {
        console.error("[mail-worker] цикл упал:", error instanceof Error ? error.message : error);
      }
    }
    if (financeEnabled && Date.now() >= nextFinanceAt) {
      try {
        await financeSyncJob();
      } catch (error: unknown) {
        console.error("[finance-poll] цикл упал:", error instanceof Error ? error.message : error);
      }
      nextFinanceAt = Date.now() + env.FINANCE_POLL_MS;
    }
    if (abort.stopped) break;
    await sleep(tickMs, abort);
  }
  process.exit(0);
}

void main();
