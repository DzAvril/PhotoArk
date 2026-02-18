import { useEffect, useMemo, useState } from "react";
import { browseStorageDirectories, browseStorageMedia, getStorageMediaStreamUrl, getStorages } from "../lib/api";
import type { DirectoryBrowseResult, MediaBrowseResult, StorageTarget } from "../types/api";

interface MediaPaneProps {
  title: string;
  storages: StorageTarget[];
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".m4v", ".avi", ".mkv", ".webm"]);

function splitFileName(name: string) {
  const dotIdx = name.lastIndexOf(".");
  if (dotIdx <= 0) return { base: name.toLowerCase(), ext: "" };
  return {
    base: name.slice(0, dotIdx).toLowerCase(),
    ext: name.slice(dotIdx).toLowerCase()
  };
}

function detectLivePhotoNames(media: MediaBrowseResult | null) {
  const files = media?.files ?? [];
  const groups = new Map<string, { image: boolean; video: boolean; names: string[] }>();

  for (const file of files) {
    const { base, ext } = splitFileName(file.name);
    const row = groups.get(base) ?? { image: false, video: false, names: [] };
    if (IMAGE_EXTENSIONS.has(ext)) row.image = true;
    if (VIDEO_EXTENSIONS.has(ext)) row.video = true;
    row.names.push(file.name);
    groups.set(base, row);
  }

  const names = new Set<string>();
  for (const value of groups.values()) {
    if (value.image && value.video) {
      value.names.forEach((n) => names.add(n));
    }
  }
  return names;
}

function MediaPane({ title, storages }: MediaPaneProps) {
  const [storageId, setStorageId] = useState("");
  const [path, setPath] = useState("");
  const [dirs, setDirs] = useState<DirectoryBrowseResult | null>(null);
  const [media, setMedia] = useState<MediaBrowseResult | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "video">("all");
  const [error, setError] = useState("");
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const selectedStorage = storages.find((s) => s.id === storageId);

  useEffect(() => {
    if (!selectedStorage || selectedStorage.type === "cloud_115") {
      setDirs(null);
      return;
    }
    void browseStorageDirectories(selectedStorage.id)
      .then((res) => {
        setDirs(res);
        setPath(res.currentPath);
      })
      .catch((err: Error) => setError(err.message));
  }, [selectedStorage?.id]);

  async function loadDirs(nextPath?: string) {
    if (!selectedStorage || selectedStorage.type === "cloud_115") return;
    try {
      const res = await browseStorageDirectories(selectedStorage.id, nextPath);
      setDirs(res);
      setPath(res.currentPath);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function previewMedia() {
    if (!selectedStorage || !path) return;
    setError("");
    try {
      setMedia(await browseStorageMedia(selectedStorage.id, path));
      setActiveIndex(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const filteredFiles = useMemo(() => {
    const files = media?.files ?? [];
    if (kindFilter === "all") return files;
    return files.filter((f) => f.kind === kindFilter);
  }, [media?.files, kindFilter]);

  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (activeIndex === null) return;
      if (e.key === "Escape") setActiveIndex(null);
      if (e.key === "ArrowLeft") setActiveIndex((idx) => (idx === null ? idx : Math.max(0, idx - 1)));
      if (e.key === "ArrowRight") {
        setActiveIndex((idx) => (idx === null ? idx : Math.min(filteredFiles.length - 1, idx + 1)));
      }
    }

    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [activeIndex, filteredFiles.length]);

  const livePhotoNames = useMemo(() => detectLivePhotoNames(media), [media]);
  const activeFile = activeIndex === null ? null : filteredFiles[activeIndex] ?? null;
  const currentIndex = activeIndex ?? 0;

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
            setPath("");
            setDirs(null);
            setMedia(null);
            setError("");
            setActiveIndex(null);
          }}
        >
          <option value="">选择存储</option>
          {storages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.type})
            </option>
          ))}
        </select>

        <input
          className="mp-input"
          placeholder="输入要预览的路径"
          value={path}
          onChange={(e) => setPath(e.target.value)}
        />

        {selectedStorage && selectedStorage.type !== "cloud_115" ? (
          <div className="grid grid-cols-[auto_auto_1fr] gap-2">
            <button type="button" className="mp-btn" onClick={() => void loadDirs(dirs?.parentPath ?? undefined)}>
              上级
            </button>
            <button type="button" className="mp-btn" onClick={() => void loadDirs(path)}>
              读取
            </button>
            <select className="mp-select" value={path} onChange={(e) => setPath(e.target.value)}>
              <option value="">选择目录</option>
              {dirs?.directories.map((d) => (
                <option key={d.path} value={d.path}>
                  {d.path}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <button type="button" className="mp-btn mp-btn-primary" onClick={() => void previewMedia()}>
          查看图片/视频
        </button>
      </div>

      <div className="mt-3 max-h-[28rem] overflow-auto rounded-lg border border-[var(--ark-line)] p-2">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex gap-1 text-xs">
            <button type="button" className={`mp-btn ${kindFilter === "all" ? "mp-btn-primary" : ""}`} onClick={() => setKindFilter("all")}>
              全部
            </button>
            <button type="button" className={`mp-btn ${kindFilter === "image" ? "mp-btn-primary" : ""}`} onClick={() => setKindFilter("image")}>
              图片
            </button>
            <button type="button" className={`mp-btn ${kindFilter === "video" ? "mp-btn-primary" : ""}`} onClick={() => setKindFilter("video")}>
              视频
            </button>
          </div>
          <span className="text-xs mp-muted">{filteredFiles.length} 项</span>
        </div>

        <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
          {selectedStorage && filteredFiles.map((f, idx) => {
            const streamUrl = getStorageMediaStreamUrl(selectedStorage.id, f.path);
            const isLivePhoto = livePhotoNames.has(f.name);
            return (
              <button
                key={f.path}
                type="button"
                className="overflow-hidden rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] text-left"
                onClick={() => setActiveIndex(idx)}
              >
                <div className="relative aspect-square bg-black/10">
                  {f.kind === "image" ? (
                    <img src={streamUrl} alt={f.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <video src={streamUrl} className="h-full w-full object-cover" preload="metadata" />
                  )}
                  {isLivePhoto ? (
                    <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white">Live</span>
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate text-xs">{f.name}</span>
                  <span className="shrink-0 rounded border border-[var(--ark-line)] px-1 py-0.5 text-[10px] uppercase">
                    {f.kind}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {!filteredFiles.length ? <p className="py-4 text-center text-xs mp-muted">暂无数据</p> : null}
      </div>

      {selectedStorage && activeFile ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3" onClick={() => setActiveIndex(null)}>
          <div className="w-full max-w-5xl rounded-xl bg-[var(--ark-surface)] p-3" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{activeFile.name}</p>
                <p className="text-xs mp-muted">{currentIndex + 1} / {filteredFiles.length}</p>
              </div>
              <button type="button" className="mp-btn" onClick={() => setActiveIndex(null)}>关闭</button>
            </div>

            <div className="relative flex h-[70vh] items-center justify-center overflow-hidden rounded-lg bg-black/80">
              {activeFile.kind === "image" ? (
                <img
                  src={getStorageMediaStreamUrl(selectedStorage.id, activeFile.path)}
                  alt={activeFile.name}
                  className="max-h-full max-w-full object-contain"
                />
              ) : (
                <video
                  src={getStorageMediaStreamUrl(selectedStorage.id, activeFile.path)}
                  className="max-h-full max-w-full"
                  controls
                  autoPlay
                />
              )}

              <button
                type="button"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-sm text-white"
                onClick={() => setActiveIndex((idx) => (idx === null ? idx : Math.max(0, idx - 1)))}
                disabled={currentIndex <= 0}
              >
                上一张
              </button>
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 px-3 py-1.5 text-sm text-white"
                onClick={() => setActiveIndex((idx) => (idx === null ? idx : Math.min(filteredFiles.length - 1, idx + 1)))}
                disabled={currentIndex >= filteredFiles.length - 1}
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
    void getStorages()
      .then((res) => setStorages(res.items))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <section className="space-y-3">
      <div className="mp-panel p-4">
        <h2 className="mp-section-title">媒体预览</h2>
        <p className="mt-1 text-xs mp-muted">在独立页面分别查看备份源和备份目标路径下的图片/视频</p>
        {error ? <p className="mp-error mt-2">{error}</p> : null}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <MediaPane title="备份源路径" storages={storages} />
        <MediaPane title="备份目标路径" storages={storages} />
      </div>
    </section>
  );
}
