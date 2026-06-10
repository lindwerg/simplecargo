// IMPURE: общий код «дислокация → направление» для ручной кнопки
// (/api/inbox/[id]/dislocation) и авто-роутинга в оркестраторе (по
// direction_owner_bindings.inbound_mailbox). Делает три вещи разом:
//   1) линкует письмо к направлению (ingested_files.direction_id);
//   2) дописывает распознанные номера в expected_wagon_ids активной owner-привязки;
//   3) СОХРАНЯЕТ результат разбора в wagon_movements (load_state ГРУЖ/ПОР/UNKNOWN,
//      source_file_id = письмо) — счётчики «груж/порож» переживают перезагрузку
//      страницы и питают воронку «Исполнение» (execution/repository).
// Никаких новых таблиц/колонок: wagon_movements уже в БД, дедуп по fingerprint.

import crypto from "node:crypto";

import { asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { ingestedFiles } from "@/lib/db/schema/ingest";
import { wagonMovements } from "@/lib/db/schema/movements";
import { wagons } from "@/lib/db/schema/wagons";
import { mergeExpectedWagons } from "@/lib/directions/repository";
import { getEmailExtractableText, setInboxLink } from "./inbox-repo";
import { parseDislocation, type DislocationSummary } from "./parse-dislocation";

export interface ApplyDislocationResult {
  summary: DislocationSummary;
  savedToBinding: boolean;
  expectedCount: number;
  movementsSaved: number; // новых строк wagon_movements (повторный разбор → 0)
}

function loadStateOf(loaded: boolean | null): "ГРУЖ" | "ПОР" | "UNKNOWN" {
  if (loaded === true) return "ГРУЖ";
  if (loaded === false) return "ПОР";
  return "UNKNOWN";
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

// Снапшоты разбора письма → wagon_movements. Идемпотентно: fingerprint включает
// письмо+вагон+состояние, повторный клик/прогон ничего не дублирует.
async function saveDislocationMovements(
  emailId: string,
  summary: DislocationSummary,
): Promise<number> {
  if (summary.wagons.length === 0) return 0;

  const fileRows = await db
    .select({ receivedAt: ingestedFiles.receivedAt })
    .from(ingestedFiles)
    .where(eq(ingestedFiles.id, emailId))
    .limit(1);
  const operationTs = fileRows[0]?.receivedAt ?? new Date();

  // FK wagon_movements.wagon_number → wagons: заводим недостающие вагоны.
  // Контрольная цифра уже проверена парсером (isValidWagonNumber).
  await db
    .insert(wagons)
    .values(summary.wagons.map((w) => ({ wagonNumber: w.number, checksumValid: "ok" })))
    .onConflictDoNothing({ target: wagons.wagonNumber });

  const inserted = await db
    .insert(wagonMovements)
    .values(
      summary.wagons.map((w) => {
        const loadState = loadStateOf(w.loaded);
        return {
          fingerprint: sha256(`dislocation-email|${emailId}|${w.number}|${loadState}`),
          eventKey: sha256(
            `dislocation-email|${w.number}|${operationTs.toISOString()}|${loadState}`,
          ),
          sourceFileId: emailId,
          sourceType: "E",
          wagonNumber: w.number,
          loadState,
          operationTs,
        };
      }),
    )
    .onConflictDoNothing({ target: wagonMovements.fingerprint })
    .returning({ id: wagonMovements.id });
  return inserted.length;
}

/** Привязать письмо-дислокацию к направлению: разбор пономерного списка (тело +
 *  ВСЕ листы xlsx-вложений), линк письма, дозапись expected_wagon_ids и сохранение
 *  снапшотов в wagon_movements. Единая точка для route.ts и оркестратора. */
export async function applyDislocationToDirection(
  emailId: string,
  directionId: string,
): Promise<ApplyDislocationResult> {
  const text = await getEmailExtractableText(emailId, { allSheets: true });
  const summary = parseDislocation(text);

  await setInboxLink(emailId, directionId);
  const merge = await mergeExpectedWagons(
    directionId,
    summary.wagons.map((w) => w.number),
  );
  const movementsSaved = await saveDislocationMovements(emailId, summary);

  return {
    summary,
    savedToBinding: merge.saved,
    expectedCount: merge.expectedCount,
    movementsSaved,
  };
}

/** Сохранённый результат разбора письма-дислокации (из wagon_movements по
 *  source_file_id) — чтобы счётчики «разобрано: N вагонов, X груж / Y порож»
 *  были видны после перезагрузки страницы письма. Null = письмо не разбиралось. */
export async function getSavedDislocationSummary(
  emailId: string,
): Promise<DislocationSummary | null> {
  const rows = await db
    .select({ wagonNumber: wagonMovements.wagonNumber, loadState: wagonMovements.loadState })
    .from(wagonMovements)
    .where(eq(wagonMovements.sourceFileId, emailId))
    .orderBy(asc(wagonMovements.wagonNumber));
  if (rows.length === 0) return null;

  const wagonsParsed = rows.map((r) => ({
    number: r.wagonNumber,
    loaded: r.loadState === "ГРУЖ" ? true : r.loadState === "ПОР" ? false : null,
  }));
  return {
    wagons: wagonsParsed,
    total: wagonsParsed.length,
    loaded: wagonsParsed.filter((w) => w.loaded === true).length,
    empty: wagonsParsed.filter((w) => w.loaded === false).length,
  };
}
