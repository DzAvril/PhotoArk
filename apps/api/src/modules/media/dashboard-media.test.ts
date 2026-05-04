import assert from "node:assert/strict";
import test from "node:test";
import type { BackupJob, StorageTarget } from "@photoark/shared";
import { selectDashboardSourceActivityRoots, selectDashboardStorageMediaRoots } from "./dashboard-media.js";

const sourceStorage: StorageTarget = {
  id: "st_source",
  name: "主相册",
  type: "local_fs",
  basePath: "/mnt/photoark",
  encrypted: false
};

const externalStorage: StorageTarget = {
  id: "st_external",
  name: "移动硬盘",
  type: "external_ssd",
  basePath: "/mnt/external",
  encrypted: false
};

const cloudStorage: StorageTarget = {
  id: "st_cloud",
  name: "115",
  type: "cloud_115",
  basePath: "115://photoark",
  encrypted: false
};

const syncJob: BackupJob = {
  id: "job_sync",
  name: "同步主相册",
  sourceTargetId: sourceStorage.id,
  sourcePath: "/mnt/photoark/Masters",
  destinationTargetId: externalStorage.id,
  destinationPath: "/mnt/external/Masters",
  watchMode: true,
  enabled: true
};

test("dashboard source activity prefers sync source paths", () => {
  assert.deepEqual(selectDashboardSourceActivityRoots([sourceStorage, externalStorage, cloudStorage], [syncJob]), [
    { storageId: sourceStorage.id, path: "/mnt/photoark/Masters" }
  ]);
});

test("dashboard source activity falls back to local storage roots when no jobs exist", () => {
  assert.deepEqual(selectDashboardSourceActivityRoots([sourceStorage, externalStorage, cloudStorage], []), [
    { storageId: sourceStorage.id, path: "/mnt/photoark" },
    { storageId: externalStorage.id, path: "/mnt/external" }
  ]);
});

test("storage media summary prefers job paths for the same storage", () => {
  assert.deepEqual(selectDashboardStorageMediaRoots(sourceStorage, [syncJob]), ["/mnt/photoark/Masters"]);
  assert.deepEqual(selectDashboardStorageMediaRoots(externalStorage, [syncJob]), ["/mnt/external/Masters"]);
});
