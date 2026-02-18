export interface Metrics {
  storageTargets: number;
  backupJobs: number;
  encryptedAssets: number;
  livePhotoPairs: number;
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
  destinationTargetId: string;
  schedule?: string;
  watchMode: boolean;
  enabled: boolean;
}

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
