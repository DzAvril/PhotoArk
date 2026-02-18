import * as Collapsible from "@radix-ui/react-collapsible";
import { useEffect, useState, type FormEvent } from "react";
import { createBackupAsset, createPreviewToken, getBackups, getLivePhotoDetail, getPreview } from "../lib/api";
import type { BackupAsset, LivePhotoDetail, PreviewResult } from "../types/api";

const initialForm: Omit<BackupAsset, "id"> = {
  name: "",
  kind: "photo",
  storageTargetId: "",
  encrypted: true,
  sizeBytes: 0,
  capturedAt: new Date().toISOString(),
  livePhotoAssetId: ""
};
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export function BackupsPage() {
  const [items, setItems] = useState<BackupAsset[]>([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [liveDetail, setLiveDetail] = useState<LivePhotoDetail["pair"]>(null);
  const [formOpen, setFormOpen] = useState(true);

  async function load() {
    try {
      const res = await getBackups();
      setItems(res.items);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handlePreview(assetId: string) {
    setError("");
    try {
      const tokenResult = await createPreviewToken(assetId);
      const previewResult = await getPreview(assetId, tokenResult.token);
      setPreview(previewResult);
      const detail = await getLivePhotoDetail(assetId);
      setLiveDetail(detail.pair);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createBackupAsset({
        ...form,
        sizeBytes: Number(form.sizeBytes),
        livePhotoAssetId: form.livePhotoAssetId || undefined
      });
      setForm(initialForm);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="space-y-3">
      <Collapsible.Root open={formOpen} onOpenChange={setFormOpen} className="mp-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="mp-section-title">备份浏览</h2>
            <p className="mt-1 text-xs mp-muted">115 加密对象预览采用一次性 token + 内存解密流</p>
          </div>
          <Collapsible.Trigger className="mp-btn">{formOpen ? "收起" : "展开"}</Collapsible.Trigger>
        </div>
        {error ? <p className="mp-error mt-3">{error}</p> : null}

        <Collapsible.Content>
          <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input className="mp-input" placeholder="文件名" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            <input className="mp-input" placeholder="storageTargetId" value={form.storageTargetId} onChange={(e) => setForm((p) => ({ ...p, storageTargetId: e.target.value }))} required />
            <select className="mp-select" value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value as BackupAsset["kind"] }))}>
              <option value="photo">photo</option>
              <option value="live_photo_image">live_photo_image</option>
              <option value="live_photo_video">live_photo_video</option>
            </select>
            <input className="mp-input" type="number" placeholder="sizeBytes" value={form.sizeBytes} onChange={(e) => setForm((p) => ({ ...p, sizeBytes: Number(e.target.value) }))} required />
            <input className="mp-input" placeholder="livePhotoAssetId (可选)" value={form.livePhotoAssetId ?? ""} onChange={(e) => setForm((p) => ({ ...p, livePhotoAssetId: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.encrypted} onChange={(e) => setForm((p) => ({ ...p, encrypted: e.target.checked }))} />加密</label>
            <button type="submit" className="mp-btn mp-btn-primary sm:col-span-2 lg:col-span-3">新增资产</button>
          </form>
        </Collapsible.Content>
      </Collapsible.Root>

      {preview ? (
        <article className="mp-panel p-4 text-xs">
          <p>预览资产: {preview.assetId}</p>
          <p className="mt-1">模式: {preview.mode}</p>
          <p className="mt-1">流地址: {preview.streamUrl}</p>
          <a className="mt-2 inline-block text-[var(--ark-primary)] underline" href={`${apiBase}${preview.streamUrl}`} target="_blank" rel="noreferrer">
            打开预览流占位接口
          </a>
          {liveDetail ? (
            <div className="mt-2 rounded-md border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2">
              <p>Live Photo 资产组: {liveDetail.livePhotoAssetId}</p>
              <p>Image: {liveDetail.image?.name ?? "缺失"}</p>
              <p>Video: {liveDetail.video?.name ?? "缺失"}</p>
            </div>
          ) : null}
        </article>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((a) => (
          <article key={a.id} className="mp-panel p-4">
            <h3 className="font-medium">{a.name}</h3>
            <p className="mt-1 text-xs mp-muted">类型: {a.kind}</p>
            <p className="mt-1 text-xs mp-muted">{a.encrypted ? "加密" : "明文"}</p>
            <button type="button" onClick={() => void handlePreview(a.id)} className="mp-btn mt-3">
              请求预览
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
