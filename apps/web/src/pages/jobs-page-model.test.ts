import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildJobPayload, createInitialJobForm } from "./jobs-page-model.js";
import type { StorageTarget } from "../types/api";

const sourceStorage: StorageTarget = {
  id: "src",
  name: "Source",
  type: "local_fs",
  basePath: "/photos",
  encrypted: false
};

const destinationStorage: StorageTarget = {
  id: "dst",
  name: "Destination",
  type: "external_ssd",
  basePath: "/backup",
  encrypted: false
};

describe("jobs-page-model", () => {
  it("builds payload with selected subdirectories instead of storage roots", () => {
    const form = {
      ...createInitialJobForm("src", "dst"),
      name: "Trip backup",
      sourcePath: "/photos/2026/trip",
      destinationPath: "/backup/trip",
      schedule: "0 3 * * *"
    };

    const payload = buildJobPayload(form, sourceStorage, destinationStorage);

    assert.equal(payload.sourcePath, "/photos/2026/trip");
    assert.equal(payload.destinationPath, "/backup/trip");
  });

  it("falls back to storage roots when path fields are empty", () => {
    const form = {
      ...createInitialJobForm("src", "dst"),
      name: "Root backup"
    };

    const payload = buildJobPayload(form, sourceStorage, destinationStorage);

    assert.equal(payload.sourcePath, "/photos");
    assert.equal(payload.destinationPath, "/backup");
  });
});
