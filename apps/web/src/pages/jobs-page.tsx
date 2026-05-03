import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "../components/confirm-dialog";
import { InlineAlert } from "../components/inline-alert";
import { PathPicker } from "../components/path-picker";
import { TablePagination } from "../components/table/table-pagination";
import { SortableHeader } from "../components/table/sortable-header";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { SectionCard } from "../components/ui/section-card";
import { useLocalStorageState } from "../hooks/use-local-storage-state";
import { usePageVisibility } from "../hooks/use-page-visibility";
import {
  browseStorageDirectories,
  cancelJobExecution,
  createJob,
  deleteJob,
  getJobExecutions,
  getJobs,
  getRuns,
  getStorages,
  runJob,
  updateJob
} from "../lib/api";
import { buildJobPayload, createInitialJobForm, type JobForm } from "./jobs-page-model";
import type { BackupJob, JobExecution, JobRun, StorageTarget } from "../types/api";

type SortKey = "name" | "sourceTargetId" | "destinationTargetId" | "enabled";

type PendingDeleteAction = {
  mode: "single" | "batch";
  ids: string[];
  label: string;
};

function getAriaSort(active: boolean, asc: boolean): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return asc ? "ascending" : "descending";
}

function isExecutionActive(execution: JobExecution): boolean {
  return execution.status === "queued" || execution.status === "running";
}

function upsertExecution(items: JobExecution[], execution: JobExecution): JobExecution[] {
  const next = items.filter((item) => item.id !== execution.id);
  next.unshift(execution);
  return next;
}

function getExecutionStatusLabel(execution: JobExecution): string {
  if (execution.status === "queued") return "排队中";
  if (execution.status === "running") {
    if (execution.progress.phase === "scanning") return "扫描中";
    return "执行中";
  }
  if (execution.status === "canceled") return "已取消";
  if (execution.status === "success") return "执行完成";
  return "执行失败";
}

function getRunStatusLabel(status: JobRun["status"]): string {
  if (status === "success") return "成功";
  if (status === "canceled") return "已取消";
  return "失败";
}

function getRunStatusClass(status: JobRun["status"]): string {
  if (status === "success") return "mp-status-success";
  if (status === "canceled") return "mp-status-warning";
  return "mp-status-danger";
}

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

function getStorageTypeLabel(type: StorageTarget["type"]): string {
  if (type === "local_fs") return "NAS";
  if (type === "external_ssd") return "SSD";
  return "115 云盘";
}

export function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState<BackupJob[]>([]);
  const [storages, setStorages] = useState<StorageTarget[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [executions, setExecutions] = useState<JobExecution[]>([]);
  const [lastSourceTargetId, setLastSourceTargetId] = useLocalStorageState("ark-last-job-source-target-id", "");
  const [lastDestinationTargetId, setLastDestinationTargetId] = useLocalStorageState(
    "ark-last-job-destination-target-id",
    ""
  );
  const [form, setForm] = useState<JobForm>(() => createInitialJobForm(lastSourceTargetId, lastDestinationTargetId));
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingJobIds, setDeletingJobIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<PendingDeleteAction | null>(null);
  const [progressDialogExecutionId, setProgressDialogExecutionId] = useState<string | null>(null);
  const [cancelingExecutionIds, setCancelingExecutionIds] = useState<Set<string>>(new Set());
  const editJobIdFromQuery = searchParams.get("editJobId");
  const isVisible = usePageVisibility();

  const storageById = useMemo(() => Object.fromEntries(storages.map((s) => [s.id, s])), [storages]);
  const sourceStorage = form.sourceTargetId ? storageById[form.sourceTargetId] : undefined;
  const destinationStorage = form.destinationTargetId ? storageById[form.destinationTargetId] : undefined;
  const canBrowseSourcePath = Boolean(sourceStorage && sourceStorage.type !== "cloud_115");
  const canBrowseDestinationPath = Boolean(destinationStorage && destinationStorage.type !== "cloud_115");

  async function browseSourcePath(dirPath?: string) {
    if (!sourceStorage) throw new Error("请先选择源存储");
    return browseStorageDirectories(sourceStorage.id, dirPath);
  }

  async function browseDestinationPath(dirPath?: string) {
    if (!destinationStorage) throw new Error("请先选择目标存储");
    return browseStorageDirectories(destinationStorage.id, dirPath);
  }

  async function load() {
    try {
      const [jobsRes, storagesRes, runsRes, executionsRes] = await Promise.all([
        getJobs(),
        getStorages(),
        getRuns(),
        getJobExecutions()
      ]);
      setItems(jobsRes.items);
      setStorages(storagesRes.items);
      setRuns(runsRes.items);
      setExecutions(executionsRes.items);
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setForm(createInitialJobForm(lastSourceTargetId, lastDestinationTargetId));
    setEditingJobId(null);
  }

  useEffect(() => {
    if (!storages.length) return;
    const storageIds = new Set(storages.map((item) => item.id));
    if (form.sourceTargetId && !storageIds.has(form.sourceTargetId)) {
      setForm((prev) => ({ ...prev, sourceTargetId: "", sourcePath: "" }));
    }
    if (form.destinationTargetId && !storageIds.has(form.destinationTargetId)) {
      setForm((prev) => ({ ...prev, destinationTargetId: "", destinationPath: "" }));
    }
  }, [storages, form.sourceTargetId, form.destinationTargetId]);

  useEffect(() => {
    setForm((prev) => {
      const sourcePath = sourceStorage && !prev.sourcePath ? sourceStorage.basePath : prev.sourcePath;
      const destinationPath =
        destinationStorage && !prev.destinationPath ? destinationStorage.basePath : prev.destinationPath;
      if (sourcePath === prev.sourcePath && destinationPath === prev.destinationPath) return prev;
      return { ...prev, sourcePath, destinationPath };
    });
  }, [sourceStorage?.basePath, destinationStorage?.basePath]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!sourceStorage || !destinationStorage) {
      setError("请选择源存储和目标存储");
      return;
    }

    const payload = buildJobPayload(form, sourceStorage, destinationStorage);

    try {
      if (editingJobId) {
        await updateJob(editingJobId, payload);
      } else {
        await createJob(payload);
      }
      setLastSourceTargetId(form.sourceTargetId);
      setLastDestinationTargetId(form.destinationTargetId);
      setForm(createInitialJobForm(form.sourceTargetId, form.destinationTargetId));
      setEditingJobId(null);
      await load();
      setMessage(editingJobId ? "任务已更新。" : "任务已创建。");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function startEdit(job: BackupJob) {
    setEditingJobId(job.id);
    setForm({
      name: job.name,
      sourceTargetId: job.sourceTargetId,
      sourcePath: job.sourcePath,
      destinationTargetId: job.destinationTargetId,
      destinationPath: job.destinationPath,
      schedule: job.schedule ?? "",
      watchMode: job.watchMode,
      enabled: job.enabled
    });
  }

  useEffect(() => {
    if (!editJobIdFromQuery || !items.length) return;
    const target = items.find((item) => item.id === editJobIdFromQuery);
    if (target) {
      startEdit(target);
      setMessage(`已打开任务“${target.name}”编辑。`);
    } else {
      setError(`未找到要编辑的任务：${editJobIdFromQuery}`);
    }

    const next = new URLSearchParams(searchParams);
    next.delete("editJobId");
    setSearchParams(next, { replace: true });
  }, [editJobIdFromQuery, items, searchParams, setSearchParams]);

  async function confirmDeleteJobs(action: PendingDeleteAction) {
    if (!action.ids.length) return;
    setError("");
    setMessage("");
    if (action.mode === "single") {
      setDeletingJobIds((prev) => new Set(prev).add(action.ids[0]));
    } else {
      setDeletingSelected(true);
    }
    try {
      const results = await Promise.allSettled(action.ids.map((id) => deleteJob(id)));
      const failedIds: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          failedIds.push(action.ids[index]);
        }
      });
      const successIds = action.ids.filter((id) => !failedIds.includes(id));
      const successCount = successIds.length;
      if (successIds.includes(editingJobId ?? "")) {
        resetForm();
      }
      if (successCount > 0) {
        await load();
      }
      if (failedIds.length) {
        setError(`已删除 ${successCount} 个任务，${failedIds.length} 个删除失败。`);
        if (action.mode === "batch") {
          setSelected(new Set(failedIds));
        }
      } else {
        setMessage(action.mode === "single" ? `${action.label}已删除。` : `已删除 ${successCount} 个任务。`);
      }
      setPendingDeleteAction(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      if (action.mode === "single") {
        setDeletingJobIds((prev) => {
          const next = new Set(prev);
          next.delete(action.ids[0]);
          return next;
        });
      } else {
        setDeletingSelected(false);
      }
    }
  }

  async function handleRunJob(job: BackupJob) {
    setError("");
    setMessage("");
    try {
      const result = await runJob(job.id);
      setExecutions((prev) => upsertExecution(prev, result.execution));
      setProgressDialogExecutionId(result.execution.id);
      setMessage(`任务“${job.name}”已开始，可切到后台继续执行。`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleCancelExecution(execution: JobExecution) {
    setError("");
    setMessage("");
    setCancelingExecutionIds((prev) => new Set(prev).add(execution.id));
    try {
      const result = await cancelJobExecution(execution.id);
      setExecutions((prev) => upsertExecution(prev, result.execution));
      setMessage(`任务“${items.find((item) => item.id === execution.jobId)?.name ?? execution.jobId}”已请求停止。`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCancelingExecutionIds((prev) => {
        const next = new Set(prev);
        next.delete(execution.id);
        return next;
      });
    }
  }

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(nextKey);
      setSortAsc(true);
    }
  }

  const sortedItems = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const av = sortKey === "enabled" ? Number(a.enabled) : String(a[sortKey]);
      const bv = sortKey === "enabled" ? Number(b.enabled) : String(b[sortKey]);
      const cmp = String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [items, sortKey, sortAsc]);

  const table = useTablePagination(
    sortedItems,
    search,
    useMemo(
      () =>
        (row: BackupJob, keyword: string) => {
          const src = storageById[row.sourceTargetId];
          const dst = storageById[row.destinationTargetId];
          return `${row.name} ${src?.name ?? row.sourceTargetId} ${row.sourcePath} ${dst?.name ?? row.destinationTargetId} ${row.destinationPath}`
            .toLowerCase()
            .includes(keyword);
        },
      [storageById]
    ),
    { pageSizeStorageKey: "ark-jobs-page-size" }
  );

  const latestRunByJobId = useMemo(() => {
    const out: Record<string, JobRun | undefined> = {};
    for (const run of runs) {
      const existing = out[run.jobId];
      if (!existing) {
        out[run.jobId] = run;
        continue;
      }
      if (new Date(run.finishedAt).getTime() > new Date(existing.finishedAt).getTime()) {
        out[run.jobId] = run;
      }
    }
    return out;
  }, [runs]);

  const activeExecutionByJobId = useMemo(() => {
    const out: Record<string, JobExecution | undefined> = {};
    for (const execution of executions) {
      if (!isExecutionActive(execution)) continue;
      const existing = out[execution.jobId];
      if (!existing) {
        out[execution.jobId] = execution;
        continue;
      }
      if (Date.parse(execution.updatedAt) > Date.parse(existing.updatedAt)) {
        out[execution.jobId] = execution;
      }
    }
    return out;
  }, [executions]);

  const hasActiveExecution = Object.values(activeExecutionByJobId).some(Boolean);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    let disposed = false;
    let timer: number | null = null;

    const scheduleNextPoll = (delay: number) => {
      if (timer !== null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => {
        void poll();
      }, delay);
    };

    const poll = async () => {
      try {
        const executionsRes = await getJobExecutions();
        if (disposed) return;
        setExecutions(executionsRes.items);

        const shouldRefreshRuns = executionsRes.items.some(isExecutionActive);
        if (shouldRefreshRuns) {
          const runsRes = await getRuns();
          if (disposed) return;
          setRuns(runsRes.items);
        }

        scheduleNextPoll(shouldRefreshRuns ? 1200 : 8000);
      } catch {
        if (!disposed) {
          scheduleNextPoll(hasActiveExecution ? 1800 : 10000);
        }
      }
    };

    scheduleNextPoll(hasActiveExecution ? 1200 : 8000);

    return () => {
      disposed = true;
      if (timer !== null) {
        window.clearTimeout(timer);
      }
    };
  }, [hasActiveExecution, isVisible]);

  const executionById = useMemo(() => Object.fromEntries(executions.map((item) => [item.id, item])), [executions]);
  const progressExecution = progressDialogExecutionId ? executionById[progressDialogExecutionId] : undefined;
  const progressJob = progressExecution ? items.find((item) => item.id === progressExecution.jobId) : undefined;
  const progressPercent = progressExecution?.progress.percent ?? 0;
  const progressFileTotalBytes = progressExecution?.progress.currentFileTotalBytes ?? null;
  const progressFileCopiedBytes = progressExecution?.progress.currentFileCopiedBytes ?? null;
  const progressFileStage = progressExecution?.progress.currentFileStage ?? null;
  const progressFilePercent =
    progressFileTotalBytes && progressFileCopiedBytes !== null && progressFileTotalBytes > 0
      ? Math.min(100, Math.round((progressFileCopiedBytes / progressFileTotalBytes) * 100))
      : null;
  const fileSpeedRef = useRef<{ executionId: string; path: string; bytes: number; timeMs: number } | null>(null);
  const [fileWriteSpeed, setFileWriteSpeed] = useState<number | null>(null);
  const progressStatusLabel = progressExecution ? getExecutionStatusLabel(progressExecution) : "";
  const progressStatusClass =
    progressExecution?.status === "failed"
      ? "mp-status-danger"
      : progressExecution?.status === "canceled"
        ? "mp-status-warning"
      : progressExecution?.status === "success"
        ? "mp-status-success"
        : "mp-status-warning";
  const progressCanBackground = Boolean(progressExecution && isExecutionActive(progressExecution));
  const enabledCount = items.filter((item) => item.enabled).length;
  const watchModeCount = items.filter((item) => item.watchMode).length;

  useEffect(() => {
    if (!progressExecution || progressFileCopiedBytes === null) {
      setFileWriteSpeed(null);
      fileSpeedRef.current = null;
      return;
    }
    const currentPath = progressExecution.progress.currentPath ?? "";
    const now = Date.now();
    const prev = fileSpeedRef.current;
    if (prev && prev.executionId === progressExecution.id && prev.path === currentPath) {
      const deltaBytes = progressFileCopiedBytes - prev.bytes;
      const deltaMs = now - prev.timeMs;
      if (deltaBytes >= 0 && deltaMs > 0) {
        setFileWriteSpeed((deltaBytes * 1000) / deltaMs);
      }
    } else {
      setFileWriteSpeed(null);
    }
    fileSpeedRef.current = {
      executionId: progressExecution.id,
      path: currentPath,
      bytes: progressFileCopiedBytes,
      timeMs: now
    };
  }, [progressExecution?.id, progressExecution?.progress.currentPath, progressFileCopiedBytes]);

  const allCurrentPageSelected = table.paged.length > 0 && table.paged.every((j) => selected.has(j.id));

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

      <div className="grid gap-4 md:grid-cols-[360px_minmax(0,1fr)]">
        <SectionCard
          title={editingJobId ? "编辑任务" : "新增任务"}
          description="配置源存储、目标存储、计划时间和监听模式。"
          className="md:sticky md:top-4 md:self-start"
          variant="panelSoft"
          right={editingJobId ? <span className="mp-chip mp-chip-warning">编辑中</span> : undefined}
        >
          <form id="job-form" onSubmit={(e) => void onSubmit(e)} className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="job-name" className="text-sm font-medium">
                任务名称
              </label>
              <input
                id="job-name"
                className="mp-input"
                placeholder="例如：每日增量备份"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
              <p className="text-xs mp-muted">建议按“来源 + 目标 + 频率”命名，后续筛选更清晰。</p>
            </div>

            <div className="space-y-1">
              <label htmlFor="job-source-target" className="text-sm font-medium">
                源存储
              </label>
              <select
                id="job-source-target"
                className="mp-select"
                value={form.sourceTargetId}
                onChange={(e) => {
                  const next = e.target.value;
                  const nextStorage = storages.find((storage) => storage.id === next);
                  setForm((p) => ({ ...p, sourceTargetId: next, sourcePath: nextStorage?.basePath ?? "" }));
                  if (next) {
                    setLastSourceTargetId(next);
                  }
                }}
                required
              >
                <option value="">选择备份源存储</option>
                {storages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({getStorageTypeLabel(s.type)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="job-destination-target" className="text-sm font-medium">
                目标存储
              </label>
              <select
                id="job-destination-target"
                className="mp-select"
                value={form.destinationTargetId}
                onChange={(e) => {
                  const next = e.target.value;
                  const nextStorage = storages.find((storage) => storage.id === next);
                  setForm((p) => ({ ...p, destinationTargetId: next, destinationPath: nextStorage?.basePath ?? "" }));
                  if (next) {
                    setLastDestinationTargetId(next);
                  }
                }}
                required
              >
                <option value="">选择备份目标存储</option>
                {storages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({getStorageTypeLabel(s.type)})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="job-source-path" className="text-sm font-medium">
                源目录
              </label>
              <PathPicker
                id="job-source-path"
                value={form.sourcePath}
                onChange={(value) => setForm((p) => ({ ...p, sourcePath: value }))}
                browse={browseSourcePath}
                disabled={!sourceStorage}
                browseDisabled={!canBrowseSourcePath}
                required
                placeholder={sourceStorage?.basePath ?? "请选择源存储"}
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label htmlFor="job-destination-path" className="text-sm font-medium">
                目标目录
              </label>
              <PathPicker
                id="job-destination-path"
                value={form.destinationPath}
                onChange={(value) => setForm((p) => ({ ...p, destinationPath: value }))}
                browse={browseDestinationPath}
                disabled={!destinationStorage}
                browseDisabled={!canBrowseDestinationPath}
                required
                placeholder={destinationStorage?.basePath ?? "请选择目标存储"}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="job-schedule" className="text-sm font-medium">
                cron 表达式
              </label>
              <input
                id="job-schedule"
                className="mp-input"
                placeholder="例如：0 2 * * *"
                value={form.schedule ?? ""}
                onChange={(e) => setForm((p) => ({ ...p, schedule: e.target.value }))}
              />
              <p className="text-xs mp-muted">留空表示仅依赖实时监听；填写后会按 cron 周期执行。</p>
            </div>
            <div className="mp-subtle-card flex flex-wrap items-center gap-4 p-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.watchMode}
                  onChange={(e) => setForm((p) => ({ ...p, watchMode: e.target.checked }))}
                />
                实时监听
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))}
                />
                启用
              </label>
            </div>

            <div className="mp-subtle-card grid gap-3 p-3 sm:col-span-2 sm:grid-cols-2">
              <div className="min-w-0">
                <p className="mp-kicker">源存储预览</p>
                <p className="mt-1 text-sm font-medium">{sourceStorage?.name ?? "未选择"}</p>
                <p className="mt-1 break-all text-xs mp-muted">{form.sourcePath || sourceStorage?.basePath || "请选择源存储"}</p>
              </div>
              <div className="min-w-0">
                <p className="mp-kicker">目标存储预览</p>
                <p className="mt-1 text-sm font-medium">{destinationStorage?.name ?? "未选择"}</p>
                <p className="mt-1 break-all text-xs mp-muted">
                  {form.destinationPath || destinationStorage?.basePath || "请选择目标存储"}
                </p>
              </div>
            </div>

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" variant="primary" className="flex-1">
                {editingJobId ? "保存修改" : "新增任务"}
              </Button>
              {editingJobId ? (
                <Button type="button" onClick={resetForm}>
                  取消编辑
                </Button>
              ) : null}
            </div>
          </form>
        </SectionCard>

      <SectionCard
        title="任务列表"
        description="支持 / 快捷键聚焦搜索，Esc 清空搜索"
        right={
          <>
            <span className="mp-chip">总任务 {items.length}</span>
            <span className="mp-chip mp-chip-success">已启用 {enabledCount}</span>
            <span className="mp-chip">实时监听 {watchModeCount}</span>
            {hasActiveExecution ? (
              <span className="mp-chip mp-chip-warning">执行中 {Object.values(activeExecutionByJobId).filter(Boolean).length}</span>
            ) : null}
          </>
        }
        className="md:min-h-0 md:flex-1 md:flex md:flex-col"
      >
        <div className="mp-toolbar">
          <TableToolbar
            search={search}
            onSearchChange={setSearch}
            pageSize={table.pageSize}
            onPageSizeChange={table.setPageSize}
            totalItems={table.totalItems}
          />
          <Button
            variant="danger"
            disabled={!selected.size}
            busy={deletingSelected}
            onClick={() =>
              setPendingDeleteAction({
                mode: "batch",
                ids: [...selected],
                label: `选中的 ${selected.size} 个任务`
              })
            }
          >
            {deletingSelected ? "删除中..." : `批量删除 (${selected.size})`}
          </Button>
        </div>

        {!table.totalItems ? (
          <EmptyState
            title="暂无任务"
            description="先创建一个备份任务（定时或实时监听），然后可在这里查看状态与历史。"
            action={
              <Button
                variant="primary"
                onClick={() => {
                  document.getElementById("job-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
              >
                去新增任务
              </Button>
            }
          />
        ) : (
          <>
            <div className="space-y-2 md:hidden">
          {table.paged.map((j) => {
            const latest = latestRunByJobId[j.id];
            const activeExecution = activeExecutionByJobId[j.id];
            const running = Boolean(activeExecution);
            const src = storageById[j.sourceTargetId];
            const dst = storageById[j.destinationTargetId];
            return (
              <article key={j.id} className="mp-mobile-card">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(j.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(j.id);
                      else next.delete(j.id);
                      setSelected(next);
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="truncate text-sm font-semibold">{j.name}</h4>
                      <span className={j.enabled ? "text-sm mp-status-success" : "text-sm mp-status-danger"}>{j.enabled ? "启用" : "停用"}</span>
                    </div>
                    <p className="mt-0.5 text-sm mp-muted">{j.watchMode ? "实时监听" : "仅定时"}</p>
                  </div>
                </div>

                <dl className="mp-kv mt-3">
                  <dt>源存储</dt>
                  <dd>
                    <div>{src?.name ?? j.sourceTargetId}</div>
                    <div className="break-all mp-muted">{j.sourcePath}</div>
                  </dd>
                  <dt>目标存储</dt>
                  <dd>
                    <div>{dst?.name ?? j.destinationTargetId}</div>
                    <div className="break-all mp-muted">{j.destinationPath}</div>
                  </dd>
                  <dt>最近执行</dt>
                  <dd>
                    {activeExecution ? (
                      <>
                        <span className="mp-status-warning">{getExecutionStatusLabel(activeExecution)}</span>
                        <span className="ml-2 font-medium">{activeExecution.progress.percent}%</span>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--ark-line)]">
                          <div
                            className="h-full rounded-full bg-[var(--ark-primary)] transition-all"
                            style={{ width: `${activeExecution.progress.percent}%` }}
                          />
                        </div>
                      </>
                    ) : latest ? (
                      <>
                        <span className={getRunStatusClass(latest.status)}>{getRunStatusLabel(latest.status)}</span>
                        <span className="ml-2 mp-muted">{new Date(latest.finishedAt).toLocaleString()}</span>
                      </>
                    ) : (
                      <span className="mp-muted">未执行</span>
                    )}
                  </dd>
                </dl>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="mp-btn"
                    disabled={!j.enabled || running}
                    onClick={() => void handleRunJob(j)}
                  >
                    {running ? (activeExecution?.status === "queued" ? "排队中" : "执行中") : "立即执行"}
                  </button>
                  {activeExecution ? (
                    <button
                      type="button"
                      className="mp-btn"
                      onClick={() => {
                        setProgressDialogExecutionId(activeExecution.id);
                      }}
                    >
                      查看进度
                    </button>
                  ) : null}
                  {activeExecution ? (
                    <button
                      type="button"
                      className="mp-btn"
                      disabled={cancelingExecutionIds.has(activeExecution.id)}
                      onClick={() => void handleCancelExecution(activeExecution)}
                    >
                      {cancelingExecutionIds.has(activeExecution.id) ? "停止中" : "停止"}
                    </button>
                  ) : null}
                  <button type="button" className="mp-btn" onClick={() => startEdit(j)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="mp-btn"
                    disabled={deletingJobIds.has(j.id)}
                    onClick={() =>
                      setPendingDeleteAction({
                        mode: "single",
                        ids: [j.id],
                        label: `任务“${j.name}”`
                      })
                    }
                  >
                    {deletingJobIds.has(j.id) ? "删除中" : "删除"}
                  </button>
                </div>
              </article>
            );
          })}
          {!table.paged.length ? <p className="py-4 text-center text-sm mp-muted">暂无数据</p> : null}
        </div>

        <div className="hidden md:block md:min-h-0 md:flex-1 md:overflow-auto">
          <div className="mp-table-shell">
            <table className="mp-data-table min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ark-line)] text-left text-sm mp-muted">
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allCurrentPageSelected}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) table.paged.forEach((j) => next.add(j.id));
                      else table.paged.forEach((j) => next.delete(j.id));
                      setSelected(next);
                    }}
                  />
                </th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "name", sortAsc)}>
                  <SortableHeader label="任务" active={sortKey === "name"} ascending={sortAsc} onToggle={() => toggleSort("name")} />
                </th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "sourceTargetId", sortAsc)}>
                  <SortableHeader
                    label="源存储"
                    active={sortKey === "sourceTargetId"}
                    ascending={sortAsc}
                    onToggle={() => toggleSort("sourceTargetId")}
                  />
                </th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "destinationTargetId", sortAsc)}>
                  <SortableHeader
                    label="目标存储"
                    active={sortKey === "destinationTargetId"}
                    ascending={sortAsc}
                    onToggle={() => toggleSort("destinationTargetId")}
                  />
                </th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "enabled", sortAsc)}>
                  <SortableHeader
                    label="状态"
                    active={sortKey === "enabled"}
                    ascending={sortAsc}
                    onToggle={() => toggleSort("enabled")}
                  />
                </th>
                <th className="px-2 py-2">监听</th>
                <th className="px-2 py-2">最近执行</th>
                <th className="px-2 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {table.paged.map((j) => {
                const latest = latestRunByJobId[j.id];
                const activeExecution = activeExecutionByJobId[j.id];
                const running = Boolean(activeExecution);
                const src = storageById[j.sourceTargetId];
                const dst = storageById[j.destinationTargetId];
                return (
                  <tr key={j.id} className="border-b border-[var(--ark-line)]/70">
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(j.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(j.id);
                          else next.delete(j.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="px-2 py-2 font-medium">{j.name}</td>
                    <td className="px-2 py-2 text-sm">
                      <div>{src?.name ?? j.sourceTargetId}</div>
                      <div className="break-all mp-muted">{j.sourcePath}</div>
                    </td>
                    <td className="px-2 py-2 text-sm">
                      <div>{dst?.name ?? j.destinationTargetId}</div>
                      <div className="break-all mp-muted">{j.destinationPath}</div>
                    </td>
                    <td className="px-2 py-2">
                      <span className={j.enabled ? "mp-status-success" : "mp-status-danger"}>{j.enabled ? "启用" : "停用"}</span>
                    </td>
                    <td className="px-2 py-2">{j.watchMode ? "实时监听" : "关闭"}</td>
                    <td className="px-2 py-2 text-sm">
                      {activeExecution ? (
                        <div>
                          <div className="mp-status-warning">
                            {getExecutionStatusLabel(activeExecution)} {activeExecution.progress.percent}%
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--ark-line)]">
                            <div
                              className="h-full rounded-full bg-[var(--ark-primary)] transition-all"
                              style={{ width: `${activeExecution.progress.percent}%` }}
                            />
                          </div>
                        </div>
                      ) : latest ? (
                        <div>
                          <div className={getRunStatusClass(latest.status)}>{getRunStatusLabel(latest.status)}</div>
                          <div className="mp-muted">{new Date(latest.finishedAt).toLocaleString()}</div>
                        </div>
                      ) : (
                        <span className="mp-muted">未执行</span>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="mp-btn"
                          disabled={!j.enabled || running}
                          onClick={() => void handleRunJob(j)}
                        >
                          {running ? (activeExecution?.status === "queued" ? "排队中" : "执行中") : "立即执行"}
                        </button>
                        {activeExecution ? (
                          <button
                            type="button"
                            className="mp-btn"
                            onClick={() => {
                              setProgressDialogExecutionId(activeExecution.id);
                            }}
                          >
                            查看进度
                          </button>
                        ) : null}
                        {activeExecution ? (
                          <button
                            type="button"
                            className="mp-btn"
                            disabled={cancelingExecutionIds.has(activeExecution.id)}
                            onClick={() => void handleCancelExecution(activeExecution)}
                          >
                            {cancelingExecutionIds.has(activeExecution.id) ? "停止中" : "停止"}
                          </button>
                        ) : null}
                        <button type="button" className="mp-btn" onClick={() => startEdit(j)}>
                          编辑
                        </button>
                        <button
                          type="button"
                          className="mp-btn"
                          disabled={deletingJobIds.has(j.id)}
                          onClick={() =>
                            setPendingDeleteAction({
                              mode: "single",
                              ids: [j.id],
                              label: `任务“${j.name}”`
                            })
                          }
                        >
                          {deletingJobIds.has(j.id) ? "删除中" : "删除"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!table.paged.length ? (
                <tr>
                  <td className="px-2 py-4 text-center text-sm mp-muted" colSpan={8}>暂无数据</td>
                </tr>
              ) : null}
            </tbody>
            </table>
          </div>
        </div>

            <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
          </>
        )}
      </SectionCard>
      </div>

      {progressExecution ? (
        <div
          className="mp-overlay fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => {
            if (progressCanBackground) {
              setProgressDialogExecutionId(null);
              setMessage("任务已切到后台执行，可在任务列表查看实时进度。");
            }
          }}
        >
          <div className="mp-panel w-full max-w-lg p-4" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">任务执行进度</h3>
                <p className="mt-1 text-sm mp-muted">{progressJob?.name ?? progressExecution.jobId}</p>
              </div>
              <span className={`text-sm font-medium ${progressStatusClass}`}>{progressStatusLabel}</span>
            </div>

            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="mp-muted">进度</span>
              <span className="font-semibold">{progressPercent}%</span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--ark-line)]">
              <div
                className="h-full rounded-full bg-[var(--ark-primary)] transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-md border border-[var(--ark-line)] p-2">
                <p className="text-xs mp-muted">已扫描</p>
                <p className="font-semibold">{progressExecution.progress.scannedCount}</p>
              </div>
              <div className="rounded-md border border-[var(--ark-line)] p-2">
                <p className="text-xs mp-muted">已同步</p>
                <p className="font-semibold">{progressExecution.progress.copiedCount}</p>
              </div>
              <div className="rounded-md border border-[var(--ark-line)] p-2">
                <p className="text-xs mp-muted">已跳过</p>
                <p className="font-semibold">{progressExecution.progress.skippedCount}</p>
              </div>
              <div className="rounded-md border border-[var(--ark-line)] p-2">
                <p className="text-xs mp-muted">失败</p>
                <p className="font-semibold text-[var(--ark-danger-text)]">{progressExecution.progress.failedCount}</p>
              </div>
            </div>
            {progressExecution.progress.currentPath ? (
              <>
                <p className="mt-2 break-all text-xs mp-muted">
                  当前文件: {progressExecution.progress.currentPath}
                  {progressFileTotalBytes !== null && progressFileCopiedBytes !== null
                    ? ` · ${formatBytes(progressFileCopiedBytes)} / ${formatBytes(progressFileTotalBytes)}`
                    : ""}
                  {progressFileStage === "post_processing" ? " · 后处理" : progressFilePercent !== null ? ` · ${progressFilePercent}%` : ""}
                  {progressFileStage === "post_processing"
                    ? " · 元数据写入中"
                    : fileWriteSpeed !== null
                      ? ` · ${formatBytes(fileWriteSpeed)} /s`
                      : ""}
                </p>
                {progressFilePercent !== null ? (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--ark-line)]">
                    <div
                      className="h-full rounded-full bg-[var(--ark-primary)] transition-all duration-200"
                      style={{ width: `${progressFilePercent}%` }}
                    />
                  </div>
                ) : null}
              </>
            ) : null}
            {progressExecution.error ? <p className="mp-error mt-3">{progressExecution.error}</p> : null}

            <div className="mt-4 flex justify-end gap-2">
              {progressExecution && isExecutionActive(progressExecution) ? (
                <button
                  type="button"
                  className="mp-btn"
                  disabled={cancelingExecutionIds.has(progressExecution.id)}
                  onClick={() => void handleCancelExecution(progressExecution)}
                >
                  {cancelingExecutionIds.has(progressExecution.id) ? "停止中" : "停止任务"}
                </button>
              ) : null}
              {progressCanBackground ? (
                <button
                  type="button"
                  className="mp-btn"
                  onClick={() => {
                    setProgressDialogExecutionId(null);
                    setMessage("任务已切到后台执行，可在任务列表查看实时进度。");
                  }}
                >
                  后台执行
                </button>
              ) : (
                <button
                  type="button"
                  className="mp-btn mp-btn-primary"
                  onClick={() => {
                    setProgressDialogExecutionId(null);
                  }}
                >
                  关闭
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={Boolean(pendingDeleteAction)}
        title="删除任务"
        description={
          pendingDeleteAction?.mode === "single"
            ? `将删除${pendingDeleteAction.label}，删除后不可恢复。`
            : `将删除 ${pendingDeleteAction?.ids.length ?? 0} 个任务，删除后不可恢复。`
        }
        confirmText="确认删除"
        destructive
        busy={
          pendingDeleteAction?.mode === "single"
            ? Boolean(pendingDeleteAction.ids[0] && deletingJobIds.has(pendingDeleteAction.ids[0]))
            : deletingSelected
        }
        onCancel={() => setPendingDeleteAction(null)}
        onConfirm={() => {
          if (!pendingDeleteAction) return;
          void confirmDeleteJobs(pendingDeleteAction);
        }}
      />
    </section>
  );
}
