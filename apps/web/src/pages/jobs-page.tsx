import { useEffect, useMemo, useState, type FormEvent } from "react";
import { browseStorageDirectories, browseStorageMedia, createJob, getJobs, getStorages } from "../lib/api";
import type { BackupJob, DirectoryBrowseResult, MediaBrowseResult, StorageTarget } from "../types/api";

const initialForm: Omit<BackupJob, "id"> = {
  name: "",
  sourceTargetId: "",
  sourcePath: "",
  destinationTargetId: "",
  destinationPath: "",
  schedule: "0 2 * * *",
  watchMode: false,
  enabled: true
};

export function JobsPage() {
  const [items, setItems] = useState<BackupJob[]>([]);
  const [storages, setStorages] = useState<StorageTarget[]>([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [sourceDirs, setSourceDirs] = useState<DirectoryBrowseResult | null>(null);
  const [targetDirs, setTargetDirs] = useState<DirectoryBrowseResult | null>(null);
  const [sourceMedia, setSourceMedia] = useState<MediaBrowseResult | null>(null);
  const [targetMedia, setTargetMedia] = useState<MediaBrowseResult | null>(null);

  const sourceStorage = useMemo(() => storages.find((s) => s.id === form.sourceTargetId), [storages, form.sourceTargetId]);
  const targetStorage = useMemo(() => storages.find((s) => s.id === form.destinationTargetId), [storages, form.destinationTargetId]);

  async function load() {
    try {
      const [jobsRes, storagesRes] = await Promise.all([getJobs(), getStorages()]);
      setItems(jobsRes.items);
      setStorages(storagesRes.items);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!sourceStorage || sourceStorage.type === "cloud_115") {
      setSourceDirs(null);
      return;
    }
    void browseStorageDirectories(sourceStorage.id)
      .then((res) => {
        setSourceDirs(res);
        if (!form.sourcePath) setForm((prev) => ({ ...prev, sourcePath: res.currentPath }));
      })
      .catch((err: Error) => setError(err.message));
  }, [sourceStorage?.id]);

  useEffect(() => {
    if (!targetStorage || targetStorage.type === "cloud_115") {
      setTargetDirs(null);
      return;
    }
    void browseStorageDirectories(targetStorage.id)
      .then((res) => {
        setTargetDirs(res);
        if (!form.destinationPath) setForm((prev) => ({ ...prev, destinationPath: res.currentPath }));
      })
      .catch((err: Error) => setError(err.message));
  }, [targetStorage?.id]);

  async function loadSourceDirs(path?: string) {
    if (!sourceStorage) return;
    try {
      const res = await browseStorageDirectories(sourceStorage.id, path);
      setSourceDirs(res);
      setForm((prev) => ({ ...prev, sourcePath: res.currentPath }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadTargetDirs(path?: string) {
    if (!targetStorage) return;
    try {
      const res = await browseStorageDirectories(targetStorage.id, path);
      setTargetDirs(res);
      setForm((prev) => ({ ...prev, destinationPath: res.currentPath }));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createJob(form);
      setForm(initialForm);
      setSourceMedia(null);
      setTargetMedia(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleViewSourceMedia() {
    if (!sourceStorage || !form.sourcePath) return;
    try {
      setSourceMedia(await browseStorageMedia(sourceStorage.id, form.sourcePath));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleViewTargetMedia() {
    if (!targetStorage || !form.destinationPath) return;
    try {
      setTargetMedia(await browseStorageMedia(targetStorage.id, form.destinationPath));
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="space-y-3">
      <div className="mp-panel p-4">
        <h2 className="mp-section-title">备份任务</h2>
        <p className="mt-1 text-xs mp-muted">配置备份源/目标地址，并分别查看两侧路径下的图片视频</p>
        {error ? <p className="mp-error mt-3">{error}</p> : null}

        <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className="mp-input sm:col-span-2" placeholder="任务名称" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />

          <select className="mp-select" value={form.sourceTargetId} onChange={(e) => setForm((p) => ({ ...p, sourceTargetId: e.target.value, sourcePath: "" }))} required>
            <option value="">选择备份源存储</option>
            {storages.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
            ))}
          </select>

          <select className="mp-select" value={form.destinationTargetId} onChange={(e) => setForm((p) => ({ ...p, destinationTargetId: e.target.value, destinationPath: "" }))} required>
            <option value="">选择备份目标存储</option>
            {storages.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
            ))}
          </select>

          <div className="mp-panel p-3 sm:col-span-2">
            <p className="mb-2 text-xs mp-muted">备份源路径</p>
            <input className="mp-input" placeholder="源路径" value={form.sourcePath} onChange={(e) => setForm((p) => ({ ...p, sourcePath: e.target.value }))} required />
            {sourceStorage && sourceStorage.type !== "cloud_115" ? (
              <div className="mt-2 grid grid-cols-[auto_auto_1fr] gap-2">
                <button type="button" className="mp-btn" onClick={() => void loadSourceDirs(sourceDirs?.parentPath ?? undefined)}>上级</button>
                <button type="button" className="mp-btn" onClick={() => void loadSourceDirs(form.sourcePath)}>读取</button>
                <select className="mp-select" value={form.sourcePath} onChange={(e) => setForm((p) => ({ ...p, sourcePath: e.target.value }))}>
                  <option value="">选择目录</option>
                  {sourceDirs?.directories.map((d) => <option key={d.path} value={d.path}>{d.path}</option>)}
                </select>
              </div>
            ) : null}
            <button type="button" className="mp-btn mt-2" onClick={() => void handleViewSourceMedia()}>查看源路径图片/视频</button>
          </div>

          <div className="mp-panel p-3 sm:col-span-2">
            <p className="mb-2 text-xs mp-muted">备份目标路径</p>
            <input className="mp-input" placeholder="目标路径" value={form.destinationPath} onChange={(e) => setForm((p) => ({ ...p, destinationPath: e.target.value }))} required />
            {targetStorage && targetStorage.type !== "cloud_115" ? (
              <div className="mt-2 grid grid-cols-[auto_auto_1fr] gap-2">
                <button type="button" className="mp-btn" onClick={() => void loadTargetDirs(targetDirs?.parentPath ?? undefined)}>上级</button>
                <button type="button" className="mp-btn" onClick={() => void loadTargetDirs(form.destinationPath)}>读取</button>
                <select className="mp-select" value={form.destinationPath} onChange={(e) => setForm((p) => ({ ...p, destinationPath: e.target.value }))}>
                  <option value="">选择目录</option>
                  {targetDirs?.directories.map((d) => <option key={d.path} value={d.path}>{d.path}</option>)}
                </select>
              </div>
            ) : null}
            <button type="button" className="mp-btn mt-2" onClick={() => void handleViewTargetMedia()}>查看目标路径图片/视频</button>
          </div>

          <input className="mp-input" placeholder="cron（监听模式可留默认）" value={form.schedule ?? ""} onChange={(e) => setForm((p) => ({ ...p, schedule: e.target.value }))} />
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.watchMode} onChange={(e) => setForm((p) => ({ ...p, watchMode: e.target.checked }))} />实时监听</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} />启用</label>
          </div>
          <button type="submit" className="mp-btn mp-btn-primary sm:col-span-2">新增任务</button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="mp-panel p-3">
          <h3 className="text-sm font-medium">源路径媒体</h3>
          <ul className="mt-2 max-h-48 overflow-auto text-xs mp-muted">
            {sourceMedia?.files.map((f) => <li key={f.path}>{f.kind === "image" ? "[图]" : "[视]"} {f.name}</li>)}
            {!sourceMedia?.files.length ? <li>暂无数据</li> : null}
          </ul>
        </article>
        <article className="mp-panel p-3">
          <h3 className="text-sm font-medium">目标路径媒体</h3>
          <ul className="mt-2 max-h-48 overflow-auto text-xs mp-muted">
            {targetMedia?.files.map((f) => <li key={f.path}>{f.kind === "image" ? "[图]" : "[视]"} {f.name}</li>)}
            {!targetMedia?.files.length ? <li>暂无数据</li> : null}
          </ul>
        </article>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((j) => (
          <article key={j.id} className="mp-panel p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">{j.name}</h3>
              <span className="text-xs">{j.enabled ? "启用" : "停用"}</span>
            </div>
            <p className="mt-2 text-xs mp-muted">源: {j.sourceTargetId} @ {j.sourcePath}</p>
            <p className="mt-1 text-xs mp-muted">目标: {j.destinationTargetId} @ {j.destinationPath}</p>
            <p className="mt-1 text-xs mp-muted">模式: {j.watchMode ? "实时监听" : `定时(${j.schedule})`}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
