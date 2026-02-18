import { useEffect, useMemo, useState } from "react";
import { browseStorageDirectories, browseStorageMedia, getStorageMediaStreamUrl, getStorages } from "../lib/api";
import type { DirectoryBrowseResult, MediaBrowseResult, StorageTarget } from "../types/api";

interface MediaPaneProps {
  title: string;
  storages: StorageTarget[];
}

function MediaPane({ title, storages }: MediaPaneProps) {
  const [storageId, setStorageId] = useState("");
  const [path, setPath] = useState("");
  const [dirs, setDirs] = useState<DirectoryBrowseResult | null>(null);
  const [media, setMedia] = useState<MediaBrowseResult | null>(null);
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "video">("all");
  const [error, setError] = useState("");

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
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const filteredFiles = useMemo(() => {
    const files = media?.files ?? [];
    if (kindFilter === "all") return files;
    return files.filter((f) => f.kind === kindFilter);
  }, [media?.files, kindFilter]);

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

      <div className="mt-3 max-h-72 overflow-auto rounded-lg border border-[var(--ark-line)] p-2">
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
          {selectedStorage && filteredFiles.map((f) => {
            const streamUrl = getStorageMediaStreamUrl(selectedStorage.id, f.path);
            return (
              <div key={f.path} className="overflow-hidden rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)]">
                <div className="aspect-square bg-black/10">
                  {f.kind === "image" ? (
                    <img src={streamUrl} alt={f.name} className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <video src={streamUrl} className="h-full w-full object-cover" controls preload="metadata" />
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                  <span className="truncate text-xs">{f.name}</span>
                  <span className="shrink-0 rounded border border-[var(--ark-line)] px-1 py-0.5 text-[10px] uppercase">
                    {f.kind}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {!filteredFiles.length ? <p className="py-4 text-center text-xs mp-muted">暂无数据</p> : null}
      </div>
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
