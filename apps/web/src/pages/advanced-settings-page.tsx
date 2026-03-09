import { useEffect, useState } from "react";
import { InlineAlert } from "../components/inline-alert";
import { getMediaIndexStatus, rebuildMediaIndex } from "../lib/api";
import type { MediaIndexStatusItem } from "../types/api";

function formatDurationMs(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value < 1000) return `${Math.round(value)} ms`;
  const totalSeconds = Math.round(value / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes} 分 ${seconds} 秒`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} 小时 ${mins} 分`;
}

export function AdvancedSettingsPage() {
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexRebuilding, setIndexRebuilding] = useState(false);
  const [mediaIndexItems, setMediaIndexItems] = useState<MediaIndexStatusItem[]>([]);
  const [mediaIndexMaxAgeMs, setMediaIndexMaxAgeMs] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadMediaIndexStatus(showError = false) {
    setIndexLoading(true);
    try {
      const res = await getMediaIndexStatus();
      setMediaIndexItems(res.items);
      setMediaIndexMaxAgeMs(res.maxAgeMs);
    } catch (err) {
      if (showError) {
        setError((err as Error).message);
      }
    } finally {
      setIndexLoading(false);
    }
  }

  useEffect(() => {
    void loadMediaIndexStatus();
  }, []);

  async function handleRebuildMediaIndex() {
    setIndexRebuilding(true);
    setError("");
    setMessage("");
    try {
      const res = await rebuildMediaIndex();
      await loadMediaIndexStatus();
      if (res.failedCount > 0) {
        setError(`索引重建完成：成功 ${res.refreshedCount}，失败 ${res.failedCount}`);
      } else {
        setMessage(`索引重建完成：共刷新 ${res.refreshedCount} 个本地存储`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIndexRebuilding(false);
    }
  }

  return (
    <div className="mp-panel mp-panel-soft p-4 md:flex md:h-full md:flex-col">
      <div>
        <h3 className="text-base font-semibold">媒体索引缓存</h3>
      </div>

      {error ? (
        <InlineAlert tone="error" className="mt-3" onClose={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}
      {message ? (
        <InlineAlert tone="success" className="mt-3" autoCloseMs={5200} onClose={() => setMessage("")}>
          {message}
        </InlineAlert>
      ) : null}

      <div className="mt-3 rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="mp-chip">缓存根目录 {mediaIndexItems.length}</span>
          <span className="mp-chip">新鲜阈值 {formatDurationMs(mediaIndexMaxAgeMs)}</span>
          {indexLoading ? <span className="mp-chip">读取中...</span> : null}
          <button
            type="button"
            className="mp-btn min-h-[30px] px-2 py-1 text-xs font-medium"
            disabled={indexLoading || indexRebuilding}
            onClick={() => void loadMediaIndexStatus(true)}
          >
            刷新状态
          </button>
          <button
            type="button"
            className="mp-btn min-h-[30px] px-2 py-1 text-xs font-medium"
            disabled={indexRebuilding}
            onClick={() => void handleRebuildMediaIndex()}
          >
            {indexRebuilding ? "重建中..." : "重建索引"}
          </button>
        </div>

        <div className="mt-3 max-h-60 space-y-2 overflow-auto">
          {mediaIndexItems.length ? (
            mediaIndexItems.map((item) => (
              <div key={item.rootPath} className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-medium">{item.rootPath}</p>
                  <span className={`mp-chip text-xs ${item.fresh ? "mp-chip-success" : "mp-chip-warning"}`}>
                    {item.fresh ? "新鲜" : "过期"}
                  </span>
                </div>
                <p className="mt-1 text-xs mp-muted">
                  文件 {item.fileCount} · 更新于 {new Date(item.generatedAt).toLocaleString("zh-CN", { hour12: false })} · 距今{" "}
                  {formatDurationMs(item.ageMs)}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs mp-muted">暂无可用索引缓存，首次统计时会自动建立。</p>
          )}
        </div>
      </div>
    </div>
  );
}
