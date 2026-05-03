import assert from "node:assert/strict";
import test from "node:test";
import { buildRunSummaryTiles, getRunTone } from "./records-page-model";

test("run tone maps statuses to semantic tones", () => {
  assert.equal(getRunTone("success"), "success");
  assert.equal(getRunTone("running"), "info");
  assert.equal(getRunTone("queued"), "info");
  assert.equal(getRunTone("failed"), "danger");
});

test("summary tiles include audit-oriented metrics", () => {
  const tiles = buildRunSummaryTiles([
    { status: "success", copiedCount: 12, skippedCount: 3, errorCount: 0, durationMs: 2000 },
    { status: "failed", copiedCount: 2, skippedCount: 0, errorCount: 1, durationMs: 3000 }
  ]);
  assert.deepEqual(tiles.map((tile) => tile.key), ["total", "success", "failed", "files", "errors", "averageDuration"]);
  assert.equal(tiles.find((tile) => tile.key === "failed")?.value, "1");
});
