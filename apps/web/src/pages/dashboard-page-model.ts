import type { StorageMediaSummaryItem } from "../types/api";

export type OverviewMetricInput = {
  storageCount: number;
  jobCount: number;
  activeExecutionCount: number;
  failedRunCount: number;
  mediaCount: number;
  capacityRiskCount: number;
};

export type OverviewMetricTile = {
  key: "media" | "storage" | "jobs" | "active" | "failures" | "risk";
  label: string;
  value: string;
  description: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
};

export function buildCapacityRiskLabel(remainingPercent: number | null): string {
  if (remainingPercent === null) return "容量未知";
  if (remainingPercent <= 10) return "容量紧张";
  if (remainingPercent <= 25) return "容量偏低";
  return "容量充足";
}

export function buildOverviewMetricTiles(input: OverviewMetricInput): OverviewMetricTile[] {
  return [
    { key: "media", label: "媒体文件", value: input.mediaCount.toLocaleString("zh-CN"), description: "图片、视频与 Live Photo", tone: "info" },
    { key: "storage", label: "存储目标", value: String(input.storageCount), description: "已配置源与目标", tone: "neutral" },
    { key: "jobs", label: "同步任务", value: String(input.jobCount), description: "计划任务和监听任务", tone: "neutral" },
    { key: "active", label: "执行中", value: String(input.activeExecutionCount), description: "队列和运行任务", tone: input.activeExecutionCount > 0 ? "info" : "success" },
    { key: "failures", label: "失败记录", value: String(input.failedRunCount), description: "最近失败和异常", tone: input.failedRunCount > 0 ? "danger" : "success" },
    { key: "risk", label: "容量风险", value: String(input.capacityRiskCount), description: "低容量存储数量", tone: input.capacityRiskCount > 0 ? "warning" : "success" }
  ];
}

export function sortStorageMediaSummary(items: StorageMediaSummaryItem[]): StorageMediaSummaryItem[] {
  return [...items].sort((a, b) => b.totalBytes - a.totalBytes || b.totalCount - a.totalCount || a.storageName.localeCompare(b.storageName, "zh-CN"));
}
