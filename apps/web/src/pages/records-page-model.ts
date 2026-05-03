type RunStatus = "queued" | "running" | "success" | "failed" | "canceled";

export type RunSummaryInput = {
  status: RunStatus;
  copiedCount: number;
  skippedCount: number;
  errorCount: number;
  durationMs: number | null;
};

type MetricTone = "neutral" | "success" | "warning" | "danger" | "info";

export type RunSummaryTile = {
  key: "total" | "success" | "failed" | "files" | "errors" | "averageDuration";
  label: string;
  value: string;
  tone: MetricTone;
};

export function getRunTone(status: RunStatus): "success" | "info" | "warning" | "danger" {
  if (status === "success") return "success";
  if (status === "queued" || status === "running") return "info";
  if (status === "canceled") return "warning";
  return "danger";
}

export function buildRunSummaryTiles(runs: RunSummaryInput[]): RunSummaryTile[] {
  const success = runs.filter((run) => run.status === "success").length;
  const failed = runs.filter((run) => run.status === "failed").length;
  const files = runs.reduce((sum, run) => sum + run.copiedCount + run.skippedCount, 0);
  const errors = runs.reduce((sum, run) => sum + run.errorCount, 0);
  const durations = runs
    .map((run) => run.durationMs)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageDuration = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length / 1000) : 0;

  return [
    { key: "total", label: "执行记录", value: String(runs.length), tone: "neutral" },
    { key: "success", label: "成功", value: String(success), tone: "success" },
    { key: "failed", label: "失败", value: String(failed), tone: failed > 0 ? "danger" : "success" },
    { key: "files", label: "处理文件", value: files.toLocaleString("zh-CN"), tone: "info" },
    { key: "errors", label: "错误", value: String(errors), tone: errors > 0 ? "danger" : "success" },
    { key: "averageDuration", label: "平均耗时", value: `${averageDuration}s`, tone: "neutral" }
  ];
}
