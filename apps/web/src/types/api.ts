export interface Metrics {
  storageTargets: number;
  backupJobs: number;
  encryptedAssets: number;
  livePhotoPairs: number;
}

export interface TelegramSettings {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export interface AppSettings {
  telegram: TelegramSettings;
}

export interface VersionInfo {
  currentVersion: string;
  latestVersion: string | null;
  upToDate: boolean | null;
  hasUpdate: boolean | null;
  source: "github_release" | "github_tag" | "unavailable";
  checkedAt: string;
  repo: string;
  latestUrl: string | null;
  error?: string;
}

export interface StorageTarget {
  id: string;
  name: string;
  type: "local_fs" | "external_ssd" | "cloud_115";
  basePath: string;
  encrypted: boolean;
}

export interface BackupJob {
  id: string;
  name: string;
  sourceTargetId: string;
  sourcePath: string;
  destinationTargetId: string;
  destinationPath: string;
  schedule?: string;
  watchMode: boolean;
  enabled: boolean;
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

export interface LivePhotoPair {
  assetId: string;
  imagePath: string;
  videoPath: string;
}

export interface PreviewTokenResult {
  token: string;
  expiresAt: string;
  assetId: string;
  encrypted: boolean;
}

export interface PreviewResult {
  assetId: string;
  mode: "decrypted_memory_stream" | "direct_stream";
  streamUrl: string;
  message: string;
}

export interface LivePhotoDetail {
  pair: {
    livePhotoAssetId: string;
    image: BackupAsset | null;
    video: BackupAsset | null;
  } | null;
}

export interface DirectoryOption {
  name: string;
  path: string;
}

export interface DirectoryBrowseResult {
  rootPath: string;
  currentPath: string;
  parentPath: string | null;
  directories: DirectoryOption[];
}

export interface MediaFileItem {
  name: string;
  path: string;
  kind: "image" | "video";
}

export interface MediaBrowseResult {
  storageId: string;
  path: string;
  files: MediaFileItem[];
}
