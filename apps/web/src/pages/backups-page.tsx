import { useEffect, useMemo, useState } from "react";
import { TablePagination } from "../components/table/table-pagination";
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

export function BackupsPage() {
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("finishedAt");
  const [sortAsc, setSortAsc] = useState(false);
  const [deletingRunIds, setDeletingRunIds] = useState<Set<string>>(new Set());

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
    setDeletingRunIds((prev) => new Set(prev).add(runId));
    try {
      await deleteRun(runId);
      setRuns((prev) => prev.filter((run) => run.id !== runId));
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
      <div className="mp-panel p-4">
        <h2 className="mp-section-title">备份历史</h2>
        <p className="mt-1 text-xs mp-muted">每次任务执行都会在这里生成一条记录</p>
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
                    <p className="mt-0.5 break-all text-xs mp-muted">{job?.sourcePath ?? ""} {" -> "} {job?.destinationPath ?? ""}</p>
                  </div>
                  <span className={run.status === "success" ? "text-sm text-emerald-600" : "text-sm text-red-500"}>
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
                    <span className="text-emerald-600">{run.copiedCount}</span>
                    <span className="mp-muted">/</span>
                    <span className="text-red-500">{run.failedCount}</span>
                  </dd>
                  <dt>摘要</dt>
                  <dd>{getSummary(run)}</dd>
                </dl>

                {run.errors[0] ? <p className="mt-2 text-xs text-red-500">首个错误：{run.errors[0].path} - {run.errors[0].error}</p> : null}

                <div className="mt-3 flex justify-end">
                  <button type="button" className="mp-btn" disabled={deleting} onClick={() => void handleDeleteRun(run.id)}>
                    {deleting ? "删除中" : "删除"}
                  </button>
                </div>
              </article>
            );
          })}
          {!table.paged.length ? <p className="py-4 text-center text-xs mp-muted">暂无记录</p> : null}
        </div>

        <div className="hidden overflow-auto md:block">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ark-line)] text-left text-xs mp-muted">
                <th className="px-2 py-2">任务</th>
                <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("finishedAt")}>结束时间</th>
                <th className="px-2 py-2">触发方式</th>
                <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("status")}>状态</th>
                <th className="cursor-pointer px-2 py-2" onClick={() => toggleSort("copiedCount")}>成功/失败</th>
                <th className="px-2 py-2">摘要</th>
                <th className="px-2 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {table.paged.map((run) => {
                const job = jobById[run.jobId];
                return (
                  <tr key={run.id} className="border-b border-[var(--ark-line)]/70 align-top">
                    <td className="px-2 py-2 text-xs">
                      <div>{job?.name ?? run.jobId}</div>
                      <div className="mp-muted">{job?.sourcePath ?? ""} {" -> "} {job?.destinationPath ?? ""}</div>
                    </td>
                    <td className="px-2 py-2 text-xs">{new Date(run.finishedAt).toLocaleString()}</td>
                    <td className="px-2 py-2 text-xs">{getTriggerLabel(run.trigger)}</td>
                    <td className="px-2 py-2">
                      <span className={run.status === "success" ? "text-emerald-600" : "text-red-500"}>
                        {run.status === "success" ? "成功" : "失败"}
                      </span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="text-emerald-600">{run.copiedCount}</span>
                      <span className="mp-muted">/</span>
                      <span className="text-red-500">{run.failedCount}</span>
                    </td>
                    <td className="px-2 py-2 text-xs">
                      <div>{getSummary(run)}</div>
                      {run.errors[0] ? <div className="mt-1 text-red-500">首个错误：{run.errors[0].path} - {run.errors[0].error}</div> : null}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="mp-btn"
                        disabled={deletingRunIds.has(run.id)}
                        onClick={() => void handleDeleteRun(run.id)}
                      >
                        {deletingRunIds.has(run.id) ? "删除中" : "删除"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!table.paged.length ? (
                <tr>
                  <td className="px-2 py-4 text-center text-xs mp-muted" colSpan={7}>暂无记录</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
      </div>
    </section>
  );
}
