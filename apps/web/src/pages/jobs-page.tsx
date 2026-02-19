import * as Collapsible from "@radix-ui/react-collapsible";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ConfirmDialog } from "../components/confirm-dialog";
import { TablePagination } from "../components/table/table-pagination";
import { SortableHeader } from "../components/table/sortable-header";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { useLocalStorageState } from "../hooks/use-local-storage-state";
import { createJob, deleteJob, getJobs, getRuns, getStorages, runJob, updateJob } from "../lib/api";
import type { BackupJob, JobRun, StorageTarget } from "../types/api";

type SortKey = "name" | "sourceTargetId" | "destinationTargetId" | "enabled";

type JobForm = {
  name: string;
  sourceTargetId: string;
  destinationTargetId: string;
  schedule: string;
  watchMode: boolean;
  enabled: boolean;
};

type PendingDeleteAction = {
  mode: "single" | "batch";
  ids: string[];
  label: string;
};

function createInitialForm(sourceTargetId = "", destinationTargetId = ""): JobForm {
  return {
    name: "",
    sourceTargetId,
    destinationTargetId,
    schedule: "0 2 * * *",
    watchMode: false,
    enabled: true
  };
}

function getAriaSort(active: boolean, asc: boolean): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return asc ? "ascending" : "descending";
}

export function JobsPage() {
  const [items, setItems] = useState<BackupJob[]>([]);
  const [storages, setStorages] = useState<StorageTarget[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [lastSourceTargetId, setLastSourceTargetId] = useLocalStorageState("ark-last-job-source-target-id", "");
  const [lastDestinationTargetId, setLastDestinationTargetId] = useLocalStorageState(
    "ark-last-job-destination-target-id",
    ""
  );
  const [form, setForm] = useState<JobForm>(() => createInitialForm(lastSourceTargetId, lastDestinationTargetId));
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [runningJobIds, setRunningJobIds] = useState<Set<string>>(new Set());
  const [deletingJobIds, setDeletingJobIds] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<PendingDeleteAction | null>(null);

  const storageById = useMemo(() => Object.fromEntries(storages.map((s) => [s.id, s])), [storages]);
  const sourceStorage = form.sourceTargetId ? storageById[form.sourceTargetId] : undefined;
  const destinationStorage = form.destinationTargetId ? storageById[form.destinationTargetId] : undefined;

  async function load() {
    try {
      const [jobsRes, storagesRes, runsRes] = await Promise.all([getJobs(), getStorages(), getRuns()]);
      setItems(jobsRes.items);
      setStorages(storagesRes.items);
      setRuns(runsRes.items);
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function resetForm() {
    setForm(createInitialForm(lastSourceTargetId, lastDestinationTargetId));
    setEditingJobId(null);
  }

  useEffect(() => {
    if (!storages.length) return;
    const storageIds = new Set(storages.map((item) => item.id));
    if (form.sourceTargetId && !storageIds.has(form.sourceTargetId)) {
      setForm((prev) => ({ ...prev, sourceTargetId: "" }));
    }
    if (form.destinationTargetId && !storageIds.has(form.destinationTargetId)) {
      setForm((prev) => ({ ...prev, destinationTargetId: "" }));
    }
  }, [storages, form.sourceTargetId, form.destinationTargetId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");

    if (!sourceStorage || !destinationStorage) {
      setError("请选择源存储和目标存储");
      return;
    }

    const payload: Omit<BackupJob, "id"> = {
      name: form.name,
      sourceTargetId: form.sourceTargetId,
      sourcePath: sourceStorage.basePath,
      destinationTargetId: form.destinationTargetId,
      destinationPath: destinationStorage.basePath,
      schedule: form.schedule,
      watchMode: form.watchMode,
      enabled: form.enabled
    };

    try {
      if (editingJobId) {
        await updateJob(editingJobId, payload);
      } else {
        await createJob(payload);
      }
      setLastSourceTargetId(form.sourceTargetId);
      setLastDestinationTargetId(form.destinationTargetId);
      setForm(createInitialForm(form.sourceTargetId, form.destinationTargetId));
      setEditingJobId(null);
      setFormOpen(false);
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
      destinationTargetId: job.destinationTargetId,
      schedule: job.schedule ?? "",
      watchMode: job.watchMode,
      enabled: job.enabled
    });
    setFormOpen(true);
  }

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

  async function handleRunJob(jobId: string) {
    setError("");
    setMessage("");
    setRunningJobIds((prev) => new Set(prev).add(jobId));
    try {
      const run = await runJob(jobId);
      setRuns((prev) => [run, ...prev]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningJobIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
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
          return `${row.name} ${src?.name ?? row.sourceTargetId} ${dst?.name ?? row.destinationTargetId}`
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

  const allCurrentPageSelected = table.paged.length > 0 && table.paged.every((j) => selected.has(j.id));

  return (
    <section className="space-y-3">
      <Collapsible.Root open={formOpen} onOpenChange={setFormOpen} className="mp-panel mp-panel-soft p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="mp-section-title">备份任务</h2>
            <p className="mt-1 text-sm mp-muted">选择源存储和目标存储即可创建同步任务</p>
          </div>
          <Collapsible.Trigger className="mp-btn">{formOpen ? "收起" : "新增任务"}</Collapsible.Trigger>
        </div>
        {message ? <p className="mt-3 text-sm mp-status-success">{message}</p> : null}
        {error ? <p className="mp-error mt-3">{error}</p> : null}

        <Collapsible.Content>
          <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 sm:grid-cols-2">
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
                  setForm((p) => ({ ...p, sourceTargetId: next }));
                  if (next) {
                    setLastSourceTargetId(next);
                  }
                }}
                required
              >
                <option value="">选择备份源存储</option>
                {storages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.type})
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
                  setForm((p) => ({ ...p, destinationTargetId: next }));
                  if (next) {
                    setLastDestinationTargetId(next);
                  }
                }}
                required
              >
                <option value="">选择备份目标存储</option>
                {storages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.type})
                  </option>
                ))}
              </select>
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
              <p className="text-sm mp-muted">按服务器本地时区执行，例如每天 02:00 使用 `0 2 * * *`。</p>
            </div>
            <div className="flex items-center gap-4 text-sm">
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

            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className="mp-btn mp-btn-primary flex-1">{editingJobId ? "保存修改" : "新增任务"}</button>
              {editingJobId ? (
                <button type="button" className="mp-btn" onClick={resetForm}>
                  取消编辑
                </button>
              ) : null}
            </div>
          </form>
        </Collapsible.Content>
      </Collapsible.Root>

      <div className="mp-panel p-4">
        <TableToolbar
          title="任务列表"
          search={search}
          onSearchChange={setSearch}
          pageSize={table.pageSize}
          onPageSizeChange={table.setPageSize}
          totalItems={table.totalItems}
        />
        <div className="mb-2 flex justify-end">
          <button
            className="mp-btn"
            type="button"
            disabled={!selected.size || deletingSelected}
            onClick={() =>
              setPendingDeleteAction({
                mode: "batch",
                ids: [...selected],
                label: `选中的 ${selected.size} 个任务`
              })
            }
          >
            {deletingSelected ? "删除中..." : `批量删除 (${selected.size})`}
          </button>
        </div>

        <div className="space-y-2 md:hidden">
          {table.paged.map((j) => {
            const latest = latestRunByJobId[j.id];
            const running = runningJobIds.has(j.id);
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
                    <div className="break-all mp-muted">{src?.basePath ?? j.sourcePath}</div>
                  </dd>
                  <dt>目标存储</dt>
                  <dd>
                    <div>{dst?.name ?? j.destinationTargetId}</div>
                    <div className="break-all mp-muted">{dst?.basePath ?? j.destinationPath}</div>
                  </dd>
                  <dt>最近执行</dt>
                  <dd>
                    {latest ? (
                      <>
                        <span className={latest.status === "success" ? "mp-status-success" : "mp-status-danger"}>
                          {latest.status === "success" ? "成功" : "失败"}
                        </span>
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
                    onClick={() => void handleRunJob(j.id)}
                  >
                    {running ? "执行中" : "立即执行"}
                  </button>
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

        <div className="hidden overflow-auto md:block">
          <table className="min-w-full text-base">
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
                const running = runningJobIds.has(j.id);
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
                      <div className="break-all mp-muted">{src?.basePath ?? j.sourcePath}</div>
                    </td>
                    <td className="px-2 py-2 text-sm">
                      <div>{dst?.name ?? j.destinationTargetId}</div>
                      <div className="break-all mp-muted">{dst?.basePath ?? j.destinationPath}</div>
                    </td>
                    <td className="px-2 py-2">{j.enabled ? "启用" : "停用"}</td>
                    <td className="px-2 py-2">{j.watchMode ? "实时监听" : "关闭"}</td>
                    <td className="px-2 py-2 text-sm">
                      {latest ? (
                        <div>
                          <div className={latest.status === "success" ? "mp-status-success" : "mp-status-danger"}>
                            {latest.status === "success" ? "成功" : "失败"}
                          </div>
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
                          onClick={() => void handleRunJob(j.id)}
                        >
                          {running ? "执行中" : "立即执行"}
                        </button>
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

        <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
        {!table.totalItems ? (
          <div className="mt-3 flex justify-center md:justify-end">
            <button type="button" className="mp-btn" onClick={() => setFormOpen(true)}>
              去新增任务
            </button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteAction)}
        title="删除任务"
        description={
          pendingDeleteAction?.mode === "single"
            ? `将删除${pendingDeleteAction.label}，删除后不可恢复。`
            : `将删除 ${pendingDeleteAction?.ids.length ?? 0} 个任务，删除后不可恢复。`
        }
        confirmText="确认删除"
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
