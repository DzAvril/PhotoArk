import { useEffect, useState } from "react";
import { MetricCard } from "../components/metric-card";
import { getMetrics, getVersionInfo } from "../lib/api";
import type { Metrics, VersionInfo } from "../types/api";

const emptyMetrics: Metrics = {
  storageTargets: 0,
  backupJobs: 0,
  encryptedAssets: 0,
  livePhotoPairs: 0
};

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    Promise.all([getMetrics(), getVersionInfo()])
      .then(([m, v]) => {
        setMetrics(m);
        setVersion(v);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

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
    </section>
  );
}
