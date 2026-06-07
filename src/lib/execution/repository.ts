import { sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  classifyWagon,
  type Classification,
  type DirectionCtx,
  type ExecutionBucket,
  type LoadState,
  type MovementSnapshot,
} from "./classify";

// Read side for the «Исполнение» sub-tab. Plain SQL via db.execute (mirrors the
// finances repository). It resolves the wagon set bound to a direction, joins the
// latest movement snapshot per wagon, then hands each row to the deterministic
// classifier in TS (NOT in SQL). All numbers come back as JS numbers for the UI.
//
// Wagon binding = A ∪ B (PRODUCT plan «Под-вкладка Исполнение»):
//   A — wagons on this direction's active-cycle deals (deals.direction_id, status OPEN|ACTIVE)
//   B — wagons addressed to the direction via active owner bindings (expected_wagon_ids[])
// Route fallback (C) is a later phase.

const SECONDS_PER_DAY = 86_400;

interface ExecQueryRow {
  wagon_number: string;
  operation_code: string | null;
  operation_name: string | null;
  load_state: string | null;
  depart_ts: string | null;
  arrive_ts: string | null;
  station_current_esr: string | null;
  station_dest_esr: string | null;
  dist_remaining_km: number | string | null;
  operation_ts: string | null;
  days_in_operation: number | string | null;
  [k: string]: unknown;
}

// One wagon row surfaced in a bucket's drill-down table.
export interface ExecutionWagonRow {
  wagonNumber: string;
  bucket: ExecutionBucket;
  distBucket: Classification["distBucket"];
  loadState: LoadState;
  operationCode: string | null;
  operationName: string | null;
  daysInOperation: number | null;
  distRemainingKm: number | null;
  stationCurrentEsr: string | null;
  operationTs: string | null;
  needsReview: boolean;
}

export interface ExecutionBucketStat {
  bucket: ExecutionBucket;
  count: number;
  avgDays: number | null;
  maxDays: number | null;
  // Distance breakdown (only populated for approaching / in_transit).
  distCounts: Record<Classification["distBucket"], number>;
}

export interface DirectionExecution {
  directionId: string;
  wagonsTotal: number;
  wagonCountPlanned: number | null;
  lastSnapshotTs: string | null;
  buckets: ExecutionBucketStat[];
  wagons: ExecutionWagonRow[];
}

const EMPTY_DIST_COUNTS = (): Record<Classification["distBucket"], number> => ({
  le100: 0,
  le300: 0,
  le500: 0,
  gt500: 0,
  unknown: 0,
});

function toNum(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Execution snapshot for one direction: the bound wagon set classified into the
 * funnel buckets, with per-bucket count / avg-days / max-days aggregates and a
 * flat per-wagon list for the drill-down tables. Classification runs in TS.
 */
export async function getDirectionExecution(directionId: string): Promise<DirectionExecution> {
  const { rows } = await db.execute<ExecQueryRow>(sql`
    WITH bound AS (
      -- A: wagons on this direction's active-cycle deals
      SELECT DISTINCT wagon_number
      FROM deals
      WHERE direction_id = ${directionId}
        AND status IN ('OPEN', 'ACTIVE')
      UNION
      -- B: wagons addressed via active owner bindings
      SELECT DISTINCT unnest(b.expected_wagon_ids) AS wagon_number
      FROM direction_owner_bindings b
      WHERE b.direction_id = ${directionId}
        AND b.status = 'active'
        AND b.expected_wagon_ids IS NOT NULL
    ),
    latest AS (
      -- newest primary movement per wagon (idx_wm_wagon_ts)
      SELECT DISTINCT ON (m.wagon_number)
        m.wagon_number,
        m.operation_code,
        m.operation_name,
        m.load_state,
        m.depart_ts,
        m.arrive_ts,
        m.station_current_esr,
        m.station_dest_esr,
        m.dist_remaining_km,
        m.operation_ts,
        m.idle_days_operation,
        m.days_no_operation
      FROM wagon_movements m
      JOIN bound bd ON bd.wagon_number = m.wagon_number
      WHERE m.is_primary = TRUE
      ORDER BY m.wagon_number, m.operation_ts DESC NULLS LAST
    )
    SELECT
      bd.wagon_number,
      l.operation_code,
      l.operation_name,
      l.load_state,
      l.depart_ts,
      l.arrive_ts,
      l.station_current_esr,
      l.station_dest_esr,
      l.dist_remaining_km,
      l.operation_ts,
      COALESCE(
        l.idle_days_operation,
        l.days_no_operation,
        FLOOR(EXTRACT(EPOCH FROM (now() - l.operation_ts)) / ${SECONDS_PER_DAY})
      ) AS days_in_operation
    FROM bound bd
    LEFT JOIN latest l ON l.wagon_number = bd.wagon_number
    ORDER BY bd.wagon_number
  `);

  const [dir] = await db.execute<{ wagon_count_planned: number | string | null; origin: string | null; dest: string | null }>(
    sql`
      SELECT wagon_count_planned, station_origin_esr AS origin, station_dest_esr AS dest
      FROM directions
      WHERE id = ${directionId}
      LIMIT 1
    `,
  ).then((r) => r.rows);

  const ctx: DirectionCtx = {
    stationOriginEsr: dir?.origin ?? null,
    stationDestEsr: dir?.dest ?? null,
  };

  const wagons: ExecutionWagonRow[] = [];
  let lastSnapshotTs: string | null = null;

  for (const r of rows) {
    // A wagon present in `bound` but with no latest row → no movement snapshot → addressed.
    const hasSnapshot = r.operation_ts !== null || r.load_state !== null || r.operation_code !== null;
    const snapshot: MovementSnapshot | null = hasSnapshot
      ? {
          wagonNumber: r.wagon_number,
          operationCode: r.operation_code,
          operationName: r.operation_name,
          loadState: (r.load_state as LoadState) ?? null,
          departTs: r.depart_ts,
          arriveTs: r.arrive_ts,
          stationCurrentEsr: r.station_current_esr,
          stationDestEsr: r.station_dest_esr,
          distRemainingKm: toNum(r.dist_remaining_km),
          daysInOperation: toNum(r.days_in_operation),
        }
      : null;

    const c = classifyWagon(snapshot, ctx, r.wagon_number);
    if (r.operation_ts && (lastSnapshotTs === null || r.operation_ts > lastSnapshotTs)) {
      lastSnapshotTs = r.operation_ts;
    }

    wagons.push({
      wagonNumber: c.wagonNumber,
      bucket: c.bucket,
      distBucket: c.distBucket,
      loadState: c.loadState,
      operationCode: r.operation_code,
      operationName: r.operation_name,
      daysInOperation: c.daysInOperation,
      distRemainingKm: toNum(r.dist_remaining_km),
      stationCurrentEsr: r.station_current_esr,
      operationTs: r.operation_ts,
      needsReview: c.needsReview,
    });
  }

  return {
    directionId,
    wagonsTotal: wagons.length,
    wagonCountPlanned: toNum(dir?.wagon_count_planned),
    lastSnapshotTs,
    buckets: aggregateBuckets(wagons),
    wagons,
  };
}

const BUCKET_ORDER: ExecutionBucket[] = [
  "addressed",
  "approaching",
  "at_station",
  "loading",
  "loaded_waiting",
  "in_transit",
  "unloaded",
];

// Group classified wagons into per-bucket stats, preserving funnel order. Buckets
// with zero wagons are still emitted so the funnel reads left→right consistently.
function aggregateBuckets(wagons: readonly ExecutionWagonRow[]): ExecutionBucketStat[] {
  return BUCKET_ORDER.map((bucket) => {
    const members = wagons.filter((w) => w.bucket === bucket);
    const days = members.map((w) => w.daysInOperation).filter((d): d is number => d != null);
    const distCounts = EMPTY_DIST_COUNTS();
    for (const w of members) distCounts[w.distBucket] += 1;
    return {
      bucket,
      count: members.length,
      avgDays: days.length ? days.reduce((a, b) => a + b, 0) / days.length : null,
      maxDays: days.length ? Math.max(...days) : null,
      distCounts,
    };
  });
}
