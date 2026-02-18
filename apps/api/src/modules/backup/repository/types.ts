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

export interface BackupState {
  storages: StorageTarget[];
  jobs: BackupJob[];
  assets: BackupAsset[];
}
