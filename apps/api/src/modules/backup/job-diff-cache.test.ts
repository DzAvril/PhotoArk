import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TimedValueCache } from "./job-diff-cache.js";

describe("TimedValueCache", () => {
  it("returns cached values within ttl and expires stale values", () => {
    const cache = new TimedValueCache<string>({ ttlMs: 1000, maxEntries: 4 });

    cache.set("job-a", "cached", 1000);

    assert.equal(cache.get("job-a", 1500), "cached");
    assert.equal(cache.get("job-a", 2101), undefined);
  });

  it("bounds entries by pruning oldest keys", () => {
    const cache = new TimedValueCache<number>({ ttlMs: 1000, maxEntries: 2 });

    cache.set("a", 1, 1000);
    cache.set("b", 2, 1001);
    cache.set("c", 3, 1002);

    assert.equal(cache.get("a", 1003), undefined);
    assert.equal(cache.get("b", 1003), 2);
    assert.equal(cache.get("c", 1003), 3);
  });
});
