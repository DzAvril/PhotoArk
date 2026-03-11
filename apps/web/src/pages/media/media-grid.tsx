import { getStorageMediaStreamUrl } from "../../lib/api";
import type { StorageTarget } from "../../types/api";
import type { DisplayMediaItem } from "./media-types";
import { formatBytes, formatDateTime } from "./media-utils";
import AutoSizer from "react-virtualized-auto-sizer";
import { FixedSizeGrid as Grid, GridChildComponentProps } from "react-window";
import { memo, useCallback } from "react";
import { useLazyLoad } from "../../hooks/use-lazy-load";

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

type GridItemData = {
  items: DisplayMediaItem[];
  columnCount: number;
  activePath: string | null;
  selectedStorage: StorageTarget | undefined;
  brokenThumbImagePaths: Set<string>;
  brokenThumbVideoPaths: Set<string>;
  onOpen: (path: string) => void;
  onThumbImageError: (path: string) => void;
  onThumbVideoError: (path: string) => void;
};

const VirtualCell = memo(({ columnIndex, rowIndex, style, data }: GridChildComponentProps<GridItemData>) => {
  const {
    items,
    columnCount,
    activePath,
    selectedStorage,
    brokenThumbImagePaths,
    brokenThumbVideoPaths,
    onOpen,
    onThumbImageError,
    onThumbVideoError
  } = data;
  
  const index = rowIndex * columnCount + columnIndex;
  if (index >= items.length) return null;
  const item = items[index];

  // Adjust style to account for gap (padding)
  const adjustedStyle = {
    ...style,
    left: Number(style.left) + 5,
    top: Number(style.top) + 5,
    width: Number(style.width) - 10,
    height: Number(style.height) - 10
  };

  if (!selectedStorage) return null;

  return (
    <div style={adjustedStyle}>
      <MediaGridItem
        item={item}
        isActiveItem={activePath === item.file.path}
        storageId={selectedStorage.id}
        brokenThumbImagePaths={brokenThumbImagePaths}
        brokenThumbVideoPaths={brokenThumbVideoPaths}
        onOpen={onOpen}
        onThumbImageError={onThumbImageError}
        onThumbVideoError={onThumbVideoError}
      />
    </div>
  );
});

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

  return (
    <div className="mt-2 min-h-0 flex-1 overflow-hidden">
      {loadingMedia ? (
        <div className="flex h-full min-h-40 items-center justify-center">
          <span className="mp-chip">正在加载媒体目录...</span>
        </div>
      ) : null}

      {!loadingMedia ? (
        <>
          {displayItems.length > 0 ? (
            <AutoSizer>
              {({ height, width }: { height: number; width: number }) => {
                const itemWidth = normalizedThumbSize + 10;
                const columnCount = Math.floor(width / itemWidth) || 1;
                const rowCount = Math.ceil(displayItems.length / columnCount);
                const actualItemWidth = width / columnCount;

                return (
                  <Grid
                    columnCount={columnCount}
                    columnWidth={actualItemWidth}
                    height={height}
                    rowCount={rowCount}
                    rowHeight={actualItemWidth + 50}
                    width={width}
                    itemData={{
                      items: displayItems,
                      columnCount,
                      activePath,
                      selectedStorage,
                      brokenThumbImagePaths,
                      brokenThumbVideoPaths,
                      onOpen,
                      onThumbImageError,
                      onThumbVideoError
                    }}
                  >
                    {VirtualCell}
                  </Grid>
                );
              }}
            </AutoSizer>
          ) : (
            <div className="overflow-auto h-full">
               <p className="py-5 text-center text-sm mp-muted">
                {selectedStorage ? "该位置暂无可浏览媒体，可尝试切换筛选类型。" : "请先选择存储后再浏览媒体。"}
              </p>
            </div>
          )}
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

function arePropsEqual(prevProps: MediaGridItemProps, nextProps: MediaGridItemProps): boolean {
  return (
    prevProps.item.file.path === nextProps.item.file.path &&
    prevProps.item.file.name === nextProps.item.file.name &&
    prevProps.item.file.sizeBytes === nextProps.item.file.sizeBytes &&
    prevProps.item.file.kind === nextProps.item.file.kind &&
    prevProps.isActiveItem === nextProps.isActiveItem &&
    prevProps.storageId === nextProps.storageId &&
    prevProps.brokenThumbImagePaths.has(nextProps.item.file.path) === nextProps.brokenThumbImagePaths.has(nextProps.item.file.path) &&
    prevProps.brokenThumbVideoPaths.has(nextProps.item.file.path) === nextProps.brokenThumbVideoPaths.has(nextProps.item.file.path) &&
    Boolean(prevProps.item.livePair) === Boolean(nextProps.item.livePair)
  );
}

const MediaGridItem = memo(function MediaGridItem(props: MediaGridItemProps) {
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

  const { ref: lazyLoadRef, isVisible } = useLazyLoad({
    rootMargin: "100px",
    threshold: 0,
    maxConcurrent: 10,
    priority: 0
  });

  const handleClick = useCallback(() => {
    onOpen(item.file.path);
  }, [onOpen, item.file.path]);

  const handleImageError = useCallback(() => {
    onThumbImageError(item.file.path);
  }, [onThumbImageError, item.file.path]);

  const handleVideoError = useCallback(() => {
    onThumbVideoError(item.file.path);
  }, [onThumbVideoError, item.file.path]);

  const handleVideoLoadedMetadata = useCallback((event: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (!Number.isFinite(video.duration) || video.duration <= 0.11) return;
    if (video.currentTime >= 0.09) return;
    try {
      video.currentTime = 0.1;
    } catch {
      return;
    }
  }, []);

  return (
    <button
      ref={lazyLoadRef}
      type="button"
      className={`group overflow-hidden rounded-xl border bg-[var(--ark-surface)] text-left transition-all hover:border-[var(--ark-line-strong)] hover:shadow-md ${
        isActiveItem
          ? "border-[var(--ark-primary)] ring-2 ring-[color-mix(in_oklab,var(--ark-primary)_35%,transparent)]"
          : "border-[var(--ark-line)]"
      }`}
      onClick={handleClick}
    >
      <div className="relative aspect-square overflow-hidden bg-black/15">
        {item.file.kind === "image" ? (
          thumbBroken ? (
            <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-white/80">
              图片预览不可用
            </div>
          ) : (
            <img
              data-src={isVisible ? streamUrl : undefined}
              src={isVisible ? streamUrl : undefined}
              alt={item.file.name}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              loading="lazy"
              onError={handleImageError}
            />
          )
        ) : videoThumbBroken ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center text-sm text-white/80">
            <span>▶</span>
            <span>该视频格式无法生成缩略图</span>
          </div>
        ) : (
          <video
            data-src={isVisible ? `${streamUrl}#t=0.1` : undefined}
            src={isVisible ? `${streamUrl}#t=0.1` : undefined}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            preload="metadata"
            muted
            playsInline
            onLoadedMetadata={handleVideoLoadedMetadata}
            onError={handleVideoError}
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
}, arePropsEqual);
