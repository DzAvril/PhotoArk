import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
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

  const capacitySummary = useMemo(() => {
    const readable = capacities.filter((item) => item.available);
    const unreadable = capacities.length - readable.length;
    const totalBytes = readable.reduce((sum, item) => sum + (item.totalBytes ?? 0), 0);
    const usedBytes = readable.reduce((sum, item) => sum + (item.usedBytes ?? 0), 0);
    const usedPercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0;
    return {
      groups: capacities.length,
      readable: readable.length,
      unreadable,
      totalBytes,
      usedBytes,
      usedPercent
    };
  }, [capacities]);

  return (
    <section className="space-y-4">
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
            meta="NAS + SSD + 云端"
            tone="blue"
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
            tone="emerald"
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
            tone="amber"
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
            tone="violet"
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
        className="mp-panel p-4"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05, duration: 0.2, ease: "easeOut" }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">存储盘容量</h3>
            <p className="mt-1 text-sm mp-muted">
              已读取 {capacitySummary.readable}/{capacitySummary.groups} 组
              {capacitySummary.unreadable ? `，${capacitySummary.unreadable} 组不可读取` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="mp-chip">总容量 {formatBytes(capacitySummary.totalBytes)}</span>
            <span className="mp-chip">已用 {formatBytes(capacitySummary.usedBytes)}</span>
            <span className="mp-chip mp-chip-success">整体 {capacitySummary.usedPercent}%</span>
          </div>
        </div>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {capacities.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3 transition-all hover:border-[var(--ark-line-strong)] hover:shadow-md"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold break-all">{item.storageNames.join("、")}</p>
                  <p className="text-xs mp-muted">{item.storageNames.length} 个配置存储</p>
                </div>
                {item.available ? (
                  <span className="mp-chip">{item.usedPercent}% 已用</span>
                ) : (
                  <span className="mp-chip mp-chip-warning">不可读取</span>
                )}
              </div>

              {item.available ? (
                <>
                  <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[var(--ark-line)]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--ark-primary)] to-[var(--ark-primary-strong)]"
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
          {!capacities.length ? <p className="text-sm mp-muted">暂无存储容量数据</p> : null}
        </div>
      </motion.article>
    </section>
  );
}
