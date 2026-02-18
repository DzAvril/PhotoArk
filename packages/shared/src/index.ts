export type StorageType = "local_fs" | "external_ssd" | "cloud_115";

export interface StorageTarget {
  id: string;
  name: string;
  type: StorageType;
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

export interface LivePhotoPair {
  assetId: string;
  imagePath: string;
  videoPath: string;
}
