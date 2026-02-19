import * as Collapsible from "@radix-ui/react-collapsible";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ConfirmDialog } from "../components/confirm-dialog";
import { PathPicker } from "../components/path-picker";
import { TablePagination } from "../components/table/table-pagination";
import { SortableHeader } from "../components/table/sortable-header";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { useLocalStorageState } from "../hooks/use-local-storage-state";
import { browseDirectories, createStorage, deleteStorage, getStorages } from "../lib/api";
import type { StorageTarget } from "../types/api";

type SortKey = "name" | "type" | "basePath" | "encrypted";

function createInitialForm(type: StorageTarget["type"] = "local_fs"): Omit<StorageTarget, "id"> {
  return {
    name: "",
    type,
    basePath: "",
    encrypted: false
  };
}

function getAriaSort(active: boolean, asc: boolean): "ascending" | "descending" | "none" {
  if (!active) return "none";
  return asc ? "ascending" : "descending";
}

export function StoragesPage() {
  const [items, setItems] = useState<StorageTarget[]>([]);
  const [lastStorageType, setLastStorageType] = useLocalStorageState<StorageTarget["type"]>(
    "ark-last-storage-type",
    "local_fs"
  );
  const [form, setForm] = useState<Omit<StorageTarget, "id">>(() => createInitialForm(lastStorageType));
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [pendingDeleteStorageIds, setPendingDeleteStorageIds] = useState<string[] | null>(null);

  async function load() {
    try {
      const res = await getStorages();
      setItems(res.items);
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    try {
      await createStorage(form);
      setLastStorageType(form.type);
      setForm(createInitialForm(form.type));
      setFormOpen(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteSelected() {
    if (!pendingDeleteStorageIds?.length) return;
    setError("");
    setMessage("");
    setDeletingSelected(true);
    try {
      const results = await Promise.allSettled(pendingDeleteStorageIds.map((id) => deleteStorage(id)));
      const failedIds: string[] = [];
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          failedIds.push(pendingDeleteStorageIds[index]);
        }
      });
      const successCount = pendingDeleteStorageIds.length - failedIds.length;
      if (successCount > 0) {
        await load();
      }
      if (failedIds.length) {
        setError(`已删除 ${successCount} 个存储，${failedIds.length} 个删除失败。`);
        setSelected(new Set(failedIds));
      } else {
        setMessage(`已删除 ${successCount} 个存储。`);
      }
      setPendingDeleteStorageIds(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingSelected(false);
    }
  }

  function toggleSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortAsc((v) => !v);
    } else {
      setSortKey(nextKey);
      setSortAsc(true);
    }
  }

  const sortedItems = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      const av = sortKey === "encrypted" ? Number(a.encrypted) : String(a[sortKey]);
      const bv = sortKey === "encrypted" ? Number(b.encrypted) : String(b[sortKey]);
      const cmp = String(av).localeCompare(String(bv));
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [items, sortKey, sortAsc]);

  const isLocalType = form.type === "local_fs" || form.type === "external_ssd";

  const table = useTablePagination(
    sortedItems,
    search,
    useMemo(
      () =>
        (row: StorageTarget, keyword: string) => `${row.name} ${row.type} ${row.basePath}`.toLowerCase().includes(keyword),
      []
    ),
    { pageSizeStorageKey: "ark-storages-page-size" }
  );

  const allCurrentPageSelected = table.paged.length > 0 && table.paged.every((s) => selected.has(s.id));

  return (
    <section className="space-y-3">
      <Collapsible.Root open={formOpen} onOpenChange={setFormOpen} className="mp-panel mp-panel-soft p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="mp-section-title">目标存储</h2>
            <p className="mt-1 text-sm mp-muted">支持本地目录下拉选择和手动输入路径</p>
          </div>
          <Collapsible.Trigger className="mp-btn">{formOpen ? "收起" : "新增存储"}</Collapsible.Trigger>
        </div>
        {message ? <p className="mt-3 text-sm mp-status-success">{message}</p> : null}
        {error ? <p className="mp-error mt-3">{error}</p> : null}

        <Collapsible.Content>
          <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="storage-name" className="text-sm font-medium">
                名称
              </label>
              <input
                id="storage-name"
                className="mp-input"
                placeholder="例如：NAS-主盘"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="storage-type" className="text-sm font-medium">
                类型
              </label>
              <select
                id="storage-type"
                className="mp-select"
                value={form.type}
                onChange={(e) => {
                  const nextType = e.target.value as StorageTarget["type"];
                  setForm((p) => ({ ...p, type: nextType }));
                  setLastStorageType(nextType);
                }}
              >
                <option value="local_fs">local_fs</option>
                <option value="external_ssd">external_ssd</option>
                <option value="cloud_115">cloud_115</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-sm font-medium">路径</label>
              {isLocalType ? (
                <PathPicker
                  value={form.basePath}
                  onChange={(basePath) => setForm((p) => ({ ...p, basePath }))}
                  placeholder="输入本地目录路径，或点右侧选择路径"
                  browse={browseDirectories}
                  required
                />
              ) : (
                <input
                  className="mp-input"
                  placeholder="115://photoark 或其他 URI"
                  value={form.basePath}
                  onChange={(e) => setForm((p) => ({ ...p, basePath: e.target.value }))}
                  required
                />
              )}
              <p className="mt-1 text-sm mp-muted">本地路径建议使用绝对路径；云端路径请使用完整 URI。</p>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.encrypted}
                onChange={(e) => setForm((p) => ({ ...p, encrypted: e.target.checked }))}
              />
              加密存储
            </label>
            <button type="submit" className="mp-btn mp-btn-primary sm:col-span-2">新增存储</button>
          </form>
        </Collapsible.Content>
      </Collapsible.Root>

      <div className="mp-panel p-4">
        <TableToolbar
          title="存储列表"
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
            onClick={() => setPendingDeleteStorageIds([...selected])}
          >
            {deletingSelected ? "删除中..." : `批量删除 (${selected.size})`}
          </button>
        </div>

        <div className="space-y-2 md:hidden">
          {table.paged.map((s) => (
            <article key={s.id} className="mp-mobile-card">
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(s.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(s.id);
                    else next.delete(s.id);
                    setSelected(next);
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="truncate text-sm font-semibold">{s.name}</h4>
                    <span className={s.encrypted ? "text-sm mp-status-success" : "text-sm mp-muted"}>{s.encrypted ? "加密" : "未加密"}</span>
                  </div>
                  <p className="mt-0.5 text-sm mp-muted">{s.type}</p>
                </div>
              </div>

              <dl className="mp-kv mt-3">
                <dt>路径</dt>
                <dd className="break-all">{s.basePath}</dd>
              </dl>
            </article>
          ))}
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
                      if (e.target.checked) table.paged.forEach((s) => next.add(s.id));
                      else table.paged.forEach((s) => next.delete(s.id));
                      setSelected(next);
                    }}
                  />
                </th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "name", sortAsc)}>
                  <SortableHeader label="名称" active={sortKey === "name"} ascending={sortAsc} onToggle={() => toggleSort("name")} />
                </th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "type", sortAsc)}>
                  <SortableHeader label="类型" active={sortKey === "type"} ascending={sortAsc} onToggle={() => toggleSort("type")} />
                </th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "basePath", sortAsc)}>
                  <SortableHeader
                    label="路径"
                    active={sortKey === "basePath"}
                    ascending={sortAsc}
                    onToggle={() => toggleSort("basePath")}
                  />
                </th>
                <th className="px-2 py-2" aria-sort={getAriaSort(sortKey === "encrypted", sortAsc)}>
                  <SortableHeader
                    label="加密"
                    active={sortKey === "encrypted"}
                    ascending={sortAsc}
                    onToggle={() => toggleSort("encrypted")}
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              {table.paged.map((s) => (
                <tr key={s.id} className="border-b border-[var(--ark-line)]/70">
                  <td className="px-2 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(s.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(s.id);
                        else next.delete(s.id);
                        setSelected(next);
                      }}
                    />
                  </td>
                  <td className="px-2 py-2 font-medium">{s.name}</td>
                  <td className="px-2 py-2">{s.type}</td>
                  <td className="break-all px-2 py-2 text-sm mp-muted">{s.basePath}</td>
                  <td className="px-2 py-2">{s.encrypted ? "是" : "否"}</td>
                </tr>
              ))}
              {!table.paged.length ? (
                <tr>
                  <td className="px-2 py-4 text-center text-sm mp-muted" colSpan={5}>暂无数据</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
        {!table.totalItems ? (
          <div className="mt-3 flex justify-center md:justify-end">
            <button type="button" className="mp-btn" onClick={() => setFormOpen(true)}>
              去新增存储
            </button>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDeleteStorageIds?.length)}
        title="删除存储"
        description={`将删除 ${pendingDeleteStorageIds?.length ?? 0} 个存储，删除后不可恢复。`}
        confirmText="确认删除"
        busy={deletingSelected}
        onCancel={() => setPendingDeleteStorageIds(null)}
        onConfirm={() => void handleDeleteSelected()}
      />
    </section>
  );
}
