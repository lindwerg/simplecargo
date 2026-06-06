// IMAP idempotency cursor (MAIL_AI_INTEGRATION §3.2). One row per folder in
// mail_cursor: the highest UID we've processed + the folder's UIDVALIDITY. On a
// UIDVALIDITY change the UID space reset → we reset the cursor and re-scan.

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { mailCursor } from "@/lib/db/schema/mailCursor";

export interface CursorState {
  lastSeenUid: number;
  uidValidity: number | null;
}

export async function getCursor(folder: string): Promise<CursorState> {
  const rows = await db
    .select({ lastSeenUid: mailCursor.lastSeenUid, uidValidity: mailCursor.uidValidity })
    .from(mailCursor)
    .where(eq(mailCursor.folder, folder))
    .limit(1);
  const row = rows[0];
  return { lastSeenUid: row?.lastSeenUid ?? 0, uidValidity: row?.uidValidity ?? null };
}

export async function setCursor(
  folder: string,
  lastSeenUid: number,
  uidValidity: number,
): Promise<void> {
  await db
    .insert(mailCursor)
    .values({ folder, lastSeenUid, uidValidity, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: mailCursor.folder,
      set: { lastSeenUid, uidValidity, updatedAt: new Date() },
    });
}

/** UIDVALIDITY changed → the server reassigned UIDs; drop our cursor and re-scan. */
export async function resetCursorIfInvalid(
  folder: string,
  serverUidValidity: number,
): Promise<CursorState> {
  const cur = await getCursor(folder);
  if (cur.uidValidity !== null && cur.uidValidity !== serverUidValidity) {
    await setCursor(folder, 0, serverUidValidity);
    return { lastSeenUid: 0, uidValidity: serverUidValidity };
  }
  return cur;
}
