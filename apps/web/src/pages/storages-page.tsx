import * as Collapsible from "@radix-ui/react-collapsible";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PathPicker } from "../components/path-picker";
import { TablePagination } from "../components/table/table-pagination";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { browseDirectories, createStorage, deleteStorage, getStorages } from "../lib/api";
import type { StorageTarget } from "../types/api";

type SortKey = "name" | "type" | "basePath" | "encrypted";

const initialForm: Omit<StorageTarget, "id"> = {
  name: "",
  type: "local_fs",
  basePath: "",
  encrypted: false
};

export function StoragesPage() {
  const [items, setItems] = useState<StorageTarget[]>([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
    try {
      await createStorage(form);
      setForm(initialForm);
      setFormOpen(false);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteSelected() {
    setError("");
    try {
      await Promise.all([...selected].map((id) => deleteStorage(id)));
      await load();
    } catch (err) {
      setError((err as Error).message);
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
        (row: StorageTarget, keyword: string) =>
          `${row.name} ${row.type} ${row.basePath}`.toLowerCase().includes(keyword),
      []
    )
  );

  const allCurrentPageSelected = table.paged.length > 0 && table.paged.every((s) => selected.has(s.id));

  return (
    <section className="space-y-3">
      <Collapsible.Root open={formOpen} onOpenChange={setFormOpen} className="mp-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="mp-section-title">目标存储</h2>
            <p className="mt-1 text-xs mp-muted">支持本地目录下拉选择和手动输入路径</p>
          </div>
          <Collapsible.Trigger className="mp-btn">{formOpen ? "收起" : "新增存储"}</Collapsible.Trigger>
        </div>
        {error ? <p className="mp-error mt-3">{error}</p> : null}

        <Collapsible.Content>
          <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input className="mp-input" placeholder="名称" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            <select className="mp-select" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as StorageTarget["type"] }))}>
              <option value="local_fs">local_fs</option>
              <option value="external_ssd">external_ssd</option>
              <option value="cloud_115">cloud_115</option>
            </select>
            <div className="sm:col-span-2">
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
            </div>

            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.encrypted} onChange={(e) => setForm((p) => ({ ...p, encrypted: e.target.checked }))} />加密存储</label>
            <button type="submit" className="mp-btn mp-btn-primary sm:col-span-2">新增存储</button>
          </form>
        </Collapsible.Content>
      </Collapsible.Root>

      <div className="mp-panel p-4">
        <div className="mb-2 flex items-center justify-between">
          <TableToolbar title="存储列表" search={search} onSearchChange={setSearch} pageSize={table.pageSize} onPageSizeChange={table.setPageSize} totalItems={table.totalItems} />
        </div>
        <div className="mb-2 flex justify-end">
          <button className="mp-btn" type="button" disabled={!selected.size} onClick={() => void handleDeleteSelected()}>
            批量删除 ({selected.size})
          </button>
        </div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ark-line)] text-left text-xs mp-muted">
                <th className="px-2 py-2"><input type="checkbox" checked={allCurrentPageSelected} onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) table.paged.forEach((s) => next.add(s.id));
                  else table.paged.forEach((s) => next.delete(s.id));
                  setSelected(next);
                }} /></th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("name")}>名称</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("type")}>类型</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("basePath")}>路径</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("encrypted")}>加密</th>
              </tr>
            </thead>
            <tbody>
              {table.paged.map((s) => (
                <tr key={s.id} className="border-b border-[var(--ark-line)]/70">
                  <td className="px-2 py-2"><input type="checkbox" checked={selected.has(s.id)} onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(s.id); else next.delete(s.id);
                    setSelected(next);
                  }} /></td>
                  <td className="px-2 py-2 font-medium">{s.name}</td>
                  <td className="px-2 py-2">{s.type}</td>
                  <td className="px-2 py-2 break-all text-xs mp-muted">{s.basePath}</td>
                  <td className="px-2 py-2">{s.encrypted ? "是" : "否"}</td>
                </tr>
              ))}
              {!table.paged.length ? <tr><td className="px-2 py-4 text-center text-xs mp-muted" colSpan={5}>暂无数据</td></tr> : null}
            </tbody>
          </table>
        </div>
        <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
      </div>
    </section>
  );
}
