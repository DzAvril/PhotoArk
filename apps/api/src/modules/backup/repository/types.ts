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

export interface JobRunErrorItem {
  path: string;
  error: string;
}

export interface JobRun {
  id: string;
  jobId: string;
  status: "success" | "failed";
  startedAt: string;
  finishedAt: string;
  scannedCount: number;
  skippedCount: number;
  copiedCount: number;
  failedCount: number;
  photoCount: number;
  videoCount: number;
  livePhotoPairCount: number;
  copiedSamples: string[];
  errors: JobRunErrorItem[];
  message?: string;
}

export interface BackupState {
  storages: StorageTarget[];
  jobs: BackupJob[];
  assets: BackupAsset[];
  jobRuns: JobRun[];
}
