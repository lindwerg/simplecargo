// Deterministic wagon classifier for the «Исполнение» pipeline. Pure logic, no
// DB / no LLM — unit-tested in classify.test.ts. Maps a single latest movement
// snapshot onto an execution bucket (the operator-facing funnel) plus a distance
// sub-bucket for the two in-motion buckets. Grounded in the lifecycle states of
// DOMAIN_MODEL §8 (S0–S9) and the operation categories of operation-codes.ts.

import { categorizeOperation, type OpCategory } from "./operation-codes";

// Funnel buckets, left → right in the UI:
//   addressed       — bound to the direction, no movement snapshot yet (заадресовано)
//   approaching     — empty, heading to the loading station (S1, ПОР, in motion)
//   at_station      — at the loading station, not yet loading (S2) / review fallback
//   loading         — being loaded at the loading station (S3, ПОР→ГРУЖ / LOAD op)
//   loaded_waiting  — loaded, ready, not yet dispatched (S4, ГРУЖ at origin)
//   in_transit      — loaded and in motion toward destination (S5/S6, ГРУЖ)
//   unloaded        — trip finished, unloaded at destination (S7/S8, UNLOAD op / ПОР at dest)
export type ExecutionBucket =
  | "addressed"
  | "approaching"
  | "at_station"
  | "loading"
  | "loaded_waiting"
  | "in_transit"
  | "unloaded";

// Distance sub-bucket for approaching / in_transit (km remaining to current ETA point).
export type DistBucket = "le100" | "le300" | "le500" | "gt500" | "unknown";

export type LoadState = "ГРУЖ" | "ПОР" | "UNKNOWN" | null;

// The minimal snapshot shape the classifier needs. A subset of wagon_movements;
// the repository builds this per wagon from the latest is_primary row (or nulls
// when no movement exists → addressed).
export interface MovementSnapshot {
  wagonNumber: string;
  operationCode: string | null;
  operationName: string | null;
  loadState: LoadState;
  departTs: Date | string | null;
  arriveTs: Date | string | null;
  stationCurrentEsr: string | null;
  stationDestEsr: string | null;
  distRemainingKm: number | null;
  // Pre-resolved days-under-operation from the repository (COALESCE chain). The
  // classifier only passes it through; bucketing never depends on it.
  daysInOperation: number | null;
}

// Direction context: origin = loading station, dest = unload station. Lets us
// tell an arrival-at-loading (at_station) apart from an arrival-at-dest (in_transit/unloaded).
export interface DirectionCtx {
  stationOriginEsr: string | null;
  stationDestEsr: string | null;
}

export interface Classification {
  wagonNumber: string;
  bucket: ExecutionBucket;
  distBucket: DistBucket;
  opCategory: OpCategory;
  loadState: LoadState;
  daysInOperation: number | null;
  needsReview: boolean;
}

function distBucketOf(km: number | null): DistBucket {
  if (km == null || !Number.isFinite(km)) return "unknown";
  if (km <= 100) return "le100";
  if (km <= 300) return "le300";
  if (km <= 500) return "le500";
  return "gt500";
}

// Distance is only meaningful for the in-motion buckets; otherwise force "unknown"
// so the UI never shows a stale remaining-distance for a parked wagon.
const MOVING_BUCKETS: ReadonlySet<ExecutionBucket> = new Set(["approaching", "in_transit"]);

function isAtEsr(snapshot: MovementSnapshot, esr: string | null): boolean {
  return esr != null && snapshot.stationCurrentEsr != null && snapshot.stationCurrentEsr === esr;
}

/**
 * Classify one wagon snapshot into an execution bucket. Deterministic rules R1–R11:
 *
 *  R1  no snapshot (null) → addressed (bound but never reported).
 *  R2  UNKNOWN op category → at_station + needsReview (no LLM; operator triages).
 *  R3  LOAD op → loading (S3).
 *  R4  ARRIVE op, load=ПОР, at origin ESR → at_station (S2, empty arrival at loading).
 *  R5  ARRIVE op, load=ГРУЖ, at dest ESR → in_transit (S6, arrived loaded — drilling/unload pending).
 *  R6  UNLOAD op or (load=ПОР at dest) → unloaded (S7/S8).
 *  R7  EMPTY_DISP op → approaching (S9 empty heading back/onward to a loading station).
 *  R8  DEPART op, load=ГРУЖ → in_transit (S5, dispatched loaded).
 *  R9  DEPART op, load=ПОР → approaching (S1, dispatched empty to loading).
 *  R10 load=ГРУЖ at origin ESR (no decisive op) → loaded_waiting (S4 ready).
 *  R11 fallback by load: ГРУЖ → in_transit, ПОР → approaching, else at_station+needsReview.
 *
 * distBucket is computed from distRemainingKm and kept only for approaching/in_transit.
 */
export function classifyWagon(
  snapshot: MovementSnapshot | null,
  ctx: DirectionCtx,
  wagonNumber?: string,
): Classification {
  // R1 — bound but no movement yet.
  if (snapshot == null) {
    return {
      wagonNumber: wagonNumber ?? "",
      bucket: "addressed",
      distBucket: "unknown",
      opCategory: "UNKNOWN",
      loadState: null,
      daysInOperation: null,
      needsReview: false,
    };
  }

  const opCategory = categorizeOperation(snapshot.operationCode, snapshot.operationName);
  const load = snapshot.loadState;
  const atOrigin = isAtEsr(snapshot, ctx.stationOriginEsr);
  const atDest = isAtEsr(snapshot, ctx.stationDestEsr);

  let bucket: ExecutionBucket;
  let needsReview = false;

  if (opCategory === "UNKNOWN") {
    // R2 — unrecognized operation: park in at_station for human review.
    bucket = "at_station";
    needsReview = true;
  } else if (opCategory === "LOAD") {
    bucket = "loading"; // R3
  } else if (opCategory === "ARRIVE" && load === "ПОР" && atOrigin) {
    bucket = "at_station"; // R4
  } else if (opCategory === "ARRIVE" && load === "ГРУЖ" && atDest) {
    bucket = "in_transit"; // R5
  } else if (opCategory === "UNLOAD" || (load === "ПОР" && atDest)) {
    bucket = "unloaded"; // R6
  } else if (opCategory === "EMPTY_DISP") {
    bucket = "approaching"; // R7
  } else if (opCategory === "DEPART" && load === "ГРУЖ") {
    bucket = "in_transit"; // R8
  } else if (opCategory === "DEPART" && load === "ПОР") {
    bucket = "approaching"; // R9
  } else if (load === "ГРУЖ" && atOrigin) {
    bucket = "loaded_waiting"; // R10
  } else if (load === "ГРУЖ") {
    bucket = "in_transit"; // R11a
  } else if (load === "ПОР") {
    bucket = "approaching"; // R11b
  } else {
    // R11c — UNKNOWN/null load with no decisive op: cannot place, flag for review.
    bucket = "at_station";
    needsReview = true;
  }

  const distBucket = MOVING_BUCKETS.has(bucket) ? distBucketOf(snapshot.distRemainingKm) : "unknown";

  return {
    wagonNumber: snapshot.wagonNumber || wagonNumber || "",
    bucket,
    distBucket,
    opCategory,
    loadState: load,
    daysInOperation: snapshot.daysInOperation,
    needsReview,
  };
}
