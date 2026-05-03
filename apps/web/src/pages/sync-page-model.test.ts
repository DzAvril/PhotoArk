import assert from "node:assert/strict";
import test from "node:test";
import { getSyncTabFromSearch, setSyncTabInSearch, syncTabValues } from "./sync-page-model";

test("sync tab defaults to diff", () => {
  assert.equal(getSyncTabFromSearch(""), "diff");
  assert.equal(getSyncTabFromSearch("?tab=jobs"), "jobs");
  assert.equal(getSyncTabFromSearch("?tab=running"), "running");
  assert.equal(getSyncTabFromSearch("?tab=bad"), "diff");
});

test("sync tab values stay in IA order", () => {
  assert.deepEqual(syncTabValues, ["diff", "jobs", "running"]);
});

test("setSyncTabInSearch writes stable query string", () => {
  assert.equal(setSyncTabInSearch("?foo=bar", "jobs"), "?foo=bar&tab=jobs");
  assert.equal(setSyncTabInSearch("?tab=diff", "running"), "?tab=running");
});
