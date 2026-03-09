import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/confirm-dialog";
import { InlineAlert } from "../components/inline-alert";
import { TablePagination } from "../components/table/table-pagination";
import { SortableHeader } from "../components/table/sortable-header";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { deleteRun, getJobs, getRuns } from "../lib/api";
import type { BackupJob, JobRun } from "../types/api";

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
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingRunIds, setDeletingRunIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<PendingDeleteAction | null>(null);
  const [message, setMessage] = useState("");

  const jobById = useMemo(() => Object.fromEntries(jobs.map((j) => [j.id, j])), [jobs]);

  async function load() {
    try {
      const [jobsRes, runsRes] = await Promise.all([getJobs(), getRuns()]);
      setJobs(jobsRes.items);
      setRuns(runsRes.items);
      setSelected(new Set());
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
      () =>
        (row: JobRun, keyword: string) => {
          const job = jobById[row.jobId];
          return `${job?.name ?? row.jobId} ${row.status} ${row.message ?? ""}`.toLowerCase().includes(keyword);
        },
      [jobById]
    ),
    { pageSizeStorageKey: "ark-runs-page-size" }
  );
  const allCurrentPageSelected = table.paged.length > 0 && table.paged.every((run) => selected.has(run.id));
  const successCount = runs.filter((run) => run.status === "success").length;
  const failedCount = runs.length - successCount;

  return (
    <section className="space-y-3 md:flex md:h-full md:flex-col">
      <div className="mp-panel p-4 md:flex md:min-h-0 md:flex-1 md:flex-col">
        {message ? (
          <InlineAlert tone="success" className="mb-3" autoCloseMs={5200} onClose={() => setMessage("")}>
            {message}
          </InlineAlert>
        ) : null}
        {error ? (
          <InlineAlert tone="error" className="mb-3" onClose={() => setError("")}>
            {error}
          </InlineAlert>
        ) : null}
        <TableToolbar
          title="执行记录"
          search={search}
          onSearchChange={setSearch}
          pageSize={table.pageSize}
          onPageSizeChange={table.setPageSize}
          totalItems={table.totalItems}
        />
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="mp-chip">总记录 {runs.length}</span>
          <span className="mp-chip mp-chip-success">成功 {successCount}</span>
          {failedCount > 0 ? <span className="mp-chip mp-chip-warning">失败 {failedCount}</span> : null}
        </div>
        <div className="mb-2 flex justify-end">
          <button
            className="mp-btn"
            type="button"
            disabled={!selected.size || deletingSelected}
            onClick={() =>
              setPendingDeleteAction({
                mode: "batch",
                ids: [...selected],
                label: `选中的 ${selected.size} 条记录`
              })
            }
          >
            {deletingSelected ? "删除中..." : `批量删除 (${selected.size})`}
          </button>
        </div>

        <div className="space-y-2 md:hidden">
          {table.paged.map((run) => {
            const job = jobById[run.jobId];
            const deleting = deletingRunIds.has(run.id);
            return (
              <article key={run.id} className="mp-mobile-card">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(run.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(run.id);
                      else next.delete(run.id);
                      setSelected(next);
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold">{job?.name ?? run.jobId}</h4>
                  </div>
                  <span className={run.status === "success" ? "text-sm mp-status-success" : "text-sm mp-status-danger"}>
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

                {run.errors[0] ? <p className="mt-2 break-all text-sm mp-status-danger">首个错误：{run.errors[0].path} - {run.errors[0].error}</p> : null}

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    className="mp-btn"
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
                  </button>
                </div>
              </article>
            );
          })}
          {!table.paged.length ? <p className="py-4 text-center text-sm mp-muted">暂无记录</p> : null}
        </div>

        <div className="hidden md:block md:min-h-0 md:flex-1 md:overflow-auto">
          <table className="mp-data-table min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ark-line)] text-left text-sm mp-muted">
                <th className="px-2 py-2">
                  <input
                    type="checkbox"
                    checked={allCurrentPageSelected}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) table.paged.forEach((run) => next.add(run.id));
                      else table.paged.forEach((run) => next.delete(run.id));
                      setSelected(next);
                    }}
                  />
                </th>
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
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(run.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(run.id);
                          else next.delete(run.id);
                          setSelected(next);
                        }}
                      />
                    </td>
                    <td className="px-2 py-2 text-sm">
                      <div>{job?.name ?? run.jobId}</div>
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
                      {run.errors[0] ? <div className="mt-1 break-all mp-status-danger">首个错误：{run.errors[0].path} - {run.errors[0].error}</div> : null}
                    </td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        className="mp-btn"
                        disabled={deletingRunIds.has(run.id)}
                        onClick={() =>
                          setPendingDeleteAction({
                            mode: "single",
                            ids: [run.id],
                            label: "执行记录"
                          })
                        }
                      >
                        {deletingRunIds.has(run.id) ? "删除中" : "删除"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!table.paged.length ? (
                <tr>
                  <td className="px-2 py-4 text-center text-sm mp-muted" colSpan={8}>暂无记录</td>
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
