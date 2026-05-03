import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { InlineAlert } from "../components/inline-alert";
import { ProgressBar } from "../components/data/progress-bar";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { PageHeader } from "../components/ui/page-header";
import { SectionCard } from "../components/ui/section-card";
import { SegmentedControl } from "../components/ui/segmented-control";
import { usePageVisibility } from "../hooks/use-page-visibility";
import { cancelJobExecution, getJobExecutions, getJobs } from "../lib/api";
import { syncTabs, type SyncTabValue } from "../navigation/navigation-model";
import type { BackupJob, JobExecution, JobExecutionPhase } from "../types/api";
import { JobDiffPage } from "./job-diff-page";
import { JobsPage } from "./jobs-page";
import { getSyncTabFromSearch, setSyncTabInSearch } from "./sync-page-model";

function isActiveExecution(execution: JobExecution): boolean {
  return execution.status === "queued" || execution.status === "running";
}

function getExecutionStatusLabel(execution: JobExecution): string {
  if (execution.status === "queued") return "排队中";
  if (execution.status === "running") return "执行中";
  if (execution.status === "canceled") return "已取消";
  if (execution.status === "success") return "已完成";
  return "失败";
}

function getExecutionPhaseLabel(phase: JobExecutionPhase): string {
  if (phase === "queued") return "等待调度";
  if (phase === "scanning") return "扫描文件";
  if (phase === "syncing") return "同步文件";
  return "收尾完成";
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function RunningExecutionsPanel() {
  const isVisible = usePageVisibility();
  const navigate = useNavigate();
  const mountedRef = useRef(false);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [cancelingIds, setCancelingIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs]);
  const activeExecutions = useMemo(
    () =>
      executions
        .filter(isActiveExecution)
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)),
    [executions]
  );
  const hasActiveExecution = activeExecutions.length > 0;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadAll = useCallback(async (mode: "initial" | "refresh" = "refresh") => {
    if (mode === "initial") setLoading(true);
    if (mode === "refresh") setRefreshing(true);
    try {
      const [jobsRes, executionsRes] = await Promise.all([getJobs(), getJobExecutions()]);
      if (!mountedRef.current) return;
      setJobs(jobsRes.items);
      setExecutions(executionsRes.items);
      setError("");
    } catch (err) {
      if (!mountedRef.current) return;
      setError((err as Error).message);
    } finally {
      if (!mountedRef.current) return;
      if (mode === "initial") setLoading(false);
      if (mode === "refresh") setRefreshing(false);
    }
  }, []);

  const loadExecutions = useCallback(async () => {
    try {
      const executionsRes = await getJobExecutions();
      if (!mountedRef.current) return hasActiveExecution;
      setExecutions(executionsRes.items);
      setError("");
      return executionsRes.items.some(isActiveExecution);
    } catch (err) {
      if (!mountedRef.current) return hasActiveExecution;
      setError((err as Error).message);
      return hasActiveExecution;
    }
  }, [hasActiveExecution]);

  useEffect(() => {
    void loadAll("initial");
  }, [loadAll]);

  useEffect(() => {
    if (!isVisible) return;

    let disposed = false;
    let timer: number | null = null;

    const schedule = (delay: number) => {
      timer = window.setTimeout(async () => {
        const nextHasActiveExecution = await loadExecutions();
        if (!disposed) {
          schedule(nextHasActiveExecution ? 1800 : 8000);
        }
      }, delay);
    };

    schedule(hasActiveExecution ? 1800 : 8000);

    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [hasActiveExecution, isVisible, loadExecutions]);

  async function handleCancelExecution(execution: JobExecution) {
    setError("");
    setMessage("");
    setCancelingIds((prev) => new Set(prev).add(execution.id));
    try {
      const result = await cancelJobExecution(execution.id);
      if (!mountedRef.current) return;
      setExecutions((prev) => [result.execution, ...prev.filter((item) => item.id !== result.execution.id)]);
      setMessage(`任务“${jobById.get(execution.jobId)?.name ?? execution.jobId}”已请求停止。`);
    } catch (err) {
      if (!mountedRef.current) return;
      setError((err as Error).message);
    } finally {
      if (!mountedRef.current) return;
      setCancelingIds((prev) => {
        const next = new Set(prev);
        next.delete(execution.id);
        return next;
      });
    }
  }

  return (
    <section className="space-y-3">
      {message ? (
        <InlineAlert tone="success" autoCloseMs={5200} onClose={() => setMessage("")}>
          {message}
        </InlineAlert>
      ) : null}
      {error ? (
        <InlineAlert tone="error" onClose={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}

      <SectionCard
        title="执行中队列"
        description="展示正在排队或运行的同步执行，可查看当前阶段、路径并发起停止。"
        right={
          <>
            <span className="mp-chip">活跃 {activeExecutions.length}</span>
            <Button size="sm" busy={refreshing} onClick={() => void loadAll("refresh")}>
              {refreshing ? "刷新中..." : "刷新"}
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="py-8 text-center text-sm mp-muted">正在读取执行队列...</div>
        ) : !activeExecutions.length ? (
          <EmptyState title="暂无执行中的任务" description="从差异检查或同步任务页启动任务后，会在这里显示排队和执行进度。" />
        ) : (
          <div className="space-y-3">
            {activeExecutions.map((execution) => {
              const job = jobById.get(execution.jobId);
              const percent = clampPercent(execution.progress.percent);
              return (
                <article key={execution.id} className="mp-panel p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-base font-semibold">{job?.name ?? execution.jobId}</p>
                      <p className="mt-1 text-sm mp-muted">
                        {getExecutionStatusLabel(execution)} · {getExecutionPhaseLabel(execution.progress.phase)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <span className={execution.status === "queued" ? "mp-chip" : "mp-chip mp-chip-warning"}>
                        {execution.status === "queued" ? "排队" : "运行"}
                      </span>
                      <Button
                        size="sm"
                        onClick={() => navigate(`/sync?tab=jobs&editJobId=${encodeURIComponent(execution.jobId)}`)}
                      >
                        查看任务
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        busy={cancelingIds.has(execution.id)}
                        disabled={cancelingIds.has(execution.id)}
                        onClick={() => void handleCancelExecution(execution)}
                      >
                        {cancelingIds.has(execution.id) ? "停止中..." : "停止"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between text-sm">
                    <span className="mp-muted">总体进度</span>
                    <span className="font-semibold">{percent}%</span>
                  </div>
                  <ProgressBar value={percent} label={`${job?.name ?? execution.jobId} 总体进度`} />

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-4">
                    <div className="rounded-md border border-[var(--ark-line)] p-3">
                      <dt className="text-xs mp-muted">已扫描</dt>
                      <dd className="mt-1 font-semibold">{execution.progress.scannedCount}</dd>
                    </div>
                    <div className="rounded-md border border-[var(--ark-line)] p-3">
                      <dt className="text-xs mp-muted">已处理</dt>
                      <dd className="mt-1 font-semibold">{execution.progress.processedCount}</dd>
                    </div>
                    <div className="rounded-md border border-[var(--ark-line)] p-3">
                      <dt className="text-xs mp-muted">已同步</dt>
                      <dd className="mt-1 font-semibold">{execution.progress.copiedCount}</dd>
                    </div>
                    <div className="rounded-md border border-[var(--ark-line)] p-3">
                      <dt className="text-xs mp-muted">失败</dt>
                      <dd className="mt-1 font-semibold text-[var(--ark-danger-text)]">{execution.progress.failedCount}</dd>
                    </div>
                  </dl>

                  <div className="mt-3 rounded-md border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] px-3 py-2 text-xs">
                    <span className="font-semibold">当前路径：</span>
                    <span className="break-all mp-muted">{execution.progress.currentPath ?? "等待下一个文件"}</span>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </section>
  );
}

export function SyncPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getSyncTabFromSearch(location.search);
  const activeTabMeta = syncTabs.find((item) => item.value === activeTab) ?? syncTabs[0];

  function handleTabChange(tab: SyncTabValue) {
    navigate({ pathname: "/sync", search: setSyncTabInSearch(location.search, tab) });
  }

  return (
    <section className="flex min-h-0 flex-col gap-3 pb-4 md:h-full">
      <PageHeader
        eyebrow="Sync Workflow"
        title="同步"
        description={activeTabMeta.description}
        actions={
          <SegmentedControl
            ariaLabel="同步工作流"
            value={activeTab}
            items={syncTabs.map((item) => ({ value: item.value, label: item.label }))}
            onChange={handleTabChange}
          />
        }
      />

      {activeTab === "diff" ? <JobDiffPage embedded /> : null}
      {activeTab === "jobs" ? <JobsPage embedded /> : null}
      {activeTab === "running" ? <RunningExecutionsPanel /> : null}
    </section>
  );
}
