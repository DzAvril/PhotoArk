import assert from "node:assert/strict";
import test from "node:test";
import { getMediaGridColumns, getMediaLibraryStatusText, normalizeThumbSize } from "./media-page-model";

test("thumbnail size is clamped for stable grid layout", () => {
  assert.equal(normalizeThumbSize(80), 110);
  assert.equal(normalizeThumbSize(170), 170);
  assert.equal(normalizeThumbSize(400), 260);
});

test("grid columns adapt for mobile and desktop", () => {
  assert.equal(getMediaGridColumns(360, 140), 2);
  assert.equal(getMediaGridColumns(820, 170), 4);
  assert.equal(getMediaGridColumns(1440, 190), 7);
});

test("status text includes loaded and filtered counts", () => {
  assert.equal(getMediaLibraryStatusText({ loaded: 300, total: 1200, filtered: 82 }), "已加载 300/1,200 · 筛选后 82");
});
