import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalStorageState } from "../hooks/use-local-storage-state";
import { getStorages } from "../lib/api";
import type { StorageTarget } from "../types/api";
import { MediaGrid } from "./media/media-grid";
import { MediaPreviewDialog } from "./media/media-preview-dialog";
import { MediaSidebar } from "./media/media-sidebar";
import type { MediaKindFilter, ViewerRuntimeMeta } from "./media/media-types";
import { useFocusTrap } from "./media/use-focus-trap";
import { useLongPress } from "./media/use-long-press";
import { useMediaBrowser } from "./media/use-media-browser";
import { usePreviewHotkeys } from "./media/use-preview-hotkeys";

interface MediaPaneProps {
  storages: StorageTarget[];
}

function MediaPane({ storages }: MediaPaneProps) {
  const [storageId, setStorageId] = useLocalStorageState("ark-last-media-storage-id", "");
  const [thumbSize, setThumbSize] = useLocalStorageState("ark-media-thumb-size", 170);
  const [kindFilter, setKindFilter] = useState<MediaKindFilter>("all");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [playingLiveVideo, setPlayingLiveVideo] = useState(false);
  const [showMediaInfo, setShowMediaInfo] = useState(false);
  const [brokenThumbImagePaths, setBrokenThumbImagePaths] = useState<Set<string>>(new Set());
  const [brokenThumbVideoPaths, setBrokenThumbVideoPaths] = useState<Set<string>>(new Set());
  const [brokenViewerImagePaths, setBrokenViewerImagePaths] = useState<Set<string>>(new Set());
  const [viewerMetaByPath, setViewerMetaByPath] = useState<Record<string, ViewerRuntimeMeta>>({});
  const previewDialogRef = useRef<HTMLDivElement | null>(null);
  const previewCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerElementRef = useRef<HTMLElement | null>(null);

  const selectedStorage = storages.find((s) => s.id === storageId);

  const {
    loadingMedia,
    error,
    setError,
    setMedia,
    displayItems,
    mediaSummary,
    refresh
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

  const normalizedThumbSize = Math.max(110, Math.min(260, Number(thumbSize) || 170));

  const upsertViewerMeta = useCallback((pathKey: string, next: ViewerRuntimeMeta) => {
    setViewerMetaByPath((prev) => ({
      ...prev,
      [pathKey]: { ...prev[pathKey], ...next }
    }));
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
    },
    [setError, setMedia, setStorageId]
  );

  return (
    <article className="mp-panel flex min-h-[calc(100vh-12rem)] flex-col p-4 md:min-h-0 md:flex-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">存储媒体</h3>
          <p className="mt-1 text-xs mp-muted">按存储浏览媒体，支持 Live Photo 动态预览与元数据查看</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
          <span className="mp-chip">总计 {mediaSummary.total}</span>
          <span className="mp-chip">图片 {mediaSummary.imageCount}</span>
          <span className="mp-chip">视频 {mediaSummary.videoCount}</span>
          <span className="mp-chip mp-chip-success">Live Photo {mediaSummary.liveCount}</span>
        </div>
      </div>
      {error ? <p className="mp-error mt-3">{error}</p> : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
        <MediaSidebar
          storages={storages}
          storageId={storageId}
          selectedStorage={selectedStorage}
          loadingMedia={loadingMedia}
          displayCount={displayItems.length}
          kindFilter={kindFilter}
          normalizedThumbSize={normalizedThumbSize}
          onStorageChange={handleStorageChange}
          onRefresh={handleRefresh}
          onKindFilterChange={setKindFilter}
          onThumbSizeChange={setThumbSize}
        />

        <section className="flex min-h-[56vh] min-w-0 flex-col rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ark-line)] pb-2">
            <p className="text-sm">
              {selectedStorage ? (
                <>
                  <span className="font-semibold">{selectedStorage.name}</span>
                  <span className="mp-muted"> · 匹配 {displayItems.length} 项</span>
                </>
              ) : (
                <span className="mp-muted">请先选择存储后再浏览媒体</span>
              )}
            </p>
            <div className="flex items-center gap-2 text-xs">
              {loadingMedia ? <span className="mp-chip">正在读取...</span> : null}
              {!loadingMedia && selectedStorage ? <span className="mp-chip mp-chip-success">已加载</span> : null}
            </div>
          </div>

          <MediaGrid
            selectedStorage={selectedStorage}
            displayItems={displayItems}
            activePath={activePath}
            loadingMedia={loadingMedia}
            normalizedThumbSize={normalizedThumbSize}
            brokenThumbImagePaths={brokenThumbImagePaths}
            brokenThumbVideoPaths={brokenThumbVideoPaths}
            onOpen={(path) => openByPath(path)}
            onThumbImageError={handleThumbImageError}
            onThumbVideoError={handleThumbVideoError}
          />
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
    </article>
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
      {error ? <p className="mp-error">{error}</p> : null}
      <MediaPane storages={storages} />
    </section>
  );
}
