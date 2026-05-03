import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { InlineAlert } from "../components/inline-alert";
import { StatusBadge } from "../components/data/status-badge";
import { Button } from "../components/ui/button";
import { Drawer } from "../components/ui/drawer";
import { PageHeader } from "../components/ui/page-header";
import { StateBlock } from "../components/ui/state-block";
import { useLocalStorageState } from "../hooks/use-local-storage-state";
import { getStorages } from "../lib/api";
import type { StorageTarget } from "../types/api";
import { getMediaLibraryStatusText, normalizeThumbSize } from "./media-page-model";
import { MediaGrid } from "./media/media-grid";
import { MediaPreviewDialog } from "./media/media-preview-dialog";
import { MediaSidebar } from "./media/media-sidebar";
import type { MediaKindFilter, ViewerRuntimeMeta } from "./media/media-types";
import { useFocusTrap } from "./media/use-focus-trap";
import { useLongPress } from "./media/use-long-press";
import { useMediaBrowser } from "./media/use-media-browser";
import { usePreviewHotkeys } from "./media/use-preview-hotkeys";

const MAX_META_CACHE_SIZE = 50;

interface MediaPaneProps {
  storages: StorageTarget[];
}

function MediaPane({ storages }: MediaPaneProps) {
  const [storageId, setStorageId] = useLocalStorageState("ark-last-media-storage-id", "");
  const [thumbSize, setThumbSize] = useLocalStorageState("ark-media-thumb-size", 170);
  const [kindFilter, setKindFilter] = useState<MediaKindFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateRange, setDateRange] = useState<"all" | "7d" | "30d" | "365d">("all");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [playingLiveVideo, setPlayingLiveVideo] = useState(false);
  const [showMediaInfo, setShowMediaInfo] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [brokenThumbImagePaths, setBrokenThumbImagePaths] = useState<Set<string>>(new Set());
  const [brokenThumbVideoPaths, setBrokenThumbVideoPaths] = useState<Set<string>>(new Set());
  const [brokenViewerImagePaths, setBrokenViewerImagePaths] = useState<Set<string>>(new Set());
  const [viewerMetaByPath, setViewerMetaByPath] = useState<Record<string, ViewerRuntimeMeta>>({});
  const previewDialogRef = useRef<HTMLDivElement | null>(null);
  const previewCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerElementRef = useRef<HTMLElement | null>(null);

  const selectedStorage = storages.find((s) => s.id === storageId);

  const {
    media,
    loadingMedia,
    loadingMore,
    error,
    setError,
    setMedia,
    displayItems,
    mediaSummary,
    refresh,
    hasMore,
    loadMore
  } = useMediaBrowser(selectedStorage, kindFilter);

  useEffect(() => {
    if (!storageId || storages.some((item) => item.id === storageId)) return;
    setStorageId("");
  }, [storages, storageId, setStorageId]);

  const resetPreviewState = useCallback(() => {
    setActivePath(null);
    setPlayingLiveVideo(false);
    setShowMediaInfo(false);
    setBrokenThumbImagePaths(new Set());
    setBrokenThumbVideoPaths(new Set());
    setBrokenViewerImagePaths(new Set());
    setViewerMetaByPath({});
  }, []);

  useEffect(() => {
    if (!selectedStorage) {
      setActivePath(null);
      setPlayingLiveVideo(false);
      setBrokenThumbVideoPaths(new Set());
      setViewerMetaByPath({});
      return;
    }
    resetPreviewState();
  }, [selectedStorage?.id, resetPreviewState]);

  const activeItem = useMemo(
    () => displayItems.find((item) => item.file.path === activePath) ?? null,
    [displayItems, activePath]
  );
  const activePair = activeItem?.livePair ?? null;
  const activeList = displayItems;
  const activeIndex = activeItem ? activeList.findIndex((item) => item.file.path === activeItem.file.path) : -1;
  const previewOpen = Boolean(selectedStorage && activeItem);

  const toggleLive = useCallback(() => {
    setPlayingLiveVideo((prev) => !prev);
  }, []);

  const longPress = useLongPress({
    enabled: Boolean(activePair),
    thresholdMs: 120,
    onActivate: () => setPlayingLiveVideo(true),
    onCancel: () => setPlayingLiveVideo(false)
  });

  const openByPath = useCallback(
    (nextPath: string, options?: { preserveOpener?: boolean }) => {
      if (!options?.preserveOpener) {
        openerElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setShowMediaInfo(false);
      }
      setActivePath(nextPath);
      setPlayingLiveVideo(false);
    },
    []
  );

  const closePreview = useCallback(() => {
    setActivePath(null);
    setPlayingLiveVideo(false);
    setShowMediaInfo(false);
    longPress.clear();
  }, [longPress]);

  const openPrev = useCallback(() => {
    if (activeIndex <= 0) return;
    openByPath(activeList[activeIndex - 1].file.path, { preserveOpener: true });
  }, [activeIndex, activeList, openByPath]);

  const openNext = useCallback(() => {
    if (activeIndex < 0 || activeIndex >= activeList.length - 1) return;
    openByPath(activeList[activeIndex + 1].file.path, { preserveOpener: true });
  }, [activeIndex, activeList, openByPath]);

  const hotkeyActions = useMemo(
    () => ({
      onClose: closePreview,
      onPrev: openPrev,
      onNext: openNext,
      onToggleLive: toggleLive
    }),
    [closePreview, openPrev, openNext, toggleLive]
  );

  usePreviewHotkeys(previewOpen, {
    hasLivePair: Boolean(activePair),
    actions: hotkeyActions
  });

  useFocusTrap({
    enabled: previewOpen,
    containerRef: previewDialogRef,
    initialFocusRef: previewCloseButtonRef,
    restoreFocusRef: openerElementRef
  });

  const normalizedThumbSize = normalizeThumbSize(thumbSize);

  const filteredItems = useMemo(() => {
    let items = displayItems;
    if (searchTerm.trim()) {
      const keyword = searchTerm.trim().toLowerCase();
      items = items.filter((item) => {
        const path = item.file.path.toLowerCase();
        const name = item.file.name.toLowerCase();
        return path.includes(keyword) || name.includes(keyword);
      });
    }

    if (dateRange !== "all") {
      const now = Date.now();
      const dayMs = 24 * 60 * 60 * 1000;
      const rangeDays = dateRange === "7d" ? 7 : dateRange === "30d" ? 30 : 365;
      const threshold = now - rangeDays * dayMs;
      items = items.filter((item) => {
        const dateValue = item.file.capturedAt ?? item.file.modifiedAt;
        if (!dateValue) return false;
        const ts = Date.parse(dateValue);
        if (Number.isNaN(ts)) return false;
        return ts >= threshold;
      });
    }

    return items;
  }, [displayItems, searchTerm, dateRange]);

  const upsertViewerMeta = useCallback((pathKey: string, next: ViewerRuntimeMeta) => {
    setViewerMetaByPath((prev) => {
      const updated = { ...prev, [pathKey]: { ...prev[pathKey], ...next } };
      const keys = Object.keys(updated);
      if (keys.length > MAX_META_CACHE_SIZE) {
        const keysToRemove = keys.slice(0, keys.length - MAX_META_CACHE_SIZE);
        for (const key of keysToRemove) {
          delete updated[key];
        }
      }
      return updated;
    });
  }, []);

  const handleThumbImageError = useCallback((path: string) => {
    setBrokenThumbImagePaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const handleThumbVideoError = useCallback((path: string) => {
    setBrokenThumbVideoPaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const handleViewerImageError = useCallback((path: string) => {
    setBrokenViewerImagePaths((prev) => {
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const handleRefresh = useCallback(() => {
    resetPreviewState();
    void refresh();
  }, [refresh, resetPreviewState]);

  const handleStorageChange = useCallback(
    (nextId: string) => {
      setStorageId(nextId);
      setError("");
      setMedia(null);
      setActivePath(null);
      setFiltersOpen(false);
    },
    [setError, setMedia, setStorageId]
  );

  const statusText = media
    ? getMediaLibraryStatusText({ loaded: media.files.length, total: media.total, filtered: filteredItems.length })
    : `筛选后 ${filteredItems.length.toLocaleString("zh-CN")}`;

  const renderSidebar = (idPrefix: string) => (
    <MediaSidebar
      idPrefix={idPrefix}
      storages={storages}
      storageId={storageId}
      selectedStorage={selectedStorage}
      loadingMedia={loadingMedia}
      displayCount={filteredItems.length}
      kindFilter={kindFilter}
      normalizedThumbSize={normalizedThumbSize}
      searchTerm={searchTerm}
      dateRange={dateRange}
      onStorageChange={handleStorageChange}
      onRefresh={handleRefresh}
      onKindFilterChange={setKindFilter}
      onThumbSizeChange={setThumbSize}
      onSearchChange={setSearchTerm}
      onDateRangeChange={setDateRange}
    />
  );

  return (
    <section className="flex min-h-0 flex-col gap-3 pb-4 md:h-full">
      <PageHeader
        eyebrow="Media Library"
        title="存储媒体"
        description="按存储浏览媒体，支持 Live Photo 动态预览与元数据查看。"
        chips={
          <>
            <StatusBadge>总计 {mediaSummary.total.toLocaleString("zh-CN")}</StatusBadge>
            <StatusBadge>图片 {mediaSummary.imageCount.toLocaleString("zh-CN")}</StatusBadge>
            <StatusBadge>视频 {mediaSummary.videoCount.toLocaleString("zh-CN")}</StatusBadge>
            <StatusBadge tone="success">Live Photo {mediaSummary.liveCount.toLocaleString("zh-CN")}</StatusBadge>
            <StatusBadge tone="info">{statusText}</StatusBadge>
          </>
        }
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button className="md:hidden" size="sm" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
              筛选
            </Button>
            {loadingMedia ? <StatusBadge tone="info">正在读取</StatusBadge> : null}
            {hasMore ? (
              <Button variant="primary" size="sm" busy={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "加载中..." : "加载更多"}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? (
        <InlineAlert tone="error" onClose={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}

      <Drawer open={filtersOpen} title="媒体筛选" side="bottom" onClose={() => setFiltersOpen(false)}>
        {renderSidebar("media-drawer")}
      </Drawer>

      <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[280px_minmax(0,1fr)]">
        <div className="hidden min-h-0 md:block">{renderSidebar("media-desktop")}</div>

        <section className="mp-panel flex min-h-[58vh] min-w-0 flex-col p-3 md:min-h-0">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--ark-line)] pb-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {selectedStorage ? (
                  <>
                    {selectedStorage.name}
                    <span className="font-normal mp-muted"> · 匹配 {displayItems.length.toLocaleString("zh-CN")} 项</span>
                  </>
                ) : (
                  "未选择存储"
                )}
              </p>
              <p className="mt-1 truncate text-xs mp-muted">
                {selectedStorage ? selectedStorage.basePath : "请先选择存储后再浏览媒体"}
              </p>
            </div>
            {!loadingMedia && selectedStorage ? <StatusBadge tone="success">已加载</StatusBadge> : null}
          </div>

          {!selectedStorage && !loadingMedia ? (
            <div className="flex min-h-[40vh] items-center justify-center p-4">
              <StateBlock title="请先选择存储" description="选择筛选面板中的存储后即可浏览媒体内容。" />
            </div>
          ) : (
            <MediaGrid
              selectedStorage={selectedStorage}
              displayItems={filteredItems}
              activePath={activePath}
              loadingMedia={loadingMedia}
              normalizedThumbSize={normalizedThumbSize}
              brokenThumbImagePaths={brokenThumbImagePaths}
              brokenThumbVideoPaths={brokenThumbVideoPaths}
              onOpen={(path) => openByPath(path)}
              onThumbImageError={handleThumbImageError}
              onThumbVideoError={handleThumbVideoError}
              emptyHint={searchTerm || dateRange !== "all" ? "当前筛选无结果，尝试调整搜索或时间范围。" : undefined}
            />
          )}
        </section>
      </div>

      {selectedStorage && activeItem ? (
        <MediaPreviewDialog
          open={previewOpen}
          selectedStorage={selectedStorage}
          activeItem={activeItem}
          activePair={activePair}
          activeIndex={activeIndex}
          activeCount={activeList.length}
          playingLiveVideo={playingLiveVideo}
          showMediaInfo={showMediaInfo}
          viewerMetaByPath={viewerMetaByPath}
          brokenViewerImagePaths={brokenViewerImagePaths}
          dialogRef={previewDialogRef}
          closeButtonRef={previewCloseButtonRef}
          onClose={closePreview}
          onPrev={openPrev}
          onNext={openNext}
          onToggleLive={toggleLive}
          onToggleInfo={() => setShowMediaInfo((prev) => !prev)}
          onViewerImageError={handleViewerImageError}
          onMetaUpdate={upsertViewerMeta}
          pointerHandlers={longPress}
        />
      ) : null}
    </section>
  );
}

export function MediaPage() {
  const [storages, setStorages] = useState<StorageTarget[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void getStorages()
      .then((res) => setStorages(res.items))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <section className="space-y-3 md:flex md:h-full md:flex-col">
      {error ? (
        <InlineAlert tone="error" onClose={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}
      <MediaPane storages={storages} />
    </section>
  );
}
