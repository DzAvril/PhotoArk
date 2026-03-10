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
  proxyUrl: string;
}

export interface AppSettings {
  telegram: TelegramSettings;
}

export interface AuthUser {
  id: string;
  username: string;
  role: "admin";
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AuthStatus {
  enabled: true;
  hasUsers: boolean;
}

export interface AuthResult {
  user: AuthUser;
  token: string;
  expiresAt: string;
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

export interface StorageCapacityItem {
  id: string;
  storageIds: string[];
  storageNames: string[];
  available: boolean;
  reason: string | null;
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usedPercent: number | null;
}

export interface StorageMediaSummaryItem {
  storageId: string;
  storageName: string;
  basePath: string;
  counts: {
    image: number;
    video: number;
    livePhoto: number;
  };
  bytes: {
    image: number;
    video: number;
    livePhoto: number;
  };
  totalCount: number;
  totalBytes: number;
}

export interface SourceActivityDayItem {
  date: string;
  count: number;
  imageCount: number;
  videoCount: number;
  livePhotoCount: number;
}

export interface SourceMediaActivity {
  year: number;
  years: number[];
  days: SourceActivityDayItem[];
  sourceRootCount: number;
  totalAddedCount: number;
  imageAddedCount: number;
  videoAddedCount: number;
  livePhotoAddedCount: number;
  maxDailyCount: number;
  startDate: string;
  endDate: string;
}

export interface StorageRelationNodeItem {
  storageId: string;
  storageName: string;
  basePath: string;
  type: StorageTarget["type"];
}

export interface StorageRelationEdgeItem {
  id: string;
  sourceStorageId: string;
  sourceStorageName: string;
  destinationStorageId: string;
  destinationStorageName: string;
  status: "synced" | "attention";
  jobCount: number;
  syncedJobCount: number;
  laggingJobCount: number;
  unknownJobCount: number;
  jobIds: string[];
  pendingJobIds: string[];
  enabledJobIds: string[];
  summary: string;
}

export interface MediaIndexStatusItem {
  rootPath: string;
  fileCount: number;
  generatedAt: string;
  ageMs: number;
  fresh: boolean;
}

export interface MediaIndexRebuildItem {
  storageId: string;
  storageName: string;
  rootPath: string;
  fileCount: number;
  ok: boolean;
  error: string | null;
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

export type JobDiffStatus = "source_only" | "destination_only" | "changed" | "same";
export type JobDiffKind = "image" | "video";

export interface JobDiffFile {
  absolutePath: string;
  sizeBytes: number;
  modifiedAt: string | null;
}

export interface JobDiffItem {
  id: string;
  relativePath: string;
  kind: JobDiffKind;
  status: JobDiffStatus;
  source: JobDiffFile | null;
  destination: JobDiffFile | null;
  sizeDeltaBytes: number | null;
  mtimeDeltaMs: number | null;
  changeReason: "size" | "mtime" | "size_mtime" | null;
}

export interface JobDiffSummary {
  totalComparedCount: number;
  totalDiffCount: number;
  sameCount: number;
  sourceOnlyCount: number;
  destinationOnlyCount: number;
  changedCount: number;
  imageCount: number;
  videoCount: number;
  sourceOnlyBytes: number;
  destinationOnlyBytes: number;
  changedSourceBytes: number;
  changedDestinationBytes: number;
}

export interface JobDiffResult {
  generatedAt: string;
  job: {
    id: string;
    name: string;
    sourceStorageId: string;
    sourceStorageName: string;
    sourcePath: string;
    destinationStorageId: string;
    destinationStorageName: string;
    destinationPath: string;
  };
  scan: {
    sourceFileCount: number;
    destinationFileCount: number;
  };
  summary: JobDiffSummary;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: JobDiffItem[];
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
  status: "success" | "failed" | "canceled";
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

export type JobExecutionStatus = "queued" | "running" | "success" | "failed" | "canceled";
export type JobExecutionPhase = "queued" | "scanning" | "syncing" | "finished";

export interface JobExecutionProgress {
  phase: JobExecutionPhase;
  totalCount: number | null;
  scannedCount: number;
  processedCount: number;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
  photoCount: number;
  videoCount: number;
  livePhotoPairCount: number;
  percent: number;
  currentPath: string | null;
}

export interface JobExecution {
  id: string;
  jobId: string;
  trigger: JobRunTrigger;
  status: JobExecutionStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  runId: string | null;
  message: string | null;
  error: string | null;
  progress: JobExecutionProgress;
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
  sizeBytes: number | null;
  modifiedAt: string | null;
  capturedAt: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface MediaBrowseResult {
  storageId: string;
  path: string;
  files: MediaFileItem[];
}
