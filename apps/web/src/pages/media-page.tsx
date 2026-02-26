import { useEffect, useId, useMemo, useRef, useState } from "react";
import { browseStorageMedia, getStorageMediaStreamUrl, getStorages } from "../lib/api";
import { useLocalStorageState } from "../hooks/use-local-storage-state";
import type { MediaBrowseResult, MediaFileItem, StorageTarget } from "../types/api";

interface MediaPaneProps {
  storages: StorageTarget[];
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".m4v", ".avi", ".mkv", ".webm"]);

type LivePhotoPair = {
  image: MediaFileItem;
  video: MediaFileItem;
};

type DisplayMediaItem = {
  key: string;
  file: MediaFileItem;
  livePair: LivePhotoPair | null;
};

type ViewerRuntimeMeta = {
  width?: number;
  height?: number;
  durationSeconds?: number;
};

function splitFileName(name: string) {
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return { base: name.toLowerCase(), ext: "" };
  return { base: name.slice(0, dotIdx).toLowerCase(), ext: name.slice(dotIdx).toLowerCase() };
}

function formatBytes(bytes: number | null) {
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

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatDuration(seconds: number | undefined) {
  if (!Number.isFinite(seconds) || seconds === undefined) return "-";
  const whole = Math.max(0, Math.round(seconds));
  const hh = Math.floor(whole / 3600);
  const mm = Math.floor((whole % 3600) / 60);
  const ss = whole % 60;
  return hh > 0
    ? `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function detectLivePhotoPairs(media: MediaBrowseResult | null) {
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

function buildDisplayItems(
  files: MediaFileItem[],
  livePhotoPairByPath: Map<string, LivePhotoPair>,
  kindFilter: "all" | "image" | "video" | "live"
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

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

function MediaPane({ storages }: MediaPaneProps) {
  const [storageId, setStorageId] = useLocalStorageState("ark-last-media-storage-id", "");
  const [thumbSize, setThumbSize] = useLocalStorageState("ark-media-thumb-size", 170);
  const [media, setMedia] = useState<MediaBrowseResult | null>(null);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "video" | "live">("all");
  const [error, setError] = useState("");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [playingLiveVideo, setPlayingLiveVideo] = useState(false);
  const [showMediaInfo, setShowMediaInfo] = useState(false);
  const [brokenThumbImagePaths, setBrokenThumbImagePaths] = useState<Set<string>>(new Set());
  const [brokenThumbVideoPaths, setBrokenThumbVideoPaths] = useState<Set<string>>(new Set());
  const [brokenViewerImagePaths, setBrokenViewerImagePaths] = useState<Set<string>>(new Set());
  const [viewerMetaByPath, setViewerMetaByPath] = useState<Record<string, ViewerRuntimeMeta>>({});
  const livePressTimerRef = useRef<number | null>(null);
  const previewDialogRef = useRef<HTMLDivElement | null>(null);
  const previewCloseButtonRef = useRef<HTMLButtonElement | null>(null);
  const openerElementRef = useRef<HTMLElement | null>(null);
  const previewTitleId = useId();
  const previewHintId = useId();

  const selectedStorage = storages.find((s) => s.id === storageId);

  useEffect(() => {
    if (!storageId || storages.some((item) => item.id === storageId)) return;
    setStorageId("");
  }, [storages, storageId, setStorageId]);

  async function previewMedia() {
    if (!selectedStorage) return;
    setLoadingMedia(true);
    setError("");
    if (selectedStorage.type === "cloud_115") {
      setError("当前版本暂不支持直接浏览 115 存储媒体");
      setLoadingMedia(false);
      return;
    }
    try {
      setMedia(await browseStorageMedia(selectedStorage.id, selectedStorage.basePath));
      setActivePath(null);
      setPlayingLiveVideo(false);
      setBrokenThumbImagePaths(new Set());
      setBrokenThumbVideoPaths(new Set());
      setBrokenViewerImagePaths(new Set());
      setViewerMetaByPath({});
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoadingMedia(false);
    }
  }

  useEffect(() => {
    if (!selectedStorage) {
      setMedia(null);
      setLoadingMedia(false);
      setActivePath(null);
      setPlayingLiveVideo(false);
      setBrokenThumbVideoPaths(new Set());
      setViewerMetaByPath({});
      return;
    }
    void previewMedia();
  }, [selectedStorage?.id]);

  const allFiles = media?.files ?? [];
  const livePhotoPairByPath = useMemo(() => detectLivePhotoPairs(media), [media]);
  const displayItems = useMemo(
    () => buildDisplayItems(allFiles, livePhotoPairByPath, kindFilter),
    [allFiles, livePhotoPairByPath, kindFilter]
  );
  const activeItem = useMemo(
    () => displayItems.find((item) => item.file.path === activePath) ?? null,
    [displayItems, activePath]
  );
  const activePair = activeItem?.livePair ?? null;
  const activeList = displayItems;
  const activeIndex = activeItem ? activeList.findIndex((item) => item.file.path === activeItem.file.path) : -1;
  const previewOpen = Boolean(selectedStorage && activeItem);

  function openByPath(nextPath: string, options?: { preserveOpener?: boolean }) {
    if (!options?.preserveOpener) {
      openerElementRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setShowMediaInfo(false);
    }
    setActivePath(nextPath);
    setPlayingLiveVideo(false);
  }
  function closePreview() {
    setActivePath(null);
    setPlayingLiveVideo(false);
    setShowMediaInfo(false);
    clearLivePressTimer();
  }
  function openPrev() {
    if (activeIndex <= 0) return;
    openByPath(activeList[activeIndex - 1].file.path, { preserveOpener: true });
  }
  function openNext() {
    if (activeIndex < 0 || activeIndex >= activeList.length - 1) return;
    openByPath(activeList[activeIndex + 1].file.path, { preserveOpener: true });
  }

  useEffect(() => {
    if (!previewOpen) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => previewCloseButtonRef.current?.focus());
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      openerElementRef.current?.focus();
    };
  }, [previewOpen]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (!activeItem) return;
      if (e.key === "Tab") {
        const dialog = previewDialogRef.current;
        if (!dialog) return;
        const focusable = getFocusableElements(dialog);
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (e.shiftKey) {
          if (!active || active === first || !dialog.contains(active)) {
            e.preventDefault();
            last.focus();
          }
          return;
        }
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (e.key === "Escape") closePreview();
      if (e.key === "ArrowLeft") openPrev();
      if (e.key === "ArrowRight") openNext();
      if ((e.key === " " || e.key.toLowerCase() === "l") && activePair) {
        e.preventDefault();
        setPlayingLiveVideo((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [activeItem, activeIndex, activeList, activePair]);

  const activeViewerImagePath = activePair ? activePair.image.path : activeItem?.file.path ?? null;
  const activeViewerVideoPath = activePair
    ? activePair.video.path
    : activeItem?.file.kind === "video"
      ? activeItem.file.path
      : null;
  const shouldShowVideoViewer = Boolean(activeViewerVideoPath && (playingLiveVideo || activeItem?.file.kind === "video"));
  const activeViewerPath = shouldShowVideoViewer ? activeViewerVideoPath : activeViewerImagePath;
  const activeViewerMeta = activeViewerPath ? viewerMetaByPath[activeViewerPath] : undefined;
  const activeKindLabel = activePair ? "Live Photo" : activeItem?.file.kind === "video" ? "视频" : "图片";
  const activeLatitude = activeItem?.file.latitude;
  const activeLongitude = activeItem?.file.longitude;
  const activeLocationLabel =
    activeLatitude !== null && activeLatitude !== undefined && activeLongitude !== null && activeLongitude !== undefined
      ? `${activeLatitude.toFixed(6)}, ${activeLongitude.toFixed(6)}`
      : "未读取到位置信息";

  function upsertViewerMeta(pathKey: string, next: ViewerRuntimeMeta) {
    setViewerMetaByPath((prev) => ({
      ...prev,
      [pathKey]: { ...prev[pathKey], ...next }
    }));
  }

  function clearLivePressTimer() {
    if (livePressTimerRef.current !== null) {
      window.clearTimeout(livePressTimerRef.current);
      livePressTimerRef.current = null;
    }
  }

  function startLivePress() {
    if (!activePair) return;
    clearLivePressTimer();
    livePressTimerRef.current = window.setTimeout(() => {
      setPlayingLiveVideo(true);
      livePressTimerRef.current = null;
    }, 120);
  }

  function endLivePress() {
    clearLivePressTimer();
    if (activePair) {
      setPlayingLiveVideo(false);
    }
  }

  useEffect(() => () => clearLivePressTimer(), []);

  const normalizedThumbSize = Math.max(110, Math.min(260, Number(thumbSize) || 170));
  const mediaGridStyle = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${normalizedThumbSize}px, 1fr))`
  };
  const mediaSummary = useMemo(() => {
    let imageCount = 0;
    let videoCount = 0;
    for (const file of allFiles) {
      if (file.kind === "image") imageCount += 1;
      if (file.kind === "video") videoCount += 1;
    }
    const liveCount = new Set(
      [...livePhotoPairByPath.values()].map((pair) => pair.image.path)
    ).size;
    return {
      total: allFiles.length,
      imageCount,
      videoCount,
      liveCount
    };
  }, [allFiles, livePhotoPairByPath]);

  return (
    <article className="mp-panel flex min-h-[calc(100vh-12rem)] flex-col p-4 md:min-h-0 md:flex-1">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">存储媒体</h3>
          <p className="mt-1 text-sm mp-muted">按存储浏览媒体，支持 Live Photo 动态预览与元数据查看</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
          <span className="mp-chip">总计 {mediaSummary.total}</span>
          <span className="mp-chip">图片 {mediaSummary.imageCount}</span>
          <span className="mp-chip">视频 {mediaSummary.videoCount}</span>
          <span className="mp-chip mp-chip-success">Live {mediaSummary.liveCount}</span>
        </div>
      </div>
      {error ? <p className="mp-error mt-3">{error}</p> : null}

      <div className="mt-3 grid gap-3 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="mp-panel mp-panel-soft p-3">
          <label htmlFor="media-storage-select" className="block text-sm font-medium">
            选择存储
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <select
              id="media-storage-select"
              className="mp-select"
              value={storageId}
              disabled={!storages.length}
              onChange={(e) => {
                setStorageId(e.target.value);
                setError("");
                setMedia(null);
                setActivePath(null);
              }}
            >
              <option value="">选择存储</option>
              {storages.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
            </select>
            <button type="button" className="mp-btn shrink-0" onClick={() => void previewMedia()} disabled={!selectedStorage || loadingMedia}>
              刷新
            </button>
          </div>
          <p className="mt-2 text-xs mp-muted break-all">
            {selectedStorage ? `${selectedStorage.name} · ${selectedStorage.basePath}` : "选择存储后可浏览媒体内容"}
          </p>

          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] mp-muted">筛选类型</p>
            <div className="mp-segment">
              <button type="button" className="mp-segment-item" aria-pressed={kindFilter === "all"} onClick={() => setKindFilter("all")}>
                全部
              </button>
              <button type="button" className="mp-segment-item" aria-pressed={kindFilter === "image"} onClick={() => setKindFilter("image")}>
                图片
              </button>
              <button type="button" className="mp-segment-item" aria-pressed={kindFilter === "video"} onClick={() => setKindFilter("video")}>
                视频
              </button>
              <button type="button" className="mp-segment-item" aria-pressed={kindFilter === "live"} onClick={() => setKindFilter("live")}>
                Live
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="media-zoom" className="text-sm font-medium">
                缩略图尺寸
              </label>
              <span className="mp-chip text-xs">{normalizedThumbSize}px</span>
            </div>
            <input
              id="media-zoom"
              type="range"
              min={110}
              max={260}
              step={10}
              value={normalizedThumbSize}
              onChange={(e) => setThumbSize(Number(e.target.value))}
              className="mp-slider"
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={`mp-btn flex-1 ${normalizedThumbSize <= 150 ? "mp-btn-primary" : ""}`}
                onClick={() => setThumbSize(140)}
              >
                紧凑
              </button>
              <button
                type="button"
                className={`mp-btn flex-1 ${normalizedThumbSize > 150 && normalizedThumbSize < 200 ? "mp-btn-primary" : ""}`}
                onClick={() => setThumbSize(170)}
              >
                标准
              </button>
              <button
                type="button"
                className={`mp-btn flex-1 ${normalizedThumbSize >= 200 ? "mp-btn-primary" : ""}`}
                onClick={() => setThumbSize(220)}
              >
                放大
              </button>
            </div>
          </div>
        </aside>

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

          <div className="mt-2 min-h-0 flex-1 overflow-auto">
            {loadingMedia ? (
              <div className="flex h-full min-h-40 items-center justify-center">
                <span className="mp-chip">正在加载媒体目录...</span>
              </div>
            ) : null}

            {!loadingMedia ? (
              <>
                <div className="grid gap-2.5" style={mediaGridStyle}>
                  {selectedStorage && displayItems.map((item) => {
                    const streamUrl = getStorageMediaStreamUrl(selectedStorage.id, item.file.path);
                    const isLivePhoto = Boolean(item.livePair);
                    const thumbBroken = brokenThumbImagePaths.has(item.file.path);
                    const videoThumbBroken = brokenThumbVideoPaths.has(item.file.path);
                    const isActiveItem = activePath === item.file.path;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        className={`group overflow-hidden rounded-xl border bg-[var(--ark-surface)] text-left transition-all hover:-translate-y-0.5 hover:border-[var(--ark-line-strong)] hover:shadow-md ${
                          isActiveItem
                            ? "border-[var(--ark-primary)] shadow-[0_10px_24px_color-mix(in_oklab,var(--ark-primary)_22%,transparent)]"
                            : "border-[var(--ark-line)]"
                        }`}
                        onClick={() => openByPath(item.file.path)}
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
                                onError={() => {
                                  setBrokenThumbImagePaths((prev) => {
                                    const next = new Set(prev);
                                    next.add(item.file.path);
                                    return next;
                                  });
                                }}
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
                                  // Ignore seek failures; browser may still render first frame.
                                }
                              }}
                              onError={() => {
                                setBrokenThumbVideoPaths((prev) => {
                                  const next = new Set(prev);
                                  next.add(item.file.path);
                                  return next;
                                });
                              }}
                            />
                          )}
                          <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/65 to-transparent" />
                          <div className="absolute left-2 top-2 flex items-center gap-1.5">
                            {isLivePhoto ? <span className="rounded bg-emerald-500/85 px-1.5 py-0.5 text-[11px] font-semibold text-white">Live</span> : null}
                            {item.file.kind === "video" && !isLivePhoto ? (
                              <span className="rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">Video</span>
                            ) : null}
                          </div>
                          <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2 text-white">
                            <p className="truncate text-sm font-medium">{item.file.name}</p>
                            <p className="text-xs text-white/80">{formatBytes(item.file.sizeBytes)}</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                          <span className="truncate text-sm mp-muted">{formatDateTime(item.file.capturedAt ?? item.file.modifiedAt)}</span>
                          <span className="shrink-0 rounded-md border border-[var(--ark-line)] px-1.5 py-0.5 text-[11px] uppercase mp-muted">
                            {isLivePhoto ? "live" : item.file.kind}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {!displayItems.length ? (
                  <p className="py-5 text-center text-sm mp-muted">
                    {selectedStorage ? "该位置暂无可浏览媒体，可尝试切换筛选类型。" : "请先选择存储后再浏览媒体。"}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>
        </section>
      </div>

      {selectedStorage && activeItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-[3px]" onClick={closePreview}>
          <div
            ref={previewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={previewTitleId}
            aria-describedby={activePair ? previewHintId : undefined}
            className="w-full max-w-6xl rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-3 shadow-[0_28px_64px_rgba(2,8,23,0.45)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p id={previewTitleId} className="truncate text-base font-semibold">{activeItem.file.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <span className="mp-chip">{activeIndex + 1} / {activeList.length}</span>
                  <span className="mp-chip">{activeKindLabel}</span>
                  <span className="mp-chip">大小 {formatBytes(activeItem.file.sizeBytes)}</span>
                </div>
                {activePair ? (
                  <p id={previewHintId} className="mt-1 text-sm mp-muted">点击“播放动态”或长按画面可预览 Live Photo（快捷键：L）</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {activePair ? (
                  <button
                    type="button"
                    className={`mp-btn ${playingLiveVideo ? "mp-btn-primary" : ""}`}
                    aria-label={playingLiveVideo ? "切换到静态图像" : "播放 Live Photo 动态部分"}
                    onClick={() => setPlayingLiveVideo((prev) => !prev)}
                  >
                    {playingLiveVideo ? "查看静态" : "播放动态"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`mp-btn px-2 ${showMediaInfo ? "border-[var(--ark-primary)] text-[var(--ark-primary)]" : ""}`}
                  aria-label={showMediaInfo ? "隐藏媒体信息" : "显示媒体信息"}
                  aria-pressed={showMediaInfo}
                  onClick={() => setShowMediaInfo((prev) => !prev)}
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
                    <circle cx="10" cy="10" r="7.25" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M10 9V13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    <circle cx="10" cy="6.5" r="0.9" fill="currentColor" />
                  </svg>
                </button>
                <button ref={previewCloseButtonRef} type="button" className="mp-btn" aria-label="关闭预览" onClick={closePreview}>
                  关闭
                </button>
              </div>
            </div>

            <div
              className="relative flex h-[62vh] items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-black/85"
              onPointerDown={() => startLivePress()}
              onPointerUp={() => endLivePress()}
              onPointerLeave={() => endLivePress()}
              onPointerCancel={() => endLivePress()}
            >
              {shouldShowVideoViewer && activeViewerVideoPath ? (
                activePair ? (
                  <video
                    src={getStorageMediaStreamUrl(selectedStorage.id, activeViewerVideoPath)}
                    className="max-h-full max-w-full"
                    autoPlay
                    loop
                    playsInline
                    preload="auto"
                    onLoadedMetadata={(event) => {
                      const video = event.currentTarget;
                      upsertViewerMeta(activeViewerVideoPath, {
                        width: video.videoWidth || undefined,
                        height: video.videoHeight || undefined,
                        durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined
                      });
                    }}
                  />
                ) : (
                  <video
                    src={getStorageMediaStreamUrl(selectedStorage.id, activeViewerVideoPath)}
                    className="max-h-full max-w-full"
                    controls
                    autoPlay
                    onLoadedMetadata={(event) => {
                      const video = event.currentTarget;
                      upsertViewerMeta(activeViewerVideoPath, {
                        width: video.videoWidth || undefined,
                        height: video.videoHeight || undefined,
                        durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined
                      });
                    }}
                  />
                )
              ) : (
                activeViewerImagePath && !brokenViewerImagePaths.has(activeViewerImagePath) ? (
                  <img
                    src={getStorageMediaStreamUrl(selectedStorage.id, activeViewerImagePath)}
                    alt={activeItem.file.name}
                    className="max-h-full max-w-full object-contain"
                    onLoad={(event) => {
                      const image = event.currentTarget;
                      upsertViewerMeta(activeViewerImagePath, {
                        width: image.naturalWidth || undefined,
                        height: image.naturalHeight || undefined
                      });
                    }}
                    onError={() => {
                      setBrokenViewerImagePaths((prev) => {
                        const next = new Set(prev);
                        next.add(activeViewerImagePath);
                        return next;
                      });
                    }}
                  />
                ) : (
                  <div className="px-4 text-center text-sm text-white/80">
                    当前浏览器无法预览该图片格式
                    {activePair ? "，可点击“播放动态”查看 Live Photo 动态部分" : ""}
                  </div>
                )
              )}

              <button
                type="button"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-black/50 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-black/65 disabled:opacity-40"
                aria-label="查看上一张"
                onClick={openPrev}
                disabled={activeIndex <= 0}
              >
                上一张
              </button>
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/25 bg-black/50 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-black/65 disabled:opacity-40"
                aria-label="查看下一张"
                onClick={openNext}
                disabled={activeIndex >= activeList.length - 1}
              >
                下一张
              </button>
            </div>

            {showMediaInfo ? (
              <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] mp-muted">路径</dt>
                  <dd className="mt-1 break-all">{activeItem.file.path}</dd>
                </div>
                <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] mp-muted">类型</dt>
                  <dd className="mt-1">{activeKindLabel}</dd>
                </div>
                <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] mp-muted">文件大小</dt>
                  <dd className="mt-1">{formatBytes(activeItem.file.sizeBytes)}</dd>
                </div>
                <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] mp-muted">拍摄时间</dt>
                  <dd className="mt-1">{formatDateTime(activeItem.file.capturedAt ?? activeItem.file.modifiedAt)}</dd>
                </div>
                <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] mp-muted">文件时间</dt>
                  <dd className="mt-1">{formatDateTime(activeItem.file.modifiedAt)}</dd>
                </div>
                <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] mp-muted">分辨率</dt>
                  <dd className="mt-1">
                    {activeViewerMeta?.width && activeViewerMeta?.height
                      ? `${activeViewerMeta.width} × ${activeViewerMeta.height}`
                      : "加载后显示"}
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] mp-muted">视频时长</dt>
                  <dd className="mt-1">
                    {activeKindLabel === "视频" || shouldShowVideoViewer ? formatDuration(activeViewerMeta?.durationSeconds) : "-"}
                  </dd>
                </div>
                <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
                  <dt className="text-xs font-semibold uppercase tracking-[0.08em] mp-muted">拍摄地点</dt>
                  <dd className="mt-1">{activeLocationLabel}</dd>
                </div>
              </dl>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function MediaPage() {
  const [storages, setStorages] = useState<StorageTarget[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void getStorages().then((res) => setStorages(res.items)).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <section className="space-y-3 md:flex md:h-full md:flex-col">
      {error ? <p className="mp-error">{error}</p> : null}
      <MediaPane storages={storages} />
    </section>
  );
}
