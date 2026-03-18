import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ConfirmDialog } from "../components/confirm-dialog";
import { InlineAlert } from "../components/inline-alert";
import { TablePagination } from "../components/table/table-pagination";
import { SortableHeader } from "../components/table/sortable-header";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { Button } from "../components/ui/button";
import { EmptyState } from "../components/ui/empty-state";
import { SectionCard } from "../components/ui/section-card";
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
  const canceledCount = runs.filter((run) => run.status === "canceled").length;
  const failedCount = runs.length - successCount - canceledCount;

  return (
    <section className="space-y-4 md:flex md:h-full md:flex-col">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="mp-panel p-4">
          <p className="mp-kicker">总执行</p>
          <p className="mt-2 text-2xl font-semibold">{runs.length}</p>
          <p className="mt-1 text-xs mp-muted">包含所有任务的执行历史</p>
        </div>
        <div className="mp-panel p-4">
          <p className="mp-kicker">成功与取消</p>
          <p className="mt-2 text-2xl font-semibold">{successCount}</p>
          <p className="mt-1 text-xs mp-muted">已取消 {canceledCount}</p>
        </div>
        <div className="mp-panel p-4">
          <p className="mp-kicker">失败记录</p>
          <p className="mt-2 text-2xl font-semibold">{failedCount}</p>
          <p className="mt-1 text-xs mp-muted">需要关注的异常执行</p>
        </div>
      </div>

      <SectionCard
        title="执行记录"
        description="支持搜索与排序，可通过 / 快捷键聚焦搜索，Esc 清空搜索"
        right={
          <>
            <span className="mp-chip">总记录 {runs.length}</span>
            <span className="mp-chip mp-chip-success">成功 {successCount}</span>
            {failedCount > 0 ? <span className="mp-chip mp-chip-warning">失败 {failedCount}</span> : null}
            {canceledCount > 0 ? <span className="mp-chip mp-chip-warning">已取消 {canceledCount}</span> : null}
          </>
        }
        className="md:min-h-0 md:flex-1 md:flex md:flex-col"
      >
        {message ? (
          <InlineAlert tone="success" onClose={() => setMessage("")} autoCloseMs={5000}>
            {message}
          </InlineAlert>
        ) : null}
        {error ? (
          <div className={message ? "mt-2" : ""}>
            <InlineAlert tone="error" onClose={() => setError("")} autoCloseMs={8000}>
              {error}
            </InlineAlert>
          </div>
        ) : null}

        <div className={`${message || error ? "mt-3" : ""} mp-toolbar`}>
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

        {!table.totalItems ? (
          <EmptyState
            title="暂无执行记录"
            description="先创建备份任务并执行一次，这里会展示执行状态与错误信息。"
            action={
              <Button variant="primary" onClick={() => navigate("/settings/jobs")}>
                去创建备份任务
              </Button>
            }
          />
        ) : (
          <>
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
                      <span className={`text-sm ${getRunStatusClass(run.status)}`}>{getRunStatusLabel(run.status)}</span>
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

                    {run.errors[0] ? (
                      <p className="mt-2 break-all text-sm mp-status-danger">
                        首个错误：{run.errors[0].path} - {run.errors[0].error}
                      </p>
                    ) : null}

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
                      <span className={getRunStatusClass(run.status)}>{getRunStatusLabel(run.status)}</span>
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
        </div>

        <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
          </>
        )}
      </SectionCard>

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
