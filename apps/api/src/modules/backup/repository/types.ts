import type { BackupJob, StorageTarget } from "@photoark/shared";

export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export interface AppSettings {
  telegram: TelegramSettings;
}

export interface AuthUser {
  id: string;
  username: string;
  role: "admin";
  passwordSalt: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AuthSession {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
}

export interface BackupAsset {
  id: string;
  name: string;
  kind: "photo" | "video" | "live_photo_image" | "live_photo_video";
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

export type JobRunTrigger = "manual" | "watch" | "schedule" | "unknown";

export interface JobRun {
  id: string;
  jobId: string;
  trigger: JobRunTrigger;
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
  settings: AppSettings;
  users: AuthUser[];
  sessions: AuthSession[];
}
