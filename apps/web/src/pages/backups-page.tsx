import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../components/data/data-table";
import { MetricTile } from "../components/data/metric-tile";
import { MobileList } from "../components/data/mobile-list";
import { StatusBadge } from "../components/data/status-badge";
import { ConfirmDialog } from "../components/confirm-dialog";
import { InlineAlert } from "../components/inline-alert";
import { TablePagination } from "../components/table/table-pagination";
import { SortableHeader } from "../components/table/sortable-header";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { PageHeader } from "../components/ui/page-header";
import { deleteRun, getJobs, getRuns } from "../lib/api";
import type { BackupJob, JobRun } from "../types/api";
import { buildRunSummaryTiles, getRunTone } from "./records-page-model";

type SortKey = "finishedAt" | "status" | "copiedCount";
type PendingDeleteAction = {
  mode: "single" | "batch";
  ids: string[];
  label: string;
};

function getTriggerLabel(trigger: JobRun["trigger"]) {
  if (trigger === "manual") return "手动执行";
  if (trigger === "watch") return "实时监听";
  if (trigger === "schedule") return "定时任务";
  return "未知";
}

function getRunStatusLabel(status: JobRun["status"]): string {
  if (status === "success") return "成功";
  if (status === "canceled") return "已取消";
  return "失败";
}

function getSummary(run: JobRun) {
  return `照片 ${run.photoCount ?? 0}，视频 ${run.videoCount ?? 0}，Live Photo ${run.livePhotoPairCount ?? 0}`;
}

function getAriaSort(active: boolean, asc: boolean): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return asc ? "ascending" : "descending";
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function getDurationMs(run: JobRun): number | null {
  const startedAt = new Date(run.startedAt).getTime();
  const finishedAt = new Date(run.finishedAt).getTime();
  if (!Number.isFinite(startedAt) || !Number.isFinite(finishedAt) || finishedAt < startedAt) return null;
  return finishedAt - startedAt;
}

function formatDuration(durationMs: number | null) {
  if (durationMs === null) return "-";
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds}s`;
}

function buildFailureSection(run: JobRun) {
  const shouldShow = run.status === "failed" || run.failedCount > 0 || run.errors.length > 0;
  if (!shouldShow) return null;

  return (
    <div className="mt-3 rounded-md border border-[var(--ark-danger-line)] bg-[var(--ark-danger-bg)] p-3 text-sm text-[var(--ark-danger-text)]">
      <div className="font-semibold">失败明细</div>
      {run.message ? <p className="mt-1 break-all">{run.message}</p> : null}
      {run.errors.length ? (
        <ul className="mt-2 space-y-1">
          {run.errors.slice(0, 3).map((item, index) => (
            <li key={`${item.path}-${index}`} className="break-all">
              {item.path} - {item.error}
            </li>
          ))}
        </ul>
      ) : null}
      {run.errors.length > 3 ? <p className="mt-2">还有 {run.errors.length - 3} 条错误未展示</p> : null}
    </div>
  );
}

function buildRunSearchText(run: JobRun, job?: BackupJob) {
  return [
    job?.name ?? run.jobId,
    run.status,
    getRunStatusLabel(run.status),
    getTriggerLabel(run.trigger),
    run.message ?? "",
    ...run.errors.flatMap((item) => [item.path, item.error]),
    ...run.copiedSamples
  ]
    .join(" ")
    .toLowerCase();
}

export function BackupsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("finishedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingRunIds, setDeletingRunIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<PendingDeleteAction | null>(null);
  const [message, setMessage] = useState("");

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  async function load() {
    setLoading(true);
    try {
      const [jobsRes, runsRes] = await Promise.all([getJobs(), getRuns()]);
      setJobs(jobsRes.items);
      setRuns(runsRes.items);
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) setSortAsc((v) => !v);
    else {
      setSortKey(nextKey);
      setSortAsc(true);
    }
  }

  function toggleRunSelected(runId: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(runId);
      else next.delete(runId);
      return next;
    });
  }

  async function handleDeleteRuns(action: PendingDeleteAction) {
    if (!action.ids.length) return;
    setError("");
    setMessage("");
    setDeletingRunIds((prev) => {
      const next = new Set(prev);
      action.ids.forEach((id) => next.add(id));
      return next;
    });
    if (action.mode === "batch") {
      setDeletingSelected(true);
    }
    try {
      const results = await Promise.allSettled(action.ids.map((id) => deleteRun(id)));
      const failedIds: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          failedIds.push(action.ids[index]);
        }
      });
      const successIds = action.ids.filter((id) => !failedIds.includes(id));
      const successCount = successIds.length;

      if (successCount > 0) {
        setRuns((prev) => prev.filter((run) => !successIds.includes(run.id)));
        setSelected((prev) => {
          const next = new Set(prev);
          successIds.forEach((id) => next.delete(id));
          return next;
        });
      }

      if (failedIds.length) {
        setError(`已删除 ${successCount} 条记录，${failedIds.length} 条删除失败。`);
        if (action.mode === "batch") {
          setSelected(new Set(failedIds));
        }
      } else {
        setMessage(action.mode === "single" ? `${action.label}已删除。` : `已删除 ${successCount} 条记录。`);
      }
      setPendingDeleteAction(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingRunIds((prev) => {
        const next = new Set(prev);
        action.ids.forEach((id) => next.delete(id));
        return next;
      });
      if (action.mode === "batch") {
        setDeletingSelected(false);
      }
    }
  }

  const sortedRuns = useMemo(() => {
    const arr = [...runs];
    arr.sort((a, b) => {
      const av = sortKey === "finishedAt" ? new Date(a.finishedAt).getTime() : a[sortKey];
      const bv = sortKey === "finishedAt" ? new Date(b.finishedAt).getTime() : b[sortKey];
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [runs, sortKey, sortAsc]);

  const table = useTablePagination(
    sortedRuns,
    search,
    useMemo(
      () => (row: JobRun, keyword: string) => buildRunSearchText(row, jobById[row.jobId]).includes(keyword),
      [jobById]
    ),
    { pageSizeStorageKey: "ark-runs-page-size" }
  );

  const allCurrentPageSelected = table.paged.length > 0 && table.paged.every((run) => selected.has(run.id));
  const successCount = runs.filter((run) => run.status === "success").length;
  const canceledCount = runs.filter((run) => run.status === "canceled").length;
  const failedCount = runs.filter((run) => run.status === "failed").length;
  const summaryTiles = buildRunSummaryTiles(
    runs.map((run) => ({
      status: run.status,
      copiedCount: run.copiedCount,
      skippedCount: run.skippedCount,
      errorCount: run.failedCount,
      durationMs: getDurationMs(run)
    }))
  );

  function renderRunFacts(run: JobRun) {
    return (
      <dl className="mp-kv">
        <dt>结束时间</dt>
        <dd>{formatDate(run.finishedAt)}</dd>
        <dt>触发方式</dt>
        <dd>{getTriggerLabel(run.trigger)}</dd>
        <dt>耗时</dt>
        <dd>{formatDuration(getDurationMs(run))}</dd>
        <dt>成功/失败</dt>
        <dd>
          <span className="mp-status-success">{run.copiedCount}</span>
          <span className="mp-muted">/</span>
          <span className="mp-status-danger">{run.failedCount}</span>
        </dd>
      </dl>
    );
  }

  function renderRunDetails(run: JobRun) {
    return (
      <div className="min-w-[280px]">
        <p>{getSummary(run)}</p>
        <p className="mt-1 text-xs mp-muted">
          扫描 {run.scannedCount}，跳过 {run.skippedCount}，样本 {run.copiedSamples.length}
        </p>
        {run.copiedSamples.length ? (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-medium text-[var(--ark-info)]">查看复制样本</summary>
            <ul className="mt-1 space-y-1 mp-muted">
              {run.copiedSamples.slice(0, 4).map((sample) => (
                <li key={sample} className="break-all">
                  {sample}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {buildFailureSection(run)}
      </div>
    );
  }

  function renderRunActions(run: JobRun) {
    const job = jobById[run.jobId];
    const deleting = deletingRunIds.has(run.id);
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {job ? (
          <Button size="sm" onClick={() => navigate(`/sync?tab=jobs&editJobId=${encodeURIComponent(job.id)}`)}>
            查看任务
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="danger"
          disabled={deleting}
          onClick={() =>
            setPendingDeleteAction({
              mode: "single",
              ids: [run.id],
              label: "执行记录"
            })
          }
        >
          {deleting ? "删除中" : "删除"}
        </Button>
      </div>
    );
  }

  const columns: DataTableColumn<JobRun>[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          aria-label="选择当前页执行记录"
          checked={allCurrentPageSelected}
          onChange={(e) => {
            const next = new Set(selected);
            if (e.target.checked) table.paged.forEach((run) => next.add(run.id));
            else table.paged.forEach((run) => next.delete(run.id));
            setSelected(next);
          }}
        />
      ),
      render: (run) => (
        <input
          type="checkbox"
          aria-label={`选择执行记录 ${run.id}`}
          checked={selected.has(run.id)}
          onChange={(e) => toggleRunSelected(run.id, e.target.checked)}
        />
      ),
      className: "w-10 px-2 py-2 align-top"
    },
    {
      key: "job",
      header: "任务",
      render: (run) => (
        <div className="min-w-[160px]">
          <div className="font-medium">{jobById[run.jobId]?.name ?? run.jobId}</div>
          <div className="mt-1 text-xs mp-muted">{run.id}</div>
        </div>
      ),
      className: "px-2 py-2 align-top"
    },
    {
      key: "finishedAt",
      header: (
        <SortableHeader
          label="结束时间"
          active={sortKey === "finishedAt"}
          ascending={sortAsc}
          onToggle={() => toggleSort("finishedAt")}
        />
      ),
      render: (run) => <span>{formatDate(run.finishedAt)}</span>,
      className: "px-2 py-2 align-top whitespace-nowrap",
      headerProps: { "aria-sort": getAriaSort(sortKey === "finishedAt", sortAsc) }
    },
    {
      key: "trigger",
      header: "触发",
      render: (run) => getTriggerLabel(run.trigger),
      className: "px-2 py-2 align-top whitespace-nowrap"
    },
    {
      key: "status",
      header: (
        <SortableHeader label="状态" active={sortKey === "status"} ascending={sortAsc} onToggle={() => toggleSort("status")} />
      ),
      render: (run) => <StatusBadge tone={getRunTone(run.status)}>{getRunStatusLabel(run.status)}</StatusBadge>,
      className: "px-2 py-2 align-top whitespace-nowrap",
      headerProps: { "aria-sort": getAriaSort(sortKey === "status", sortAsc) }
    },
    {
      key: "copiedCount",
      header: (
        <SortableHeader
          label="成功/失败"
          active={sortKey === "copiedCount"}
          ascending={sortAsc}
          onToggle={() => toggleSort("copiedCount")}
        />
      ),
      render: (run) => (
        <div className="whitespace-nowrap">
          <span className="mp-status-success">{run.copiedCount}</span>
          <span className="mp-muted">/</span>
          <span className="mp-status-danger">{run.failedCount}</span>
        </div>
      ),
      className: "px-2 py-2 align-top",
      headerProps: { "aria-sort": getAriaSort(sortKey === "copiedCount", sortAsc) }
    },
    {
      key: "details",
      header: "详情",
      render: renderRunDetails,
      className: "px-2 py-2 align-top"
    },
    {
      key: "actions",
      header: "操作",
      render: renderRunActions,
      className: "px-2 py-2 align-top text-right"
    }
  ];

  const filteredEmpty = (
    <div className="hidden rounded-md border border-dashed border-[var(--ark-line)] p-6 text-center text-sm mp-muted md:block">
      暂无匹配记录
    </div>
  );

  return (
    <section className="flex min-h-0 flex-col gap-3 pb-4 md:h-full">
      <PageHeader
        eyebrow="Audit Records"
        title="记录"
        description="查看同步执行历史、失败明细和任务审计记录。"
        chips={
          <>
            <StatusBadge>总记录 {runs.length}</StatusBadge>
            <StatusBadge tone="success">成功 {successCount}</StatusBadge>
            {failedCount > 0 ? <StatusBadge tone="danger">失败 {failedCount}</StatusBadge> : null}
            {canceledCount > 0 ? <StatusBadge tone="warning">已取消 {canceledCount}</StatusBadge> : null}
            {loading ? <StatusBadge tone="info">加载中</StatusBadge> : null}
          </>
        }
        actions={
          <Button variant="primary" onClick={() => navigate("/sync?tab=jobs")}>
            新建同步任务
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {summaryTiles.map((tile) => (
          <MetricTile key={tile.key} label={tile.label} value={tile.value} tone={tile.tone} />
        ))}
      </div>

      <section className="mp-panel min-h-0 p-4 md:flex md:flex-1 md:flex-col">
        <div className="flex flex-col gap-3">
          {message ? (
            <InlineAlert tone="success" onClose={() => setMessage("")} autoCloseMs={5000}>
              {message}
            </InlineAlert>
          ) : null}
          {error ? (
            <InlineAlert tone="error" onClose={() => setError("")} autoCloseMs={8000}>
              {error}
            </InlineAlert>
          ) : null}
        </div>

        <div className={`${message || error ? "mt-3" : ""} flex flex-col gap-2 md:flex-row md:items-start md:justify-between`}>
          <TableToolbar
            title="执行记录"
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
                label: `选中的 ${selected.size} 条记录`
              })
            }
          >
            {deletingSelected ? "删除中..." : `批量删除 (${selected.size})`}
          </Button>
        </div>

        {!loading && !runs.length ? (
          <EmptyState
            title="暂无执行记录"
            description="先创建同步任务并执行一次，这里会展示执行状态、文件统计与错误信息。"
            action={
              <Button variant="primary" onClick={() => navigate("/sync?tab=jobs")}>
                去创建同步任务
              </Button>
            }
          />
        ) : (
          <>
            {loading && !runs.length ? <p className="py-10 text-center text-sm mp-muted">正在读取执行记录...</p> : null}
            {runs.length ? (
              <>
                <MobileList
                  items={table.paged}
                  getKey={(run) => run.id}
                  empty={<p className="py-6 text-center text-sm mp-muted md:hidden">暂无匹配记录</p>}
                  renderItem={(run) => {
                    const job = jobById[run.jobId];
                    return (
                      <article className="mp-mobile-card">
                        <div className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            aria-label={`选择执行记录 ${run.id}`}
                            checked={selected.has(run.id)}
                            onChange={(e) => toggleRunSelected(run.id, e.target.checked)}
                          />
                          <div className="min-w-0 flex-1">
                            <h4 className="truncate text-sm font-semibold">{job?.name ?? run.jobId}</h4>
                            <p className="mt-1 text-xs mp-muted">{run.id}</p>
                          </div>
                          <StatusBadge tone={getRunTone(run.status)}>{getRunStatusLabel(run.status)}</StatusBadge>
                        </div>

                        <div className="mt-3">{renderRunFacts(run)}</div>
                        <p className="mt-3 text-sm">{getSummary(run)}</p>
                        {run.copiedSamples.length ? (
                          <details className="mt-2 text-xs">
                            <summary className="cursor-pointer font-medium text-[var(--ark-info)]">查看复制样本</summary>
                            <ul className="mt-1 space-y-1 mp-muted">
                              {run.copiedSamples.slice(0, 3).map((sample) => (
                                <li key={sample} className="break-all">
                                  {sample}
                                </li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                        {buildFailureSection(run)}
                        <div className="mt-3">{renderRunActions(run)}</div>
                      </article>
                    );
                  }}
                />
                <div className="md:min-h-0 md:flex-1 md:overflow-auto">
                  <DataTable items={table.paged} columns={columns} getKey={(run) => run.id} empty={filteredEmpty} />
                </div>
                <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
              </>
            ) : null}
          </>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(pendingDeleteAction)}
        title="删除执行记录"
        description={
          pendingDeleteAction?.mode === "single"
            ? `将删除${pendingDeleteAction.label}，该操作不可恢复。`
            : `将删除 ${pendingDeleteAction?.ids.length ?? 0} 条记录，该操作不可恢复。`
        }
        confirmText="确认删除"
        destructive
        busy={
          pendingDeleteAction?.mode === "single"
            ? Boolean(pendingDeleteAction.ids[0] && deletingRunIds.has(pendingDeleteAction.ids[0]))
            : deletingSelected
        }
        onCancel={() => setPendingDeleteAction(null)}
        onConfirm={() => {
          if (!pendingDeleteAction) return;
          void handleDeleteRuns(pendingDeleteAction);
        }}
      />
    </section>
  );
}
