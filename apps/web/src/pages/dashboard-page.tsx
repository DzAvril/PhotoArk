import { useEffect, useState } from "react";
import { MetricCard } from "../components/metric-card";
import { getMetrics } from "../lib/api";
import type { Metrics } from "../types/api";

const emptyMetrics: Metrics = {
  storageTargets: 0,
  backupJobs: 0,
  encryptedAssets: 0,
  livePhotoPairs: 0
};

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    getMetrics()
      .then(setMetrics)
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
    </section>
  );
}
