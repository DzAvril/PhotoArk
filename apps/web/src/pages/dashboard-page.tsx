import { useEffect, useState } from "react";
import { MetricCard } from "../components/metric-card";
import { getMetrics, getStorageCapacities, getVersionInfo } from "../lib/api";
import type { Metrics, StorageCapacityItem, VersionInfo } from "../types/api";

const emptyMetrics: Metrics = {
  storageTargets: 0,
  backupJobs: 0,
  encryptedAssets: 0,
  livePhotoPairs: 0
};

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [capacities, setCapacities] = useState<StorageCapacityItem[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    Promise.all([getMetrics(), getVersionInfo(), getStorageCapacities()])
      .then(([m, v, c]) => {
        setMetrics(m);
        setVersion(v);
        setCapacities(c.items);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  function formatBytes(bytes: number | null) {
    if (bytes === null) return "-";
    const units = ["B", "KB", "MB", "GB", "TB", "PB"];
    let value = bytes;
    let index = 0;
    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index += 1;
    }
    return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
  }

  return (
    <section className="space-y-3">
      {error ? <p className="mp-error">{error}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="目标存储" value={String(metrics.storageTargets)} meta="NAS / SSD / 115" icon={<span>◫</span>} />
        <MetricCard title="备份任务" value={String(metrics.backupJobs)} meta="定时 + 文件监听" icon={<span>◎</span>} />
        <MetricCard title="加密对象" value={String(metrics.encryptedAssets)} meta="AES-256-GCM" icon={<span>◍</span>} />
        <MetricCard title="Live Photo 对" value={String(metrics.livePhotoPairs)} meta="HEIC/JPG + MOV" icon={<span>◌</span>} />
      </div>
      <article className="mp-panel p-4">
        <h3 className="text-sm font-semibold">版本检查</h3>
        <p className="mt-2 text-xs mp-muted">当前版本: {version?.currentVersion ?? "..."}</p>
        <p className="mt-1 text-xs mp-muted">最新版本: {version?.latestVersion ?? "未知"}</p>
        <p className="mt-1 text-xs">
          {version?.hasUpdate ? "发现新版本，请升级。" : version?.upToDate ? "当前已经是最新版本。" : "暂时无法检查更新。"}
        </p>
      </article>

      <article className="mp-panel p-4">
        <h3 className="text-sm font-semibold">存储盘容量</h3>
        <div className="mt-3 space-y-3">
          {capacities.map((item) => (
            <div key={item.storageId} className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{item.storageName}</p>
                  <p className="text-xs mp-muted">{item.storageType} · {item.basePath}</p>
                </div>
                {item.available ? (
                  <span className="text-xs">{item.usedPercent}% 已用</span>
                ) : (
                  <span className="text-xs text-amber-600">不可读取</span>
                )}
              </div>

              {item.available ? (
                <>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--ark-line)]">
                    <div
                      className="h-full rounded-full bg-[var(--ark-primary)]"
                      style={{ width: `${Math.min(100, Math.max(0, item.usedPercent ?? 0))}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs mp-muted">
                    已用 {formatBytes(item.usedBytes)} / 总量 {formatBytes(item.totalBytes)} · 可用 {formatBytes(item.freeBytes)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-xs mp-muted">{item.reason ?? "无法读取该存储容量"}</p>
              )}
            </div>
          ))}
          {!capacities.length ? <p className="text-xs mp-muted">暂无存储</p> : null}
        </div>
      </article>
    </section>
  );
}
