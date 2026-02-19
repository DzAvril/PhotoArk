import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { MetricCard } from "../components/metric-card";
import { getMetrics, getStorageCapacities } from "../lib/api";
import type { Metrics, StorageCapacityItem } from "../types/api";

const emptyMetrics: Metrics = {
  storageTargets: 0,
  backupJobs: 0,
  encryptedAssets: 0,
  livePhotoPairs: 0
};

export function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics>(emptyMetrics);
  const [capacities, setCapacities] = useState<StorageCapacityItem[]>([]);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    Promise.all([getMetrics(), getStorageCapacities()])
      .then(([m, c]) => {
        setMetrics(m);
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
      <motion.div
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <MetricCard
            title="目标存储"
            value={String(metrics.storageTargets)}
            meta="NAS / SSD / 115"
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                <path d="M4 7.5h16v9H4z" stroke="currentColor" strokeWidth="1.7" />
                <path d="M8 11h.01M12 11h.01M16 11h.01" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            }
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <MetricCard
            title="备份任务"
            value={String(metrics.backupJobs)}
            meta="定时 + 文件监听"
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7" />
                <path d="M12 8v4l2.6 2.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <MetricCard
            title="加密对象"
            value={String(metrics.encryptedAssets)}
            meta="AES-256-GCM"
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
                <path d="M8.5 10V8a3.5 3.5 0 1 1 7 0v2" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            }
          />
        </motion.div>
        <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
          <MetricCard
            title="Live Photo 对"
            value={String(metrics.livePhotoPairs)}
            meta="HEIC/JPG + MOV"
            icon={
              <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden="true">
                <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.7" />
                <circle cx="12" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
              </svg>
            }
          />
        </motion.div>
      </motion.div>

      <motion.article
        className="mp-panel mp-panel-soft p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.2, ease: "easeOut" }}
      >
        <h3 className="text-base font-semibold">系统状态</h3>
        <p className="mt-2 text-sm mp-muted">
          当前共有 {metrics.storageTargets} 个目标存储，{metrics.backupJobs} 个备份任务，其中 {metrics.encryptedAssets} 个对象已启用加密。
        </p>
      </motion.article>

      <motion.article
        className="mp-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.2, ease: "easeOut" }}
      >
        <h3 className="text-base font-semibold">存储盘容量</h3>
        <div className="mt-3 space-y-3">
          {capacities.map((item) => (
            <div key={item.id} className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold break-all">{item.storageNames.join("、")}</p>
                  <p className="text-sm mp-muted">{item.storageNames.length} 个配置存储</p>
                </div>
                {item.available ? (
                  <span className="text-sm">{item.usedPercent}% 已用</span>
                ) : (
                  <span className="text-sm mp-status-warning">不可读取</span>
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
                  <p className="mt-2 text-sm mp-muted">
                    已用 {formatBytes(item.usedBytes)} / 总量 {formatBytes(item.totalBytes)} · 可用 {formatBytes(item.freeBytes)}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm mp-muted">{item.reason ?? "无法读取该存储容量"}</p>
              )}
            </div>
          ))}
          {!capacities.length ? <p className="text-sm mp-muted">暂无存储</p> : null}
        </div>
      </motion.article>
    </section>
  );
}
