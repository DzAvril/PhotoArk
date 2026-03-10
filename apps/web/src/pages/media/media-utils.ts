import type { MediaBrowseResult, MediaFileItem, StorageTarget } from "../../types/api";
import type { DisplayMediaItem, LivePhotoPair, MediaKindFilter, MediaSummary } from "./media-types";

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".m4v", ".avi", ".mkv", ".webm"]);

function splitFileName(name: string) {
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return { base: name.toLowerCase(), ext: "" };
  return { base: name.slice(0, dotIdx).toLowerCase(), ext: name.slice(dotIdx).toLowerCase() };
}

export function formatBytes(bytes: number | null) {
  if (bytes === null || !Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

export function formatDuration(seconds: number | undefined) {
  if (!Number.isFinite(seconds) || seconds === undefined) return "-";
  const whole = Math.max(0, Math.round(seconds));
  const hh = Math.floor(whole / 3600);
  const mm = Math.floor((whole % 3600) / 60);
  const ss = whole % 60;
  return hh > 0
    ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export function getStorageTypeLabel(type: StorageTarget["type"]) {
  if (type === "local_fs") return "NAS";
  if (type === "external_ssd") return "SSD";
  return "115 云盘";
}

export function detectLivePhotoPairs(media: MediaBrowseResult | null) {
  const files = media?.files ?? [];
  const groups = new Map<string, { image: MediaFileItem | null; video: MediaFileItem | null }>();
  for (const file of files) {
    const { base, ext } = splitFileName(file.name);
    const row = groups.get(base) ?? { image: null, video: null };
    if (IMAGE_EXTENSIONS.has(ext)) row.image = file;
    if (VIDEO_EXTENSIONS.has(ext)) row.video = file;
    groups.set(base, row);
  }

  const out = new Map<string, LivePhotoPair>();
  for (const row of groups.values()) {
    if (row.image && row.video) {
      const pair = { image: row.image, video: row.video };
      out.set(row.image.path, pair);
      out.set(row.video.path, pair);
    }
  }
  return out;
}

export function buildDisplayItems(
  files: MediaFileItem[],
  livePhotoPairByPath: Map<string, LivePhotoPair>,
  kindFilter: MediaKindFilter
): DisplayMediaItem[] {
  const items: DisplayMediaItem[] = [];

  for (const file of files) {
    const pair = livePhotoPairByPath.get(file.path) ?? null;
    if (pair) {
      if (file.path !== pair.image.path) continue;
      if (kindFilter === "video") continue;
      if (kindFilter !== "all" && kindFilter !== "image" && kindFilter !== "live") continue;
      items.push({ key: pair.image.path, file: pair.image, livePair: pair });
      continue;
    }

    if (kindFilter === "live") continue;
    if (kindFilter !== "all" && file.kind !== kindFilter) continue;
    items.push({ key: file.path, file, livePair: null });
  }

  return items;
}

export function buildMediaSummary(files: MediaFileItem[], livePhotoPairByPath: Map<string, LivePhotoPair>): MediaSummary {
  let imageCount = 0;
  let videoCount = 0;
  for (const file of files) {
    if (file.kind === "image") imageCount += 1;
    if (file.kind === "video") videoCount += 1;
  }
  const liveCount = new Set([...livePhotoPairByPath.values()].map((pair) => pair.image.path)).size;
  return {
    total: files.length,
    imageCount,
    videoCount,
    liveCount
  };
}
