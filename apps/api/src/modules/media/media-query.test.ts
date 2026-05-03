import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { paginateItems } from "./media-query.js";

describe("paginateItems", () => {
  it("returns one bounded page and keeps total metadata", () => {
    const items = Array.from({ length: 8 }, (_, index) => `item-${index + 1}`);

    const page = paginateItems(items, { page: 2, pageSize: 3, maxPageSize: 5 });

    assert.deepEqual(page.items, ["item-4", "item-5", "item-6"]);
    assert.equal(page.page, 2);
    assert.equal(page.pageSize, 3);
    assert.equal(page.total, 8);
    assert.equal(page.totalPages, 3);
  });

  it("clamps invalid page and oversized page size", () => {
    const items = Array.from({ length: 12 }, (_, index) => index + 1);

    const page = paginateItems(items, { page: 99, pageSize: 999, maxPageSize: 5 });

    assert.deepEqual(page.items, [11, 12]);
    assert.equal(page.page, 3);
    assert.equal(page.pageSize, 5);
    assert.equal(page.total, 12);
    assert.equal(page.totalPages, 3);
  });
});
