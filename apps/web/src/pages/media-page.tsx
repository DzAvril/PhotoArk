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

function splitFileName(name: string) {
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return { base: name.toLowerCase(), ext: "" };
  return { base: name.slice(0, dotIdx).toLowerCase(), ext: name.slice(dotIdx).toLowerCase() };
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
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "video" | "live">("all");
  const [error, setError] = useState("");
  const [activePath, setActivePath] = useState<string | null>(null);
  const [playingLiveVideo, setPlayingLiveVideo] = useState(false);
  const [brokenThumbImagePaths, setBrokenThumbImagePaths] = useState<Set<string>>(new Set());
  const [brokenViewerImagePaths, setBrokenViewerImagePaths] = useState<Set<string>>(new Set());
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
    setError("");
    if (selectedStorage.type === "cloud_115") {
      setError("当前版本暂不支持直接浏览 115 存储媒体");
      return;
    }
    try {
      setMedia(await browseStorageMedia(selectedStorage.id, selectedStorage.basePath));
      setActivePath(null);
      setPlayingLiveVideo(false);
      setBrokenThumbImagePaths(new Set());
      setBrokenViewerImagePaths(new Set());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (!selectedStorage) {
      setMedia(null);
      setActivePath(null);
      setPlayingLiveVideo(false);
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
    }
    setActivePath(nextPath);
    setPlayingLiveVideo(false);
  }
  function closePreview() {
    setActivePath(null);
    setPlayingLiveVideo(false);
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

  return (
    <article className="mp-panel flex min-h-[calc(100vh-12rem)] flex-col p-4">
      <h3 className="text-base font-semibold">存储媒体</h3>
      {error ? <p className="mp-error mt-2">{error}</p> : null}

      <div className="mt-3 space-y-2">
        <label htmlFor="media-storage-select" className="block text-sm font-medium">
          选择存储
        </label>
        <select
          id="media-storage-select"
          className="mp-select"
          value={storageId}
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

      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-lg border border-[var(--ark-line)] p-2">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-1 text-sm">
            <button type="button" className={`mp-btn ${kindFilter === "all" ? "mp-btn-primary" : ""}`} onClick={() => setKindFilter("all")}>全部</button>
            <button type="button" className={`mp-btn ${kindFilter === "image" ? "mp-btn-primary" : ""}`} onClick={() => setKindFilter("image")}>图片</button>
            <button type="button" className={`mp-btn ${kindFilter === "video" ? "mp-btn-primary" : ""}`} onClick={() => setKindFilter("video")}>视频</button>
            <button type="button" className={`mp-btn ${kindFilter === "live" ? "mp-btn-primary" : ""}`} onClick={() => setKindFilter("live")}>Live</button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-sm mp-muted">{displayItems.length} 项</span>
            <label htmlFor="media-zoom" className="text-xs mp-muted">缩放</label>
            <input
              id="media-zoom"
              type="range"
              min={110}
              max={260}
              step={10}
              value={normalizedThumbSize}
              onChange={(e) => setThumbSize(Number(e.target.value))}
              className="h-2 w-28 cursor-pointer accent-[var(--ark-primary)]"
            />
            <button type="button" className="mp-btn px-2" onClick={() => setThumbSize(140)}>紧凑</button>
            <button type="button" className="mp-btn px-2" onClick={() => setThumbSize(210)}>放大</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid gap-2" style={mediaGridStyle}>
          {selectedStorage && displayItems.map((item) => {
            const streamUrl = getStorageMediaStreamUrl(selectedStorage.id, item.file.path);
            const isLivePhoto = Boolean(item.livePair);
            const thumbBroken = brokenThumbImagePaths.has(item.file.path);
            return (
              <button key={item.key} type="button" className="overflow-hidden rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] text-left" onClick={() => openByPath(item.file.path)}>
                <div className="relative aspect-square bg-black/10">
                  {item.file.kind === "image" ? (
                    thumbBroken ? (
                      <div className="flex h-full w-full items-center justify-center px-3 text-center text-sm text-white/80">图片预览不可用</div>
                    ) : (
                      <img
                        src={streamUrl}
                        alt={item.file.name}
                        className="h-full w-full object-cover"
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
                  ) : (
                    <video src={streamUrl} className="h-full w-full object-cover" preload="metadata" />
                  )}
                  {isLivePhoto ? <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white">Live</span> : null}
                </div>
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate text-sm">{item.file.name}</span>
                  <span className="shrink-0 rounded border border-[var(--ark-line)] px-1.5 py-0.5 text-[11px] uppercase">{isLivePhoto ? "live" : item.file.kind}</span>
                </div>
              </button>
            );
          })}
          </div>

          {!displayItems.length ? (
            <p className="py-4 text-center text-sm mp-muted">
              {selectedStorage ? "该位置暂无可浏览媒体，可尝试切换筛选类型。" : "请先选择存储后再浏览媒体。"}
            </p>
          ) : null}
        </div>
      </div>

      {selectedStorage && activeItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3" onClick={closePreview}>
          <div
            ref={previewDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={previewTitleId}
            aria-describedby={activePair ? previewHintId : undefined}
            className="w-full max-w-5xl rounded-xl bg-[var(--ark-surface)] p-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p id={previewTitleId} className="truncate text-sm font-medium">{activeItem.file.name}</p>
                <p className="text-sm mp-muted">{activeIndex + 1} / {activeList.length}</p>
                {activePair ? (
                  <p id={previewHintId} className="text-sm mp-muted">点击“播放动态”或长按画面可预览 Live Photo（快捷键：L）</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
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
                <button ref={previewCloseButtonRef} type="button" className="mp-btn" aria-label="关闭预览" onClick={closePreview}>
                  关闭
                </button>
              </div>
            </div>

            <div
              className="relative flex h-[62vh] items-center justify-center overflow-hidden rounded-lg bg-black/80"
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
                  />
                ) : (
                  <video src={getStorageMediaStreamUrl(selectedStorage.id, activeViewerVideoPath)} className="max-h-full max-w-full" controls autoPlay />
                )
              ) : (
                activeViewerImagePath && !brokenViewerImagePaths.has(activeViewerImagePath) ? (
                  <img
                    src={getStorageMediaStreamUrl(selectedStorage.id, activeViewerImagePath)}
                    alt={activeItem.file.name}
                    className="max-h-full max-w-full object-contain"
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
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-base text-white"
                aria-label="查看上一张"
                onClick={openPrev}
                disabled={activeIndex <= 0}
              >
                上一张
              </button>
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-base text-white"
                aria-label="查看下一张"
                onClick={openNext}
                disabled={activeIndex >= activeList.length - 1}
              >
                下一张
              </button>
            </div>
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
    <section className="space-y-3">
      {error ? <p className="mp-error">{error}</p> : null}
      <MediaPane storages={storages} />
    </section>
  );
}
