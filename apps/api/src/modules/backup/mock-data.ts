import type { BackupJob, StorageTarget } from "@photoark/shared";

export interface BackupAsset {
  id: string;
  name: string;
  kind: "photo" | "live_photo_image" | "live_photo_video";
  storageTargetId: string;
  encrypted: boolean;
  sizeBytes: number;
  capturedAt: string;
  livePhotoAssetId?: string;
}

export const storageTargets: StorageTarget[] = [
  {
    id: "st_nas_01",
    name: "NAS HDD Pool",
    type: "local_fs",
    basePath: "/volume1/photoark",
    encrypted: false
  },
  {
    id: "st_ssd_01",
    name: "USB-C SSD",
    type: "external_ssd",
    basePath: "/volumeUSB1/usbshare/photoark",
    encrypted: false
  },
  {
    id: "st_115_01",
    name: "115 Cloud Vault",
    type: "cloud_115",
    basePath: "115://photoark",
    encrypted: true
  }
];

export const backupJobs: BackupJob[] = [
  {
    id: "job_daily_sync",
    name: "Daily Full Sync",
    sourceTargetId: "st_nas_01",
    destinationTargetId: "st_115_01",
    schedule: "0 2 * * *",
    watchMode: false,
    enabled: true
  },
  {
    id: "job_watch_camera",
    name: "Camera Roll Watch",
    sourceTargetId: "st_nas_01",
    destinationTargetId: "st_ssd_01",
    watchMode: true,
    enabled: true
  }
];

export const backupAssets: BackupAsset[] = [
  {
    id: "asset_2031_heic",
    name: "IMG_2031.HEIC",
    kind: "live_photo_image",
    storageTargetId: "st_115_01",
    encrypted: true,
    sizeBytes: 3092211,
    capturedAt: "2026-02-17T18:20:14.000Z",
    livePhotoAssetId: "IMG_2031"
  },
  {
    id: "asset_2031_mov",
    name: "IMG_2031.MOV",
    kind: "live_photo_video",
    storageTargetId: "st_115_01",
    encrypted: true,
    sizeBytes: 5231177,
    capturedAt: "2026-02-17T18:20:14.000Z",
    livePhotoAssetId: "IMG_2031"
  },
  {
    id: "asset_2032_jpg",
    name: "IMG_2032.JPG",
    kind: "photo",
    storageTargetId: "st_115_01",
    encrypted: true,
    sizeBytes: 1722391,
    capturedAt: "2026-02-17T19:01:03.000Z"
  }
];
