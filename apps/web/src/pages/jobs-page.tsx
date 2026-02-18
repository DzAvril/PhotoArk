import * as Collapsible from "@radix-ui/react-collapsible";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TablePagination } from "../components/table/table-pagination";
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

export function JobsPage() {
  const [items, setItems] = useState<BackupJob[]>([]);
  const [storages, setStorages] = useState<StorageTarget[]>([]);
  const [runs, setRuns] = useState<JobRun[]>([]);
  const [lastSourceTargetId, setLastSourceTargetId] = useLocalStorageState("ark-last-job-source-target-id", "");
  const [lastDestinationTargetId, setLastDestinationTargetId] = useLocalStorageState(
    "ark-last-job-destination-target-id",
    ""
  );
  const [form, setForm] = useState<JobForm>(() =>
    createInitialForm(lastSourceTargetId, lastDestinationTargetId)
  );
  const [editingJobId, setEditingJobId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [runningJobIds, setRunningJobIds] = useState<Set<string>>(new Set());

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

  async function handleDeleteSelected() {
    setError("");
    try {
      await Promise.all([...selected].map((id) => deleteJob(id)));
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteOne(jobId: string) {
    setError("");
    try {
      await deleteJob(jobId);
      if (editingJobId === jobId) {
        resetForm();
      }
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleRunJob(jobId: string) {
    setError("");
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
      if (!out[run.jobId]) out[run.jobId] = run;
    }
    return out;
  }, [runs]);

  const allCurrentPageSelected = table.paged.length > 0 && table.paged.every((j) => selected.has(j.id));

  return (
    <section className="space-y-3">
      <Collapsible.Root open={formOpen} onOpenChange={setFormOpen} className="mp-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="mp-section-title">备份任务</h2>
            <p className="mt-1 text-xs mp-muted">选择源存储和目标存储即可创建同步任务</p>
          </div>
          <Collapsible.Trigger className="mp-btn">{formOpen ? "收起" : "新增任务"}</Collapsible.Trigger>
        </div>
        {error ? <p className="mp-error mt-3">{error}</p> : null}

        <Collapsible.Content>
          <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input
              className="mp-input sm:col-span-2"
              placeholder="任务名称"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />

            <select
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
              {storages.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
            </select>

            <select
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
              {storages.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
            </select>

            <div className="sm:col-span-2 rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2 text-xs">
              <p>源路径：{sourceStorage?.basePath || "-"}</p>
              <p className="mt-1">目标路径：{destinationStorage?.basePath || "-"}</p>
            </div>

            <input
              className="mp-input"
              placeholder="cron（监听模式可留默认）"
              value={form.schedule ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, schedule: e.target.value }))}
            />
            <div className="flex items-center gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.watchMode} onChange={(e) => setForm((p) => ({ ...p, watchMode: e.target.checked }))} />实时监听</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} />启用</label>
            </div>

            <div className="sm:col-span-2 flex gap-2">
              <button type="submit" className="mp-btn mp-btn-primary flex-1">{editingJobId ? "保存修改" : "新增任务"}</button>
              {editingJobId ? <button type="button" className="mp-btn" onClick={resetForm}>取消编辑</button> : null}
            </div>
          </form>
        </Collapsible.Content>
      </Collapsible.Root>

      <div className="mp-panel p-4">
        <TableToolbar title="任务列表" search={search} onSearchChange={setSearch} pageSize={table.pageSize} onPageSizeChange={table.setPageSize} totalItems={table.totalItems} />
        <div className="mb-2 flex justify-end"><button className="mp-btn" type="button" disabled={!selected.size} onClick={() => void handleDeleteSelected()}>批量删除 ({selected.size})</button></div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ark-line)] text-left text-xs mp-muted">
                <th className="px-2 py-2"><input type="checkbox" checked={allCurrentPageSelected} onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) table.paged.forEach((j) => next.add(j.id));
                  else table.paged.forEach((j) => next.delete(j.id));
                  setSelected(next);
                }} /></th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("name")}>任务</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("sourceTargetId")}>源存储</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("destinationTargetId")}>目标存储</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("enabled")}>状态</th>
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
                    <td className="px-2 py-2"><input type="checkbox" checked={selected.has(j.id)} onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(j.id); else next.delete(j.id);
                      setSelected(next);
                    }} /></td>
                    <td className="px-2 py-2 font-medium">{j.name}</td>
                    <td className="px-2 py-2 text-xs"><div>{src?.name ?? j.sourceTargetId}</div><div className="mp-muted break-all">{src?.basePath ?? j.sourcePath}</div></td>
                    <td className="px-2 py-2 text-xs"><div>{dst?.name ?? j.destinationTargetId}</div><div className="mp-muted break-all">{dst?.basePath ?? j.destinationPath}</div></td>
                    <td className="px-2 py-2">{j.enabled ? "启用" : "停用"}</td>
                    <td className="px-2 py-2">{j.watchMode ? "实时监听" : "关闭"}</td>
                    <td className="px-2 py-2 text-xs">
                      {latest ? (
                        <div>
                          <div className={latest.status === "success" ? "text-emerald-600" : "text-red-500"}>{latest.status === "success" ? "成功" : "失败"}</div>
                          <div className="mp-muted">{new Date(latest.finishedAt).toLocaleString()}</div>
                        </div>
                      ) : <span className="mp-muted">未执行</span>}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className="mp-btn" disabled={!j.enabled || running} onClick={() => void handleRunJob(j.id)}>{running ? "执行中" : "立即执行"}</button>
                        <button type="button" className="mp-btn" onClick={() => startEdit(j)}>编辑</button>
                        <button type="button" className="mp-btn" onClick={() => void handleDeleteOne(j.id)}>删除</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!table.paged.length ? <tr><td className="px-2 py-4 text-center text-xs mp-muted" colSpan={8}>暂无数据</td></tr> : null}
            </tbody>
          </table>
        </div>
        <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
      </div>
    </section>
  );
}
