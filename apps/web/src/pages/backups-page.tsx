import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/confirm-dialog";
import { TablePagination } from "../components/table/table-pagination";
import { SortableHeader } from "../components/table/sortable-header";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { deleteRun, getJobs, getRuns } from "../lib/api";
import type { BackupJob, JobRun } from "../types/api";

type SortKey = "finishedAt" | "status" | "copiedCount";

function getTriggerLabel(trigger: JobRun["trigger"]) {
  if (trigger === "manual") return "手动执行";
  if (trigger === "watch") return "实时监听";
  if (trigger === "schedule") return "定时任务";
  return "未知";
}

function getSummary(run: JobRun) {
  return `照片 ${run.photoCount ?? 0}，视频 ${run.videoCount ?? 0}，Live Photo ${run.livePhotoPairCount ?? 0}`;
}

function getAriaSort(active: boolean, asc: boolean): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return asc ? "ascending" : "descending";
}

export function BackupsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("finishedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [deletingRunIds, setDeletingRunIds] = useState<Set<string>>(new Set());
  const [pendingDeleteRunId, setPendingDeleteRunId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  async function load() {
    try {
      const [jobsRes, runsRes] = await Promise.all([getJobs(), getRuns()]);
      setJobs(jobsRes.items);
      setRuns(runsRes.items);
    } catch (err) {
      setError((err as Error).message);
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

  async function handleDeleteRun(runId: string) {
    setError("");
    setMessage("");
    setDeletingRunIds((prev) => new Set(prev).add(runId));
    try {
      await deleteRun(runId);
      setRuns((prev) => prev.filter((run) => run.id !== runId));
      setMessage("执行记录已删除");
      setPendingDeleteRunId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingRunIds((prev) => {
        const next = new Set(prev);
        next.delete(runId);
        return next;
      });
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
      () =>
        (row: JobRun, keyword: string) => {
          const job = jobById[row.jobId];
          return `${job?.name ?? row.jobId} ${row.status} ${row.message ?? ""}`.toLowerCase().includes(keyword);
        },
      [jobById]
    ),
    { pageSizeStorageKey: "ark-runs-page-size" }
  );

  return (
    <section className="space-y-3">
      <div className="mp-panel mp-panel-soft p-4">
        <h2 className="mp-section-title">记录</h2>
        <p className="mt-1 text-sm mp-muted">每次任务执行都会生成一条执行记录</p>
        {message ? <p className="mt-3 text-sm mp-status-success">{message}</p> : null}
        {error ? <p className="mp-error mt-3">{error}</p> : null}
      </div>

      <div className="mp-panel p-4">
        <TableToolbar
          title="执行记录"
          search={search}
          onSearchChange={setSearch}
          pageSize={table.pageSize}
          onPageSizeChange={table.setPageSize}
          totalItems={table.totalItems}
        />

        <div className="space-y-2 md:hidden">
          {table.paged.map((run) => {
            const job = jobById[run.jobId];
            const deleting = deletingRunIds.has(run.id);
            return (
              <article key={run.id} className="mp-mobile-card">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h4 className="truncate text-sm font-semibold">{job?.name ?? run.jobId}</h4>
                    <p className="mt-0.5 break-all text-sm mp-muted">{job?.sourcePath ?? ""} {" -> "} {job?.destinationPath ?? ""}</p>
                  </div>
                  <span className={run.status === "success" ? "text-base mp-status-success" : "text-base mp-status-danger"}>
                    {run.status === "success" ? "成功" : "失败"}
                  </span>
                </div>

                <dl className="mp-kv mt-3">
                  <dt>结束时间</dt>
                  <dd>{new Date(run.finishedAt).toLocaleString()}</dd>
                  <dt>触发方式</dt>
                  <dd>{getTriggerLabel(run.trigger)}</dd>
                  <dt>成功/失败</dt>
                  <dd>
                    <span className="mp-status-success">{run.copiedCount}</span>
                    <span className="mp-muted">/</span>
                    <span className="mp-status-danger">{run.failedCount}</span>
                  </dd>
                  <dt>摘要</dt>
                  <dd>{getSummary(run)}</dd>
                </dl>

                {run.errors[0] ? <p className="mt-2 text-sm mp-status-danger">首个错误：{run.errors[0].path} - {run.errors[0].error}</p> : null}

                <div className="mt-3 flex justify-end">
                  <button type="button" className="mp-btn" disabled={deleting} onClick={() => setPendingDeleteRunId(run.id)}>
                    {deleting ? "删除中" : "删除"}
                  </button>
                </div>
              </article>
            );
          })}
          {!table.paged.length ? <p className="py-4 text-center text-sm mp-muted">暂无记录</p> : null}
        </div>

        <div className="hidden overflow-auto md:block">
          <table className="min-w-full text-base">
            <thead>
              <tr className="border-b border-[var(--ark-line)] text-left text-sm mp-muted">
                <th className="px-2 py-2">任务</th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "finishedAt", sortAsc)}>
                  <SortableHeader
                    label="结束时间"
                    active={sortKey === "finishedAt"}
                    ascending={sortAsc}
                    onToggle={() => toggleSort("finishedAt")}
                  />
                </th>
                <th className="px-2 py-2">触发方式</th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "status", sortAsc)}>
                  <SortableHeader
                    label="状态"
                    active={sortKey === "status"}
                    ascending={sortAsc}
                    onToggle={() => toggleSort("status")}
                  />
                </th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "copiedCount", sortAsc)}>
                  <SortableHeader
                    label="成功/失败"
                    active={sortKey === "copiedCount"}
                    ascending={sortAsc}
                    onToggle={() => toggleSort("copiedCount")}
                  />
                </th>
                <th className="px-2 py-2">摘要</th>
                <th className="px-2 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {table.paged.map((run) => {
                const job = jobById[run.jobId];
                return (
                  <tr key={run.id} className="border-b border-[var(--ark-line)]/70 align-top">
                    <td className="px-2 py-2 text-sm">
                      <div>{job?.name ?? run.jobId}</div>
                      <div className="mp-muted">{job?.sourcePath ?? ""} {" -> "} {job?.destinationPath ?? ""}</div>
                    </td>
                    <td className="px-2 py-2 text-sm">{new Date(run.finishedAt).toLocaleString()}</td>
                    <td className="px-2 py-2 text-sm">{getTriggerLabel(run.trigger)}</td>
                    <td className="px-2 py-2">
                      <span className={run.status === "success" ? "mp-status-success" : "mp-status-danger"}>
                        {run.status === "success" ? "成功" : "失败"}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="mp-status-success">{run.copiedCount}</span>
                      <span className="mp-muted">/</span>
                      <span className="mp-status-danger">{run.failedCount}</span>
                    </td>
                    <td className="px-2 py-2 text-sm">
                      <div>{getSummary(run)}</div>
                      {run.errors[0] ? <div className="mt-1 mp-status-danger">首个错误：{run.errors[0].path} - {run.errors[0].error}</div> : null}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="mp-btn"
                        disabled={deletingRunIds.has(run.id)}
                        onClick={() => setPendingDeleteRunId(run.id)}
                      >
                        {deletingRunIds.has(run.id) ? "删除中" : "删除"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!table.paged.length ? (
                <tr>
                  <td className="px-2 py-4 text-center text-sm mp-muted" colSpan={7}>暂无记录</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
        {!table.totalItems ? (
          <div className="mt-3 flex justify-center md:justify-end">
            <button type="button" className="mp-btn" onClick={() => navigate("/settings/jobs")}>
              去创建备份任务
            </button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteRunId)}
        title="删除执行记录"
        description="该操作不可恢复，确认后将永久删除所选记录。"
        confirmText="确认删除"
        busy={pendingDeleteRunId ? deletingRunIds.has(pendingDeleteRunId) : false}
        onCancel={() => setPendingDeleteRunId(null)}
        onConfirm={() => {
          if (!pendingDeleteRunId) return;
          void handleDeleteRun(pendingDeleteRunId);
        }}
      />
    </section>
  );
}
