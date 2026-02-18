import { useEffect, useMemo, useState } from "react";
import { browseStorageMedia, getStorageMediaStreamUrl, getStorages } from "../lib/api";
import type { MediaBrowseResult, MediaFileItem, StorageTarget } from "../types/api";

interface MediaPaneProps {
  title: string;
  storages: StorageTarget[];
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".m4v", ".avi", ".mkv", ".webm"]);

type LivePhotoPair = {
  image: MediaFileItem;
  video: MediaFileItem;
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

function MediaPane({ title, storages }: MediaPaneProps) {
  const [storageId, setStorageId] = useState("");
  const [media, setMedia] = useState<MediaBrowseResult | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "video">("all");
  const [error, setError] = useState("");
  const [activePath, setActivePath] = useState<string | null>(null);

  const selectedStorage = storages.find((s) => s.id === storageId);

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
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    if (!selectedStorage) {
      setMedia(null);
      setActivePath(null);
      return;
    }
    void previewMedia();
  }, [selectedStorage?.id]);

  const allFiles = media?.files ?? [];
  const filteredFiles = useMemo(() => (kindFilter === "all" ? allFiles : allFiles.filter((f) => f.kind === kindFilter)), [allFiles, kindFilter]);
  const livePhotoPairByPath = useMemo(() => detectLivePhotoPairs(media), [media]);
  const activeFile = useMemo(() => allFiles.find((f) => f.path === activePath) ?? null, [allFiles, activePath]);
  const activePair = activeFile ? livePhotoPairByPath.get(activeFile.path) ?? null : null;

  const activeList = useMemo(() => {
    if (!activeFile) return filteredFiles;
    return filteredFiles.some((f) => f.path === activeFile.path) ? filteredFiles : allFiles;
  }, [activeFile, filteredFiles, allFiles]);
  const activeIndex = activeFile ? activeList.findIndex((f) => f.path === activeFile.path) : -1;

  function openByPath(nextPath: string) {
    setActivePath(nextPath);
  }
  function openPrev() {
    if (activeIndex <= 0) return;
    openByPath(activeList[activeIndex - 1].path);
  }
  function openNext() {
    if (activeIndex < 0 || activeIndex >= activeList.length - 1) return;
    openByPath(activeList[activeIndex + 1].path);
  }

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (!activeFile) return;
      if (e.key === "Escape") setActivePath(null);
      if (e.key === "ArrowLeft") openPrev();
      if (e.key === "ArrowRight") openNext();
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [activeFile, activeIndex, activeList]);

  const activeCounterpartPath = activePair && activeFile ? (activeFile.kind === "image" ? activePair.video.path : activePair.image.path) : null;

  return (
    <article className="mp-panel p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {error ? <p className="mp-error mt-2">{error}</p> : null}

      <div className="mt-3 space-y-2">
        <select
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

        <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2 text-xs">
          <div className="mp-muted">当前读取路径（来自存储配置）</div>
          <div className="mt-1 break-all">{selectedStorage?.basePath || "请先选择存储"}</div>
        </div>
      </div>

      <div className="mt-3 max-h-[28rem] overflow-auto rounded-lg border border-[var(--ark-line)] p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex gap-1 text-xs">
            <button type="button" className={`mp-btn ${kindFilter === "all" ? "mp-btn-primary" : ""}`} onClick={() => setKindFilter("all")}>全部</button>
            <button type="button" className={`mp-btn ${kindFilter === "image" ? "mp-btn-primary" : ""}`} onClick={() => setKindFilter("image")}>图片</button>
            <button type="button" className={`mp-btn ${kindFilter === "video" ? "mp-btn-primary" : ""}`} onClick={() => setKindFilter("video")}>视频</button>
          </div>
          <span className="text-xs mp-muted">{filteredFiles.length} 项</span>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {selectedStorage && filteredFiles.map((f) => {
            const streamUrl = getStorageMediaStreamUrl(selectedStorage.id, f.path);
            const isLivePhoto = livePhotoPairByPath.has(f.path);
            return (
              <button key={f.path} type="button" className="overflow-hidden rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] text-left" onClick={() => openByPath(f.path)}>
                <div className="relative aspect-square bg-black/10">
                  {f.kind === "image" ? <img src={streamUrl} alt={f.name} className="h-full w-full object-cover" loading="lazy" /> : <video src={streamUrl} className="h-full w-full object-cover" preload="metadata" />}
                  {isLivePhoto ? <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Live</span> : null}
                </div>
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate text-xs">{f.name}</span>
                  <span className="shrink-0 rounded border border-[var(--ark-line)] px-1 py-0.5 text-[10px] uppercase">{f.kind}</span>
                </div>
              </button>
            );
          })}
        </div>

        {!filteredFiles.length ? <p className="py-4 text-center text-xs mp-muted">暂无数据</p> : null}
      </div>

      {selectedStorage && activeFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3" onClick={() => setActivePath(null)}>
          <div className="w-full max-w-5xl rounded-xl bg-[var(--ark-surface)] p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{activeFile.name}</p>
                <p className="text-xs mp-muted">{activeIndex + 1} / {activeList.length}</p>
              </div>
              <div className="flex items-center gap-2">
                {activeCounterpartPath ? <button type="button" className="mp-btn mp-btn-primary" onClick={() => openByPath(activeCounterpartPath)}>切换到{activeFile.kind === "image" ? "实况视频" : "实况照片"}</button> : null}
                <button type="button" className="mp-btn" onClick={() => setActivePath(null)}>关闭</button>
              </div>
            </div>

            <div className="relative flex h-[62vh] items-center justify-center overflow-hidden rounded-lg bg-black/80">
              {activeFile.kind === "image" ? (
                <img src={getStorageMediaStreamUrl(selectedStorage.id, activeFile.path)} alt={activeFile.name} className="max-h-full max-w-full object-contain" />
              ) : (
                <video src={getStorageMediaStreamUrl(selectedStorage.id, activeFile.path)} className="max-h-full max-w-full" controls autoPlay />
              )}

              <button type="button" className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-sm text-white" onClick={openPrev} disabled={activeIndex <= 0}>上一张</button>
              <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-sm text-white" onClick={openNext} disabled={activeIndex >= activeList.length - 1}>下一张</button>
            </div>

            {activePair ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button type="button" className="overflow-hidden rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] text-left" onClick={() => openByPath(activePair.image.path)}>
                  <div className="aspect-video bg-black/10">
                    <img src={getStorageMediaStreamUrl(selectedStorage.id, activePair.image.path)} alt={activePair.image.name} className="h-full w-full object-cover" />
                  </div>
                  <p className="truncate px-2 py-1 text-xs">照片: {activePair.image.name}</p>
                </button>
                <button type="button" className="overflow-hidden rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] text-left" onClick={() => openByPath(activePair.video.path)}>
                  <div className="aspect-video bg-black/10">
                    <video src={getStorageMediaStreamUrl(selectedStorage.id, activePair.video.path)} className="h-full w-full object-cover" muted loop autoPlay playsInline />
                  </div>
                  <p className="truncate px-2 py-1 text-xs">视频: {activePair.video.name}</p>
                </button>
              </div>
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
    <section className="space-y-3">
      <div className="mp-panel p-4">
        <h2 className="mp-section-title">媒体预览</h2>
        <p className="mt-1 text-xs mp-muted">只能从存储页面已配置的基础路径读取媒体，不再单独配置路径</p>
        {error ? <p className="mp-error mt-2">{error}</p> : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <MediaPane title="备份源路径预览" storages={storages} />
        <MediaPane title="备份目标路径预览" storages={storages} />
      </div>
    </section>
  );
}
