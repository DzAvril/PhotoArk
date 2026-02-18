import { useEffect, useState } from "react";
import { createPreviewToken, getBackups, getPreview } from "../lib/api";
import type { BackupAsset, PreviewResult } from "../types/api";

export function BackupsPage() {
  const [items, setItems] = useState<BackupAsset[]>([]);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);

  useEffect(() => {
    getBackups()
      .then((res) => setItems(res.items))
      .catch((err: Error) => setError(err.message));
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

  return (
    <section className="mt-6 rounded-3xl border border-white/40 bg-white/72 p-5 shadow-[0_8px_24px_rgba(11,41,33,0.09)] backdrop-blur">
      <h2 className="text-lg font-semibold text-[var(--ark-deep)]">备份浏览</h2>
      <p className="mt-1 text-xs text-amber-800">115 加密对象预览采用一次性 token + 内存解密流。</p>
      {error ? <p className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p> : null}

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
