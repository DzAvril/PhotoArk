import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Info, X } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { getStorageMediaStreamUrl } from "../../lib/api";
import type { StorageTarget } from "../../types/api";
import type { DisplayMediaItem, LivePhotoPair, ViewerRuntimeMeta } from "./media-types";
import { formatBytes, formatDateTime, formatDuration } from "./media-utils";

const LAZY_LOAD_DELAY_MS = 100;

type MediaPreviewDialogProps = {
  open: boolean;
  selectedStorage: StorageTarget;
  activeItem: DisplayMediaItem;
  activePair: LivePhotoPair | null;
  activeIndex: number;
  activeCount: number;
  playingLiveVideo: boolean;
  showMediaInfo: boolean;
  viewerMetaByPath: Record<string, ViewerRuntimeMeta>;
  brokenViewerImagePaths: Set<string>;
  dialogRef: React.RefObject<HTMLDivElement | null>;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleLive: () => void;
  onToggleInfo: () => void;
  onViewerImageError: (path: string) => void;
  onMetaUpdate: (path: string, next: ViewerRuntimeMeta) => void;
  pointerHandlers: {
    onPointerDown: () => void;
    onPointerUp: () => void;
    onPointerLeave: () => void;
    onPointerCancel: () => void;
  };
};

export function MediaPreviewDialog(props: MediaPreviewDialogProps) {
  const {
    open,
    selectedStorage,
    activeItem,
    activePair,
    activeIndex,
    activeCount,
    playingLiveVideo,
    showMediaInfo,
    viewerMetaByPath,
    brokenViewerImagePaths,
    dialogRef,
    closeButtonRef,
    onClose,
    onPrev,
    onNext,
    onToggleLive,
    onToggleInfo,
    onViewerImageError,
    onMetaUpdate,
    pointerHandlers
  } = props;

  const previewTitleId = useId();
  const previewHintId = useId();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (!open) {
      setIsVisible(false);
      setShouldLoad(false);
      return;
    }
    setIsVisible(true);
    const timer = setTimeout(() => setShouldLoad(true), LAZY_LOAD_DELAY_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.src = "";
      videoRef.current.load();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const container = containerRef.current;
    if (!container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting && videoRef.current) {
            videoRef.current.pause();
          }
        });
      },
      { threshold: 0.1 }
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, [open]);

  if (!open) return null;

  const activeViewerImagePath = activePair ? activePair.image.path : activeItem.file.path;
  const activeViewerVideoPath = activePair
    ? activePair.video.path
    : activeItem.file.kind === "video"
      ? activeItem.file.path
      : null;
  const shouldShowVideoViewer = Boolean(activeViewerVideoPath && (playingLiveVideo || activeItem.file.kind === "video"));
  const activeViewerPath = shouldShowVideoViewer ? activeViewerVideoPath : activeViewerImagePath;
  const activeViewerMeta = activeViewerPath ? viewerMetaByPath[activeViewerPath] : undefined;
  const activeKindLabel = activePair ? "Live Photo" : activeItem.file.kind === "video" ? "视频" : "图片";
  const activeLatitude = activeItem.file.latitude;
  const activeLongitude = activeItem.file.longitude;
  const activeLocationLabel =
    activeLatitude !== null && activeLatitude !== undefined && activeLongitude !== null && activeLongitude !== undefined
      ? `${activeLatitude.toFixed(6)}, ${activeLongitude.toFixed(6)}`
      : "未读取到位置信息";

  return (
    <div
      className="mp-overlay fixed inset-0 z-50 flex items-center justify-center p-0 backdrop-blur-[3px] md:p-3"
      onClick={onClose}
    >
      <Card
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={previewTitleId}
        aria-describedby={activePair ? previewHintId : undefined}
        className="flex h-[100dvh] w-full flex-col rounded-none p-3 md:h-auto md:max-h-[92vh] md:max-w-6xl md:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex shrink-0 flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p id={previewTitleId} className="truncate text-base font-semibold">
              {activeItem.file.name}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
              <span className="mp-chip">
                {activeIndex + 1} / {activeCount}
              </span>
              <span className="mp-chip">{activeKindLabel}</span>
              <span className="mp-chip">大小 {formatBytes(activeItem.file.sizeBytes)}</span>
            </div>
            {activePair ? (
              <p id={previewHintId} className="mt-1 text-sm mp-muted">
                点击“播放动态”或长按画面可预览 Live Photo（快捷键：L）
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {activePair ? (
              <Button
                size="sm"
                variant={playingLiveVideo ? "primary" : "default"}
                aria-label={playingLiveVideo ? "切换到静态图像" : "播放 Live Photo 动态部分"}
                onClick={onToggleLive}
              >
                {playingLiveVideo ? "查看静态" : "播放动态"}
              </Button>
            ) : null}
            <Button
              size="sm"
              className={`px-2 ${showMediaInfo ? "border-[var(--ark-primary)] text-[var(--ark-primary)]" : ""}`}
              aria-label={showMediaInfo ? "隐藏媒体信息" : "显示媒体信息"}
              aria-pressed={showMediaInfo}
              onClick={onToggleInfo}
            >
              <Info className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              ref={closeButtonRef}
              size="sm"
              aria-label="关闭预览"
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
              关闭
            </Button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <div
            ref={containerRef}
            className="relative flex h-full min-h-[50vh] items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-black/85 md:h-[62vh]"
            onPointerDown={pointerHandlers.onPointerDown}
            onPointerUp={pointerHandlers.onPointerUp}
            onPointerLeave={pointerHandlers.onPointerLeave}
            onPointerCancel={pointerHandlers.onPointerCancel}
          >
            {shouldLoad && shouldShowVideoViewer && activeViewerVideoPath ? (
              activePair ? (
                <video
                  ref={videoRef}
                  src={getStorageMediaStreamUrl(selectedStorage.id, activeViewerVideoPath)}
                  className="max-h-full max-w-full"
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    onMetaUpdate(activeViewerVideoPath, {
                      width: video.videoWidth || undefined,
                      height: video.videoHeight || undefined,
                      durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined
                    });
                  }}
                />
              ) : (
                <video
                  ref={videoRef}
                  src={getStorageMediaStreamUrl(selectedStorage.id, activeViewerVideoPath)}
                  className="max-h-full max-w-full"
                  controls
                  autoPlay
                  onLoadedMetadata={(event) => {
                    const video = event.currentTarget;
                    onMetaUpdate(activeViewerVideoPath, {
                      width: video.videoWidth || undefined,
                      height: video.videoHeight || undefined,
                      durationSeconds: Number.isFinite(video.duration) ? video.duration : undefined
                    });
                  }}
                />
              )
            ) : shouldLoad && activeViewerImagePath && !brokenViewerImagePaths.has(activeViewerImagePath) ? (
              <img
                src={getStorageMediaStreamUrl(selectedStorage.id, activeViewerImagePath)}
                alt={activeItem.file.name}
                className="max-h-full max-w-full object-contain"
                onLoad={(event) => {
                  const image = event.currentTarget;
                  onMetaUpdate(activeViewerImagePath, {
                    width: image.naturalWidth || undefined,
                    height: image.naturalHeight || undefined
                  });
                }}
                onError={() => onViewerImageError(activeViewerImagePath)}
              />
            ) : shouldLoad ? (
              <div className="px-4 text-center text-sm text-white/80">
                当前浏览器无法预览该图片格式{activePair ? "，可点击“播放动态”查看 Live Photo 动态部分" : ""}
              </div>
            ) : (
              <div className="px-4 text-center text-sm text-white/60">加载中...</div>
            )}

            <button
              type="button"
              className="absolute left-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/25 bg-black/50 text-white transition hover:bg-black/65 disabled:opacity-40"
              aria-label="查看上一张"
              onClick={onPrev}
              disabled={activeIndex <= 0}
            >
              <ChevronLeft className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="absolute right-2 top-1/2 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg border border-white/25 bg-black/50 text-white transition hover:bg-black/65 disabled:opacity-40"
              aria-label="查看下一张"
              onClick={onNext}
              disabled={activeIndex >= activeCount - 1}
            >
              <ChevronRight className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {showMediaInfo ? (
          <dl className="mt-3 grid max-h-[28vh] shrink-0 gap-2 overflow-auto pr-1 text-sm md:grid-cols-2">
            <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
              <dt className="mp-kicker">路径</dt>
              <dd className="mt-1 break-all">{activeItem.file.path}</dd>
            </div>
            <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
              <dt className="mp-kicker">类型</dt>
              <dd className="mt-1">{activeKindLabel}</dd>
            </div>
            <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
              <dt className="mp-kicker">文件大小</dt>
              <dd className="mt-1">{formatBytes(activeItem.file.sizeBytes)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
              <dt className="mp-kicker">拍摄时间</dt>
              <dd className="mt-1">{formatDateTime(activeItem.file.capturedAt ?? activeItem.file.modifiedAt)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
              <dt className="mp-kicker">文件时间</dt>
              <dd className="mt-1">{formatDateTime(activeItem.file.modifiedAt)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
              <dt className="mp-kicker">分辨率</dt>
              <dd className="mt-1">
                {activeViewerMeta?.width && activeViewerMeta?.height
                  ? `${activeViewerMeta.width} × ${activeViewerMeta.height}`
                  : "加载后显示"}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
              <dt className="mp-kicker">视频时长</dt>
              <dd className="mt-1">
                {activeKindLabel === "视频" || shouldShowVideoViewer
                  ? formatDuration(activeViewerMeta?.durationSeconds)
                  : "-"}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2.5">
              <dt className="mp-kicker">拍摄地点</dt>
              <dd className="mt-1">{activeLocationLabel}</dd>
            </div>
          </dl>
        ) : null}
      </Card>
    </div>
  );
}
