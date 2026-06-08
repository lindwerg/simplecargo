// «Аналитика по отгрузкам» контрагента. Агрегаты по deals (по-вагонные рейсы)
// и, для карьеров, по order_stone_lines (щебень). Роль-адаптивно: для клиента —
// выручка/маржа, для собственника/перевозчика — затраты/оборачиваемость, для
// карьера — поставленный тоннаж и сумма закупки.

import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";

const MONTHS_LIMIT = 12;

export interface MonthlyPoint {
  month: string; // YYYY-MM
  revenue: number; // выручка (как клиент)
  cost: number; // затраты (как собственник)
  margin: number; // наша маржа по рейсам этого контрагента-клиента
  deals: number;
}

export interface PartnerAnalytics {
  dealsCount: number;
  asClientCount: number;
  asOwnerCount: number;
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  avgTurnoverDays: number | null;
  monthly: MonthlyPoint[];
  /** Заполняется только для карьеров (роль quarry). */
  stone: { linesCount: number; tonnage: number; purchaseAmount: number } | null;
}

interface TotalsRow {
  deals: number;
  as_client: number;
  as_owner: number;
  total_revenue: string | null;
  total_cost: string | null;
  total_margin: string | null;
  avg_turnover: string | null;
  [column: string]: unknown;
}

interface MonthlyRow {
  month: string;
  revenue: string | null;
  cost: string | null;
  margin: string | null;
  deals: number;
  [column: string]: unknown;
}

interface StoneRow {
  lines: number;
  tonnage: string | null;
  purchase: string | null;
  [column: string]: unknown;
}

export async function getPartnerAnalytics(
  partnerId: string,
  roles: readonly string[],
): Promise<PartnerAnalytics> {
  const isQuarry = roles.includes("quarry");

  const [totalsResult, monthlyResult, stoneResult] = await Promise.all([
    db.execute<TotalsRow>(sql`
      SELECT
        count(*)::int AS deals,
        count(*) FILTER (WHERE client_id = ${partnerId})::int AS as_client,
        count(*) FILTER (WHERE owner_id = ${partnerId})::int AS as_owner,
        COALESCE(sum(revenue_ua) FILTER (WHERE client_id = ${partnerId}), 0)::text AS total_revenue,
        COALESCE(sum(cost_owner) FILTER (WHERE owner_id = ${partnerId}), 0)::text AS total_cost,
        COALESCE(sum(margin) FILTER (WHERE client_id = ${partnerId}), 0)::text AS total_margin,
        avg(turnover_days) FILTER (WHERE turnover_days IS NOT NULL)::text AS avg_turnover
      FROM deals
      WHERE client_id = ${partnerId} OR owner_id = ${partnerId}
    `),
    db.execute<MonthlyRow>(sql`
      SELECT
        report_month AS month,
        COALESCE(sum(revenue_ua) FILTER (WHERE client_id = ${partnerId}), 0)::text AS revenue,
        COALESCE(sum(cost_owner) FILTER (WHERE owner_id = ${partnerId}), 0)::text AS cost,
        COALESCE(sum(margin) FILTER (WHERE client_id = ${partnerId}), 0)::text AS margin,
        count(*)::int AS deals
      FROM deals
      WHERE client_id = ${partnerId} OR owner_id = ${partnerId}
      GROUP BY report_month
      ORDER BY report_month DESC
      LIMIT ${MONTHS_LIMIT}
    `),
    isQuarry
      ? db.execute<StoneRow>(sql`
          SELECT
            count(*)::int AS lines,
            COALESCE(sum(tonnage_actual), 0)::text AS tonnage,
            COALESCE(sum(tonnage_actual * price_purchase), 0)::text AS purchase
          FROM order_stone_lines
          WHERE quarry_supplier_id = ${partnerId}
        `)
      : Promise.resolve({ rows: [] as StoneRow[] }),
  ]);

  const t = totalsResult.rows[0];
  const stoneRow = stoneResult.rows[0];

  return {
    dealsCount: t?.deals ?? 0,
    asClientCount: t?.as_client ?? 0,
    asOwnerCount: t?.as_owner ?? 0,
    totalRevenue: Number(t?.total_revenue ?? 0),
    totalCost: Number(t?.total_cost ?? 0),
    totalMargin: Number(t?.total_margin ?? 0),
    avgTurnoverDays: t?.avg_turnover != null ? Math.round(Number(t.avg_turnover)) : null,
    monthly: monthlyResult.rows
      .map((m) => ({
        month: m.month,
        revenue: Number(m.revenue ?? 0),
        cost: Number(m.cost ?? 0),
        margin: Number(m.margin ?? 0),
        deals: m.deals,
      }))
      .reverse(), // хронологически (старые → новые) для графика
    stone: isQuarry
      ? {
          linesCount: stoneRow?.lines ?? 0,
          tonnage: Number(stoneRow?.tonnage ?? 0),
          purchaseAmount: Number(stoneRow?.purchase ?? 0),
        }
      : null,
  };
}
