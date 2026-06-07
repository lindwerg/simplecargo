// Поиск направлений (сделок) для привязки писем «Входящих». Направление —
// операционная единица на карточке сделки (/deals/[id] = заказ → направления).
// Возвращает {id, label} по образцу counterparties/search.

import { and, desc, eq, ilike, ne, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { directions } from "@/lib/db/schema/directions";
import { orders } from "@/lib/db/schema/orders";

export interface DirectionMatch {
  id: string;
  label: string;
}

function labelFor(r: {
  displayName: string | null;
  originRaw: string | null;
  destRaw: string | null;
  orderTitle: string | null;
  orderNumber: string | null;
}): string {
  if (r.displayName) return r.displayName;
  const route = [r.originRaw, r.destRaw].filter(Boolean).join(" → ");
  return route || r.orderTitle || r.orderNumber || "Направление";
}

export async function searchDirections(q: string, limit = 8): Promise<DirectionMatch[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const rows = await db
    .select({
      id: directions.id,
      displayName: directions.displayName,
      originRaw: directions.stationOriginRaw,
      destRaw: directions.stationDestRaw,
      orderTitle: orders.title,
      orderNumber: orders.orderNumber,
    })
    .from(directions)
    .leftJoin(orders, eq(directions.orderId, orders.id))
    .where(
      and(
        ne(directions.status, "cancelled"),
        or(
          ilike(directions.displayName, like),
          ilike(directions.stationOriginRaw, like),
          ilike(directions.stationDestRaw, like),
          ilike(orders.title, like),
        ),
      ),
    )
    .orderBy(desc(directions.createdAt))
    .limit(Math.min(Math.max(limit, 1), 25));
  return rows.map((r) => ({ id: r.id, label: labelFor(r) }));
}
