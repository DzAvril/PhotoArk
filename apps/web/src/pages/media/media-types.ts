import type { MediaFileItem } from "../../types/api";

export type LivePhotoPair = {
  image: MediaFileItem;
  video: MediaFileItem;
};

export type DisplayMediaItem = {
  key: string;
  file: MediaFileItem;
  livePair: LivePhotoPair | null;
};

export type ViewerRuntimeMeta = {
  width?: number;
  height?: number;
  durationSeconds?: number;
};

export type MediaKindFilter = "all" | "image" | "video" | "live";

export type MediaSummary = {
  total: number;
  imageCount: number;
  videoCount: number;
  liveCount: number;
};
