import { useEffect, useState } from "react";
import { StatusBadge } from "../components/data/status-badge";
import { InlineAlert } from "../components/inline-alert";
import { Button } from "../components/ui/button";
import { PageHeader } from "../components/ui/page-header";
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
    <section className="space-y-4">
      <PageHeader
        title="高级配置"
        description="索引、诊断与维护工具。"
        chips={
          <>
            <StatusBadge>缓存根目录 {mediaIndexItems.length}</StatusBadge>
            <StatusBadge tone="info">新鲜阈值 {formatDurationMs(mediaIndexMaxAgeMs)}</StatusBadge>
            {indexLoading ? <StatusBadge tone="info">读取中</StatusBadge> : null}
          </>
        }
      />

      <div className="mp-panel p-4 md:flex md:min-h-0 md:flex-col">
        <div className="flex flex-col gap-3">
          {error ? (
            <InlineAlert tone="error" onClose={() => setError("")}>
              {error}
            </InlineAlert>
          ) : null}
          {message ? (
            <InlineAlert tone="success" autoCloseMs={5200} onClose={() => setMessage("")}>
              {message}
            </InlineAlert>
          ) : null}
          <InlineAlert tone="info">
            <span className="inline-flex flex-wrap items-center gap-2">
              <StatusBadge tone="warning">维护操作</StatusBadge>
              <span>重建索引可能持续较长时间，建议在排障或维护窗口中执行。</span>
            </span>
          </InlineAlert>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:min-h-0 md:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge>缓存根目录 {mediaIndexItems.length}</StatusBadge>
            <StatusBadge tone="info">新鲜阈值 {formatDurationMs(mediaIndexMaxAgeMs)}</StatusBadge>
            {indexLoading ? <StatusBadge tone="info">读取中</StatusBadge> : null}
            <Button size="sm" disabled={indexLoading || indexRebuilding} onClick={() => void loadMediaIndexStatus(true)}>
              刷新状态
            </Button>
            <Button size="sm" disabled={indexRebuilding} onClick={() => void handleRebuildMediaIndex()}>
              {indexRebuilding ? "重建中..." : "重建索引"}
            </Button>
          </div>

          <div className="max-h-[420px] space-y-2 overflow-auto">
            {mediaIndexItems.length ? (
              mediaIndexItems.map((item) => (
                <div key={item.rootPath} className="mp-panel-soft rounded-md px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="min-w-0 break-all text-sm font-medium">{item.rootPath}</p>
                    <StatusBadge tone={item.fresh ? "success" : "warning"}>{item.fresh ? "新鲜" : "过期"}</StatusBadge>
                  </div>
                  <p className="mt-1 text-xs mp-muted">
                    文件 {item.fileCount} · 更新于 {new Date(item.generatedAt).toLocaleString("zh-CN", { hour12: false })} · 距今{" "}
                    {formatDurationMs(item.ageMs)}
                  </p>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm mp-muted">暂无可用索引缓存，可在维护窗口手动重建。</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
