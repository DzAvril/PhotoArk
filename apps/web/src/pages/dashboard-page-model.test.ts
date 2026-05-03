import assert from "node:assert/strict";
import test from "node:test";
import { buildCapacityRiskLabel, buildOverviewMetricTiles, sortStorageMediaSummary } from "./dashboard-page-model";

test("capacity risk label escalates low remaining capacity", () => {
  assert.equal(buildCapacityRiskLabel(8), "容量紧张");
  assert.equal(buildCapacityRiskLabel(18), "容量偏低");
  assert.equal(buildCapacityRiskLabel(55), "容量充足");
  assert.equal(buildCapacityRiskLabel(null), "容量未知");
});

test("overview metric tiles keep analytics first", () => {
  const tiles = buildOverviewMetricTiles({
    storageCount: 3,
    jobCount: 5,
    activeExecutionCount: 1,
    failedRunCount: 2,
    mediaCount: 1200,
    capacityRiskCount: 1
  });
  assert.deepEqual(tiles.map((tile) => tile.key), ["media", "storage", "jobs", "active", "failures", "risk"]);
  assert.equal(tiles[0].label, "媒体文件");
});

test("media summaries sort by total bytes descending", () => {
  const sorted = sortStorageMediaSummary([
    { storageId: "a", storageName: "A", basePath: "/a", counts: { image: 1, video: 0, livePhoto: 0 }, bytes: { image: 10, video: 0, livePhoto: 0 }, totalCount: 1, totalBytes: 10 },
    { storageId: "b", storageName: "B", basePath: "/b", counts: { image: 2, video: 0, livePhoto: 0 }, bytes: { image: 30, video: 0, livePhoto: 0 }, totalCount: 2, totalBytes: 30 }
  ]);
  assert.deepEqual(sorted.map((item) => item.storageId), ["b", "a"]);
});
