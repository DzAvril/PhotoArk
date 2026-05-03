import assert from "node:assert/strict";
import test from "node:test";
import { getPageMeta, primaryNavItems } from "../navigation/navigation-model";

test("shell has five mobile nav targets", () => {
  assert.equal(primaryNavItems.length, 5);
  assert.deepEqual(primaryNavItems.map((item) => item.to), ["/", "/media", "/sync", "/records", "/settings"]);
});

test("shell metadata avoids old dashboard wording", () => {
  const meta = getPageMeta("/");
  assert.equal(meta.title, "概览");
  assert.match(meta.subtitle, /容量/);
});
