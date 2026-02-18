import { useEffect, useState, type FormEvent } from "react";
import { createBackupAsset, createPreviewToken, getBackups, getPreview } from "../lib/api";
import type { BackupAsset, PreviewResult } from "../types/api";

const initialForm: Omit<BackupAsset, "id"> = {
  name: "",
  kind: "photo",
  storageTargetId: "",
  encrypted: true,
  sizeBytes: 0,
  capturedAt: new Date().toISOString(),
  livePhotoAssetId: ""
};

export function BackupsPage() {
  const [items, setItems] = useState<BackupAsset[]>([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);

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
    <section className="mt-6 rounded-3xl border border-white/40 bg-white/72 p-5 shadow-[0_8px_24px_rgba(11,41,33,0.09)] backdrop-blur">
      <h2 className="text-lg font-semibold text-[var(--ark-deep)]">备份浏览</h2>
      <p className="mt-1 text-xs text-amber-800">115 加密对象预览采用一次性 token + 内存解密流。</p>
      {error ? <p className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-paper)] p-3 sm:grid-cols-2 lg:grid-cols-3">
        <input
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          placeholder="文件名"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
        />
        <input
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          placeholder="storageTargetId"
          value={form.storageTargetId}
          onChange={(e) => setForm((p) => ({ ...p, storageTargetId: e.target.value }))}
          required
        />
        <select
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          value={form.kind}
          onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value as BackupAsset["kind"] }))}
        >
          <option value="photo">photo</option>
          <option value="live_photo_image">live_photo_image</option>
          <option value="live_photo_video">live_photo_video</option>
        </select>
        <input
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          type="number"
          placeholder="sizeBytes"
          value={form.sizeBytes}
          onChange={(e) => setForm((p) => ({ ...p, sizeBytes: Number(e.target.value) }))}
          required
        />
        <input
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          placeholder="livePhotoAssetId (可选)"
          value={form.livePhotoAssetId ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, livePhotoAssetId: e.target.value }))}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.encrypted} onChange={(e) => setForm((p) => ({ ...p, encrypted: e.target.checked }))} />
          加密
        </label>
        <button type="submit" className="rounded-full bg-[var(--ark-deep)] px-4 py-2 text-sm text-[var(--ark-paper)] sm:col-span-2 lg:col-span-3">
          新增资产
        </button>
      </form>

      {preview ? (
        <article className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
          <p>预览资产: {preview.assetId}</p>
          <p>模式: {preview.mode}</p>
          <p>流地址: {preview.streamUrl}</p>
        </article>
      ) : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a) => (
          <article key={a.id} className="rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-paper)] px-4 py-3">
            <h3 className="font-medium text-[var(--ark-deep)]">{a.name}</h3>
            <p className="mt-1 text-xs text-[var(--ark-ink)]/70">类型: {a.kind}</p>
            <p className="mt-1 text-xs text-[var(--ark-ink)]/70">{a.encrypted ? "加密" : "明文"}</p>
            <button
              type="button"
              onClick={() => void handlePreview(a.id)}
              className="mt-3 rounded-full bg-[var(--ark-deep)] px-3 py-1 text-xs text-[var(--ark-paper)]"
            >
              请求预览
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
