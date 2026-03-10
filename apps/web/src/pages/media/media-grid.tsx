import { getStorageMediaStreamUrl } from "../../lib/api";
import type { StorageTarget } from "../../types/api";
import type { DisplayMediaItem } from "./media-types";
import { formatBytes, formatDateTime } from "./media-utils";

type MediaGridProps = {
  selectedStorage: StorageTarget | undefined;
  displayItems: DisplayMediaItem[];
  activePath: string | null;
  loadingMedia: boolean;
  normalizedThumbSize: number;
  brokenThumbImagePaths: Set<string>;
  brokenThumbVideoPaths: Set<string>;
  onOpen: (path: string) => void;
  onThumbImageError: (path: string) => void;
  onThumbVideoError: (path: string) => void;
};

export function MediaGrid(props: MediaGridProps) {
  const {
    selectedStorage,
    displayItems,
    activePath,
    loadingMedia,
    normalizedThumbSize,
    brokenThumbImagePaths,
    brokenThumbVideoPaths,
    onOpen,
    onThumbImageError,
    onThumbVideoError
  } = props;

  const mediaGridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${normalizedThumbSize}px, 1fr))`
  };

  return (
    <div className="mt-2 min-h-0 flex-1 overflow-auto">
      {loadingMedia ? (
        <div className="flex h-full min-h-40 items-center justify-center">
          <span className="mp-chip">正在加载媒体目录...</span>
        </div>
      ) : null}

      {!loadingMedia ? (
        <>
          <div className="grid gap-2.5" style={mediaGridStyle}>
            {selectedStorage &&
              displayItems.map((item) => (
                <MediaGridItem
                  key={item.key}
                  item={item}
                  isActiveItem={activePath === item.file.path}
                  storageId={selectedStorage.id}
                  brokenThumbImagePaths={brokenThumbImagePaths}
                  brokenThumbVideoPaths={brokenThumbVideoPaths}
                  onOpen={onOpen}
                  onThumbImageError={onThumbImageError}
                  onThumbVideoError={onThumbVideoError}
                />
              ))}
          </div>

          {!displayItems.length ? (
            <p className="py-5 text-center text-sm mp-muted">
              {selectedStorage ? "该位置暂无可浏览媒体，可尝试切换筛选类型。" : "请先选择存储后再浏览媒体。"}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

type MediaGridItemProps = {
  item: DisplayMediaItem;
  isActiveItem: boolean;
  storageId: string;
  brokenThumbImagePaths: Set<string>;
  brokenThumbVideoPaths: Set<string>;
  onOpen: (path: string) => void;
  onThumbImageError: (path: string) => void;
  onThumbVideoError: (path: string) => void;
};

function MediaGridItem(props: MediaGridItemProps) {
  const {
    item,
    isActiveItem,
    storageId,
    brokenThumbImagePaths,
    brokenThumbVideoPaths,
    onOpen,
    onThumbImageError,
    onThumbVideoError
  } = props;
  const streamUrl = getStorageMediaStreamUrl(storageId, item.file.path);
  const isLivePhoto = Boolean(item.livePair);
  const thumbBroken = brokenThumbImagePaths.has(item.file.path);
  const videoThumbBroken = brokenThumbVideoPaths.has(item.file.path);

  return (
    <button
      type="button"
      className={`group overflow-hidden rounded-xl border bg-[var(--ark-surface)] text-left transition-all hover:border-[var(--ark-line-strong)] hover:shadow-md ${
        isActiveItem
          ? "border-[var(--ark-primary)] ring-2 ring-[color-mix(in_oklab,var(--ark-primary)_35%,transparent)]"
          : "border-[var(--ark-line)]"
      }`}
      onClick={() => onOpen(item.file.path)}
    >
      <div className="relative aspect-square overflow-hidden bg-black/15">
        {item.file.kind === "image" ? (
          thumbBroken ? (
            <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-white/80">
              图片预览不可用
            </div>
          ) : (
            <img
              src={streamUrl}
              alt={item.file.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              loading="lazy"
              onError={() => onThumbImageError(item.file.path)}
            />
          )
        ) : videoThumbBroken ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-sm text-white/80">
            <span>▶</span>
            <span>该视频格式无法生成缩略图</span>
          </div>
        ) : (
          <video
            src={`${streamUrl}#t=0.1`}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={(event) => {
              const video = event.currentTarget;
              if (!Number.isFinite(video.duration) || video.duration <= 0.11) return;
              if (video.currentTime >= 0.09) return;
              try {
                video.currentTime = 0.1;
              } catch {
                return;
              }
            }}
            onError={() => onThumbVideoError(item.file.path)}
          />
        )}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />
        <div className="absolute left-2 top-2 flex items-center gap-1.5">
          {isLivePhoto ? (
            <span className="rounded bg-[color-mix(in_oklab,var(--ark-chart-live)_78%,black)] px-1.5 py-0.5 text-[11px] font-semibold text-white">
              Live Photo
            </span>
          ) : null}
          {item.file.kind === "video" && !isLivePhoto ? (
            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">视频</span>
          ) : null}
        </div>
        <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2 text-white">
          <p className="truncate text-sm font-medium">{item.file.name}</p>
          <p className="text-xs text-white/80">{formatBytes(item.file.sizeBytes)}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        <span className="truncate text-sm mp-muted">
          {formatDateTime(item.file.capturedAt ?? item.file.modifiedAt)}
        </span>
        <span className="shrink-0 rounded-md border border-[var(--ark-line)] px-1.5 py-0.5 text-[11px] uppercase mp-muted">
          {isLivePhoto ? "Live Photo" : item.file.kind === "video" ? "视频" : "图片"}
        </span>
      </div>
    </button>
  );
}
