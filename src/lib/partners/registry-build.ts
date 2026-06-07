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

// ── Подсказка роли по назначению платежа ─────────────────────────────────────
// Реальные роли — только client (нам платят за ТЭО) и carrier (мы платим за
// вагоны). Всё прочее (парковка, канцелярия, услуги, налоги) — расход компании
// → "other". Это только ПОДСКАЗКА: финальную роль назначает оператор.
//
// ГЛАВНЫЙ сигнал — направление денег: приход (нам платят) ⇒ клиент; расход (мы
// платим) ⇒ перевозчик. Назначение платежа НЕ перевешивает направление (и клиент,
// и перевозчик в назначении пишут «за вагоны»). Ключевые слова лишь отделяют
// офисные расходы (исходящие, но не фрахт) и разруливают спорные случаи.

const RE_OTHER =
  /парковк|канцеляр|аренда офис|офисн|зарплат|заработн|подотч|налог|страхов|взнос|комисс|эквайр|интернет|связ[ьи]|хозтовар|клининг|питьев|кулер|мебел|реклам|госпошлин|подписк|хостинг/i;
const RE_CARRIER =
  /вагон|полувагон|п\/в|предоставлен|подвижн[оа]г?[оа] состав|перевозчик/i;
const RE_CLIENT = /тэо|транспортно-экспед|экспедир|организац[ияю]+ перевозк/i;

export function suggestRole(
  purposes: readonly string[],
  totalIn: number,
  totalOut: number,
): { role: SuggestedRole; lowConfidence: boolean } {
  const text = purposes.join(" \n ");
  const inDominant = totalIn > totalOut;
  const outDominant = totalOut > totalIn;
  const hasOther = RE_OTHER.test(text);

  let role: SuggestedRole;
  if (outDominant && hasOther)
    role = "other"; // исходящий офисный расход
  else if (inDominant)
    role = "client"; // нам платят → клиент
  else if (outDominant)
    role = "carrier"; // мы платим → перевозчик
  else
    // суммы равны (часто обе 0) — опираемся на ключевые слова
    role = hasOther ? "other" : RE_CARRIER.test(text) ? "carrier" : RE_CLIENT.test(text) ? "client" : "other";

  // Слабая уверенность: денег нет вовсе, либо двусторонний контрагент (обе стороны
  // существенны) — направление неоднозначно, оператору стоит присмотреться.
  const max = Math.max(totalIn, totalOut);
  const min = Math.min(totalIn, totalOut);
  const twoWay = min > 0 && min / max > 0.2;
  const lowConfidence = (totalIn === 0 && totalOut === 0) || twoWay;
  return { role, lowConfidence };
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
    const { role, lowConfidence } = suggestRole(samplePurposes, totalIn, totalOut);
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
