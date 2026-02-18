export interface FileEntry {
  path: string;
  size: number;
  modifiedAt: Date;
}

export interface BackupItem {
  sourcePath: string;
  destinationPath: string;
  encrypted: boolean;
  metadata: Record<string, string>;
}
