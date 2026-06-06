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
  markFileCommitted,
  recordIngestedFile,
  resolveSystemUserId,
} from "@/lib/mail/intake-repo";
import { upsertKnownEmails } from "@/lib/mail/known-emails";
import { processEmail } from "@/lib/mail-intake/orchestrator";
import type { SeenAddress } from "@/lib/mail/known-emails";

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
    try {
      const sha = crypto.createHash("sha256").update(raw).digest("hex");
      const { fileId, isNew } = await recordIngestedFile({
        contentSha256: sha,
        filename: parsed.subject || parsed.messageId || "email",
        senderEmail: parsed.from || null,
        messageId: parsed.messageId || null,
      });

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
          `[mail-worker] uid=${uid} ${outcome.classification.bodyKind} → req=${outcome.createdRequestId ?? "—"} inv=${outcome.invoiceIds.length} quar=${outcome.quarantinedCount}`,
        );
      }
      processedUids.push(uid);
    } catch (error: unknown) {
      console.error(`[mail-worker] uid=${uid} failed:`, error instanceof Error ? error.message : error);
      // leave cursor logic to advance past it (sha gate prevents dup); logged for ops
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

async function main(): Promise<void> {
  if (!env.MAIL_INTAKE_ENABLED) {
    console.log("[mail-worker] MAIL_INTAKE_ENABLED=false — idle exit");
    process.exit(0);
  }
  if (!isImapConfigured()) {
    console.log("[mail-worker] нет MAILRU_IMAP_USER/APP_PASSWORD — idle exit");
    process.exit(0);
  }

  const systemUserId = await resolveSystemUserId();
  console.log(`[mail-worker] старт; опрос каждые ${env.MAILRU_IMAP_POLL_MS} мс`);

  const abort = { stopped: false };
  const stop = () => {
    abort.stopped = true;
    console.log("[mail-worker] остановка по сигналу");
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);

  while (!abort.stopped) {
    try {
      await pollCycle(systemUserId);
    } catch (error: unknown) {
      console.error("[mail-worker] цикл упал:", error instanceof Error ? error.message : error);
    }
    if (abort.stopped) break;
    await sleep(env.MAILRU_IMAP_POLL_MS, abort);
  }
  process.exit(0);
}

void main();
