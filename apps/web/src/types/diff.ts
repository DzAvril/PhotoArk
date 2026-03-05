// Storage Diff Types

export type DiffItemStatus = "left_only" | "right_only" | "both_same" | "both_different";

export type DiffItemKind = "image" | "video" | "other";

export interface DiffFileInfo {
  path: string;
  name: string;
  sizeBytes: number | null;
  modifiedAt: string | null;
  kind: DiffItemKind;
}

export interface DiffItem {
  relativePath: string;
  status: DiffItemStatus;
  kind: DiffItemKind;
  left: DiffFileInfo | null;
  right: DiffFileInfo | null;
  differenceReasons: string[];
}

export interface DiffSummary {
  totalCount: number;
  leftOnlyCount: number;
  rightOnlyCount: number;
  bothSameCount: number;
  bothDifferentCount: number;
  imageCount: number;
  videoCount: number;
  otherCount: number;
}

export interface DiffResult {
  leftStorageId: string;
  rightStorageId: string;
  leftStorageName: string;
  rightStorageName: string;
  leftPath: string;
  rightPath: string;
  summary: DiffSummary;
  items: DiffItem[];
}

export type DiffFilterStatus = "all" | "left_only" | "right_only" | "different" | "same";

export type DiffFilterKind = "all" | "image" | "video" | "other";

export interface DiffFilters {
  status: DiffFilterStatus;
  kind: DiffFilterKind;
  search: string;
}
