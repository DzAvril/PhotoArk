import { useEffect, useMemo, useState } from "react";
import { TablePagination } from "../components/table/table-pagination";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { deleteRun, getJobs, getRuns } from "../lib/api";
import type { BackupJob, JobRun } from "../types/api";

type SortKey = "finishedAt" | "status" | "copiedCount";

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
    )
  );

  return (
    <section className="space-y-3">
      <div className="mp-panel p-4">
        <h2 className="mp-section-title">备份历史</h2>
        <p className="mt-1 text-xs mp-muted">每次任务执行都会在这里生成一条记录</p>
        {error ? <p className="mp-error mt-3">{error}</p> : null}
      </div>

      <div className="mp-panel p-4">
        <TableToolbar title="执行记录" search={search} onSearchChange={setSearch} pageSize={table.pageSize} onPageSizeChange={table.setPageSize} totalItems={table.totalItems} />
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ark-line)] text-left text-xs mp-muted">
                <th className="px-2 py-2">任务</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("finishedAt")}>结束时间</th>
                <th className="px-2 py-2">触发方式</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("status")}>状态</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("copiedCount")}>成功/失败</th>
                <th className="px-2 py-2">摘要</th>
                <th className="px-2 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {table.paged.map((run) => {
                const job = jobById[run.jobId];
                const triggerLabel =
                  run.trigger === "manual"
                    ? "手动执行"
                    : run.trigger === "watch"
                      ? "实时监听"
                      : run.trigger === "schedule"
                        ? "定时任务"
                        : "未知";
                return (
                  <tr key={run.id} className="border-b border-[var(--ark-line)]/70 align-top">
                    <td className="px-2 py-2 text-xs">
                      <div>{job?.name ?? run.jobId}</div>
                      <div className="mp-muted">{job?.sourcePath ?? ""} {" -> "} {job?.destinationPath ?? ""}</div>
                    </td>
                    <td className="px-2 py-2 text-xs">{new Date(run.finishedAt).toLocaleString()}</td>
                    <td className="px-2 py-2 text-xs">{triggerLabel}</td>
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
                      <div>照片 {run.photoCount ?? 0}，视频 {run.videoCount ?? 0}，Live Photo {run.livePhotoPairCount ?? 0}</div>
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
              {!table.paged.length ? <tr><td className="px-2 py-4 text-center text-xs mp-muted" colSpan={7}>暂无记录</td></tr> : null}
            </tbody>
          </table>
        </div>
        <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
      </div>
    </section>
  );
}
