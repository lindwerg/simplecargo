import { describe, expect, it } from "vitest";

import {
  groupByClient,
  groupByOriginStation,
  groupByRoad,
  partitionByBucket,
  sortByCreatedAt,
  UNLINKED_KEY,
  type DirectionCardView,
} from "./grouping";

function card(over: Partial<DirectionCardView>): DirectionCardView {
  return {
    lineId: over.lineId ?? "line",
    requestId: over.requestId ?? "req",
    requestNumber: over.requestNumber ?? null,
    status: over.status ?? "new",
    lossReason: over.lossReason ?? null,
    kpIssuedAt: over.kpIssuedAt ?? null,
    clientSuggestedId: over.clientSuggestedId ?? null,
    clientRaw: over.clientRaw ?? null,
    clientName: over.clientName ?? null,
    originRaw: over.originRaw ?? "Асбест",
    originRoadRaw: over.originRoadRaw ?? null,
    destRaw: over.destRaw ?? "Москва",
    destRoadRaw: over.destRoadRaw ?? null,
    cargoName: over.cargoName ?? null,
    wagonType: over.wagonType ?? "ПВ",
    wagonsRequested: over.wagonsRequested ?? 0,
    tonnagePerWagon: over.tonnagePerWagon ?? null,
    targetRatePerWagon: over.targetRatePerWagon ?? null,
    targetRateRaw: over.targetRateRaw ?? null,
    createdAt: over.createdAt ?? new Date("2026-06-01T00:00:00Z"),
    validUntil: over.validUntil ?? null,
  };
}

describe("direction-card grouping", () => {
  const data: DirectionCardView[] = [
    card({ lineId: "a1", clientSuggestedId: "c1", clientName: "Химпром", wagonsRequested: 40, originRaw: "Асбест", originRoadRaw: "СВР" }),
    card({ lineId: "a2", clientSuggestedId: "c1", clientName: "Химпром", wagonsRequested: 60, originRaw: "Тюльма", originRoadRaw: "КБШ" }),
    card({ lineId: "b1", clientRaw: "ЦемТрейд (новый)", wagonsRequested: 30, originRaw: "Асбест", originRoadRaw: "СВР" }),
    card({ lineId: "u1", wagonsRequested: 10, originRaw: "Лена", originRoadRaw: null }),
  ];

  it("groups by client (real id, temp raw, unlinked) with rollups", () => {
    const groups = groupByClient(data);
    const byClient = groups.find((g) => g.key === "c1");
    expect(byClient?.items).toHaveLength(2);
    expect(byClient?.totalWagons).toBe(100);
    expect(byClient?.isTemp).toBe(false);

    expect(groups.find((g) => g.key === "raw:ЦемТрейд (новый)")?.isTemp).toBe(true);
    expect(groups.find((g) => g.key === UNLINKED_KEY)?.items).toHaveLength(1);
  });

  it("groups by road and by origin station", () => {
    const roads = groupByRoad(data);
    expect(roads.find((g) => g.key === "СВР")?.items.map((c) => c.lineId).sort()).toEqual(["a1", "b1"]);
    const stations = groupByOriginStation(data);
    expect(stations.find((g) => g.key === "Асбест")?.items).toHaveLength(2);
  });

  it("sinks unknown buckets to the bottom", () => {
    const groups = groupByRoad(data);
    expect(groups[groups.length - 1].label).toContain("не определена");
  });

  it("sorts by createdAt desc by default", () => {
    const sorted = sortByCreatedAt([
      card({ lineId: "old", createdAt: new Date("2026-05-01T00:00:00Z") }),
      card({ lineId: "new", createdAt: new Date("2026-06-30T00:00:00Z") }),
    ]);
    expect(sorted[0].lineId).toBe("new");
  });

  it("partitions active vs archive by status", () => {
    const mixed = [
      card({ lineId: "n", status: "new" }),
      card({ lineId: "s", status: "sourcing" }),
      card({ lineId: "w", status: "won" }),
      card({ lineId: "l", status: "lost" }),
    ];
    const { active, archive } = partitionByBucket(mixed);
    expect(active.map((c) => c.lineId).sort()).toEqual(["n", "s"]);
    expect(archive.map((c) => c.lineId).sort()).toEqual(["l", "w"]);
  });
});
