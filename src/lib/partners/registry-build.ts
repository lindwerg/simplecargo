import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

// Сводная выгрузка контрагентов из банковских данных + почты — READ-ONLY (ничего
// не пишем в реестр). Источник: bank_transactions (сырьё Точки) сгруппированное по
// ИНН/имени, обогащённое существующим реестром counterparties и почтами из
// counterparty_contacts / known_email_contacts (нечёткий матч по названию).
//
// Назначение: оператор открывает /partners/from-bank, видит «кто есть кто» по
// назначениям платежей и сам проставляет роли. Запись в реестр — отдельная Фаза 2.

export type SuggestedRole = "client" | "carrier" | "other";

export interface RegistryRow {
  /** ключ группировки (ИНН либо name:<норм-имя>) — стабильный id строки в UI */
  key: string;
  inn: string | null;
  /** все варианты названия из выписок */
  names: string[];
  totalIn: number;
  totalOut: number;
  txCount: number;
  lastTxAt: string | null;
  suggestedRole: SuggestedRole;
  /** подсказка слабая (нет ключевых слов — угадано по направлению платежа) */
  lowConfidence: boolean;
  /** уже есть в реестре counterparties (сматчен по ИНН или имени) */
  inRegistry: boolean;
  registryId: string | null;
  registryName: string | null;
  currentRoles: string[];
  /** почты с карточки контрагента (если сматчен) */
  matchedEmails: string[];
  /** кандидаты-адреса из переписки по совпадению названия (нечётко) */
  candidateEmails: string[];
  /** топ-3 назначения платежа по частоте */
  samplePurposes: string[];
}

// ── Подсказка роли ───────────────────────────────────────────────────────────
// Реальные роли в партнёрах — только client (нам платят за ТЭО) и carrier (мы
// платим за вагоны). Всё прочее — расходы компании (курьеры, ЭДО, канцелярия,
// такси, HR, налоги/взносы, банк, связь, ГСМ) → "other", в партнёры НЕ заносятся.
// Это ПОДСКАЗКА: финальную роль назначает оператор.
//
// Логика: 1) известный сервис-поставщик (по имени) или явный непрофильный платёж
// (по назначению) при исходящих деньгах ⇒ other; 2) иначе по направлению —
// приход ⇒ client, расход ⇒ carrier (назначение не перевешивает: и клиент, и
// перевозчик пишут «за вагоны»).

// Имена компаний, которые заведомо НЕ перевозчики, а сервис-расходы.
const RE_OTHER_VENDOR =
  /сдэк|cdek|комус|контур|тензор|х[эе]дхантер|headhunter|superjob|зарплата ?ру|яндекс|yandex|такси|озон|ozon|wildberries|вайлдберриз|осфр|фсс|пфр|фнс|казначейств|налогов|мегафон|билайн|ростелеком|теле ?2|тинькоф|т-банк|альфа-?банк|сбербанк|газпромнефт|лукойл|роснефт|управляющ[аяей]+ компани|клининг|delivery club|деливери/i;

// Назначения платежа, характерные для непрофильных расходов.
const RE_OTHER_PURPOSE =
  /уборк|клининг|канцеляр|канцтовар|парковк|аренд[аеуы]?\s+(?:офис|помещен|нежил)|офисн|зарплат|заработн|подотч|ндфл|налог|страховы?х?\s+взнос|взнос(?:ы|ов|а)?\s+на|пенсионн|госпошлин|комисс|эквайр|расч[её]тно-кассов|обслуживан[ия]+\s+сч[её]т|ведени[ея]\s+сч[её]т|связ[ьи]|интернет|телефон|хостинг|домен|подписк|лицензи|реклам|маркетинг|обучен|семинар|питьев|кулер|мебел|хозтовар|топлив|гсм|бензин|дизельн|корреспонденц|курьерск|доставк[аеуи]\s+(?:документ|корреспонденц)/i;

// Подтверждение фрахта в назначении — повышает уверенность для carrier.
const RE_CARRIER =
  /вагон|полувагон|п\/в|предоставлен|подвижн[оа]г?[оа] состав|перевозчик/i;
const RE_CLIENT = /тэо|транспортно-экспед|экспедир|организац[ияю]+ перевозк/i;

export function suggestRole(
  purposes: readonly string[],
  totalIn: number,
  totalOut: number,
  names: readonly string[] = [],
): { role: SuggestedRole; lowConfidence: boolean } {
  const purposeText = purposes.join(" \n ");
  const nameText = names.join(" ");
  const inDominant = totalIn > totalOut;
  const outDominant = totalOut > totalIn;
  const max = Math.max(totalIn, totalOut);
  const min = Math.min(totalIn, totalOut);
  const twoWay = min > 0 && min / max > 0.2;

  // Расход компании: сервис-поставщик по имени ИЛИ непрофильное назначение —
  // но только если деньги уходят от нас (приход = это не наш расход).
  const looksExpense = RE_OTHER_VENDOR.test(nameText) || RE_OTHER_PURPOSE.test(purposeText);
  if (looksExpense && !inDominant) return { role: "other", lowConfidence: false };

  if (inDominant) return { role: "client", lowConfidence: twoWay };
  if (outDominant) {
    const freight = RE_CARRIER.test(purposeText);
    return { role: "carrier", lowConfidence: twoWay || !freight };
  }

  // Суммы равны (часто обе 0) — опираемся на ключевые слова.
  if (looksExpense) return { role: "other", lowConfidence: false };
  const role: SuggestedRole = RE_CARRIER.test(purposeText)
    ? "carrier"
    : RE_CLIENT.test(purposeText)
      ? "client"
      : "other";
  return { role, lowConfidence: true };
}

// ── CSV (общий для API-роута и CLI-скрипта) ─────────────────────────────────

const ROLE_RU: Readonly<Record<SuggestedRole, string>> = {
  client: "клиент",
  carrier: "перевозчик",
  other: "прочее (расход)",
};

const CSV_HEADERS = [
  "Контрагент",
  "Все названия",
  "ИНН",
  "Поступления, ₽",
  "Списания, ₽",
  "Операций",
  "Последняя",
  "Роль (подсказка)",
  "Уверенность",
  "В реестре",
  "Текущие роли",
  "Почты (карточка)",
  "Почты-кандидаты",
  "Примеры назначений",
] as const;

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (`;`-разделитель, BOM для Excel UTF-8). Чистая функция. */
export function buildRegistryCsv(rows: readonly RegistryRow[]): string {
  const lines = [CSV_HEADERS.join(";")];
  for (const r of rows) {
    const cells: (string | number)[] = [
      r.registryName ?? r.names[0] ?? "—",
      r.names.join(" | "),
      r.inn ?? "",
      r.totalIn.toFixed(2),
      r.totalOut.toFixed(2),
      r.txCount,
      r.lastTxAt ? r.lastTxAt.slice(0, 10) : "",
      ROLE_RU[r.suggestedRole],
      r.lowConfidence ? "низкая" : "",
      r.inRegistry ? "да" : "нет",
      r.currentRoles.join(", "),
      r.matchedEmails.join(", "),
      r.candidateEmails.join(", "),
      r.samplePurposes.join(" ⁞ "),
    ];
    lines.push(cells.map(csvEscape).join(";"));
  }
  return `﻿${lines.join("\r\n")}`;
}

interface RawRow {
  key: string;
  inn: string | null;
  names: string[] | null;
  total_in: string | number | null;
  total_out: string | number | null;
  tx_count: number;
  last_tx_at: string | null;
  registry_id: string | null;
  registry_name: string | null;
  current_roles: string[] | null;
  matched_emails: string[] | null;
  candidate_emails: string[] | null;
  sample_purposes: string[] | null;
  [column: string]: unknown;
}

function num(v: string | number | null): number {
  if (v === null) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Порог trigram-сходства для матча к реестру и для почт-кандидатов.
const NAME_SIMILARITY = 0.4;
const EMAIL_SIMILARITY = 0.45; // почты строже — чтобы не привязать чужой адрес

// «Ядро» названия для нечёткого матча: банк хранит полное юр-наименование
// («ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ «АВГ»»), а в реестре/почтах — краткое
// («АВГ»). Срезаем юр-форму и кавычки, чтобы триграммы сравнивались по сути.
// Статический SQL (не пользовательский ввод) → sql.raw безопасен.
function coreName(col: string) {
  return sql.raw(
    `btrim(regexp_replace(regexp_replace(lower(coalesce(${col}, '')), ` +
      `'(общество с ограниченной ответственностью|публичное акционерное общество|` +
      `непубличное акционерное общество|закрытое акционерное общество|` +
      `открытое акционерное общество|акционерное общество|` +
      `индивидуальный предприниматель|[«»",])', ' ', 'g'), '[[:space:]]+', ' ', 'g'))`,
  );
}

/**
 * Строит сводный список контрагентов из банка + реестра + почты. Чистое чтение,
 * один проход по bank_transactions. Сортировка по обороту (in+out) убыв.
 */
export async function buildCounterpartyRegistry(): Promise<RegistryRow[]> {
  const result = await db.execute<RawRow>(sql`
    WITH base AS (
      SELECT
        COALESCE(NULLIF(btrim(counterparty_inn), ''),
                 'name:' || lower(btrim(COALESCE(counterparty_name, '')))) AS grp_key,
        NULLIF(btrim(counterparty_inn), '') AS inn,
        NULLIF(btrim(counterparty_name), '') AS name,
        direction,
        amount,
        posted_at,
        purpose_raw
      FROM bank_transactions
      WHERE counterparty_inn IS NOT NULL OR counterparty_name IS NOT NULL
    ),
    grouped AS (
      SELECT
        grp_key,
        max(inn) AS inn,
        array_agg(DISTINCT name) FILTER (WHERE name IS NOT NULL) AS names,
        COALESCE(sum(amount) FILTER (WHERE direction = 'in'), 0) AS total_in,
        COALESCE(sum(amount) FILTER (WHERE direction = 'out'), 0) AS total_out,
        count(*)::int AS tx_count,
        max(posted_at) AS last_tx_at
      FROM base
      GROUP BY grp_key
    ),
    purp AS (
      SELECT
        grp_key,
        purpose_raw,
        row_number() OVER (PARTITION BY grp_key ORDER BY count(*) DESC) AS rn
      FROM base
      WHERE purpose_raw IS NOT NULL AND btrim(purpose_raw) <> ''
      GROUP BY grp_key, purpose_raw
    ),
    top_purp AS (
      SELECT grp_key, array_agg(purpose_raw ORDER BY rn) AS sample_purposes
      FROM purp WHERE rn <= 3 GROUP BY grp_key
    ),
    enriched AS (
      SELECT g.*, ${coreName("g.names[1]")} AS core_name FROM grouped g
    )
    SELECT
      g.grp_key AS key,
      g.inn,
      g.names,
      g.total_in,
      g.total_out,
      g.tx_count,
      g.last_tx_at,
      tp.sample_purposes,
      cp.id AS registry_id,
      cp.name_canonical AS registry_name,
      cp.roles AS current_roles,
      cpe.emails AS matched_emails,
      cand.emails AS candidate_emails
    FROM enriched g
    LEFT JOIN top_purp tp ON tp.grp_key = g.grp_key
    LEFT JOIN LATERAL (
      SELECT c.id, c.name_canonical, c.roles, c.inn
      FROM counterparties c
      WHERE (g.inn IS NOT NULL AND c.inn = g.inn)
         OR (g.inn IS NULL AND g.core_name <> ''
             AND similarity(lower(c.name_canonical), g.core_name) > ${NAME_SIMILARITY})
      ORDER BY
        (CASE WHEN c.inn IS NOT NULL AND c.inn = g.inn THEN 1 ELSE 0 END) DESC,
        similarity(lower(c.name_canonical), g.core_name) DESC
      LIMIT 1
    ) cp ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(cc.email ORDER BY cc.is_primary DESC, cc.created_at ASC) AS emails
      FROM counterparty_contacts cc
      WHERE cp.id IS NOT NULL
        AND cc.counterparty_id = cp.id
        AND cc.email IS NOT NULL AND btrim(cc.email) <> ''
    ) cpe ON true
    LEFT JOIN LATERAL (
      SELECT array_agg(k.email_lower ORDER BY k.sim DESC) AS emails
      FROM (
        SELECT email_lower,
               similarity(${coreName("display_name_last")}, g.core_name) AS sim
        FROM known_email_contacts
        WHERE length(g.core_name) >= 4
          AND display_name_last IS NOT NULL AND btrim(display_name_last) <> ''
          AND similarity(${coreName("display_name_last")}, g.core_name) > ${EMAIL_SIMILARITY}
        ORDER BY sim DESC
        LIMIT 3
      ) k
    ) cand ON true
    ORDER BY (g.total_in + g.total_out) DESC
  `);

  return result.rows.map((r) => {
    const names = r.names ?? [];
    const samplePurposes = r.sample_purposes ?? [];
    const totalIn = num(r.total_in);
    const totalOut = num(r.total_out);
    const { role, lowConfidence } = suggestRole(samplePurposes, totalIn, totalOut, names);
    return {
      key: r.key,
      inn: r.inn,
      names,
      totalIn,
      totalOut,
      txCount: r.tx_count,
      lastTxAt: r.last_tx_at,
      suggestedRole: role,
      lowConfidence,
      inRegistry: r.registry_id !== null,
      registryId: r.registry_id,
      registryName: r.registry_name,
      currentRoles: r.current_roles ?? [],
      matchedEmails: r.matched_emails ?? [],
      candidateEmails: r.candidate_emails ?? [],
      samplePurposes,
    };
  });
}
