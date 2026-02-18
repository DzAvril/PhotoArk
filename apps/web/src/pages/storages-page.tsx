import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TablePagination } from "../components/table/table-pagination";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { browseDirectories, createStorage, getStorages } from "../lib/api";
import type { DirectoryBrowseResult, StorageTarget } from "../types/api";

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
  const [browser, setBrowser] = useState<DirectoryBrowseResult | null>(null);
  const [browseInput, setBrowseInput] = useState("");
  const [search, setSearch] = useState("");

  async function load() {
    try {
      const res = await getStorages();
      setItems(res.items);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function loadDirectories(targetPath?: string) {
    try {
      const res = await browseDirectories(targetPath);
      setBrowser(res);
      setBrowseInput(res.currentPath);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
    void loadDirectories();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createStorage(form);
      setForm(initialForm);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const isLocalType = form.type === "local_fs" || form.type === "external_ssd";

  const table = useTablePagination(
    items,
    search,
    useMemo(
      () =>
        (row: StorageTarget, keyword: string) =>
          `${row.name} ${row.type} ${row.basePath}`.toLowerCase().includes(keyword),
      []
    )
  );

  return (
    <section className="space-y-3">
      <div className="mp-panel p-4">
        <h2 className="mp-section-title">目标存储</h2>
        <p className="mt-1 text-xs mp-muted">支持本地目录下拉选择和手动输入路径</p>
        {error ? <p className="mp-error mt-3">{error}</p> : null}

        <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 sm:grid-cols-2">
          <input className="mp-input" placeholder="名称" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
          <select className="mp-select" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as StorageTarget["type"] }))}>
            <option value="local_fs">local_fs</option>
            <option value="external_ssd">external_ssd</option>
            <option value="cloud_115">cloud_115</option>
          </select>
          <input className="mp-input sm:col-span-2" placeholder={isLocalType ? "选择或输入本地目录路径" : "115://photoark 或其他 URI"} value={form.basePath} onChange={(e) => setForm((p) => ({ ...p, basePath: e.target.value }))} required />

          {isLocalType ? (
            <>
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:col-span-2">
                <input className="mp-input" placeholder="浏览路径（例如 /volume1）" value={browseInput} onChange={(e) => setBrowseInput(e.target.value)} />
                <button type="button" onClick={() => void loadDirectories(browseInput || undefined)} className="mp-btn">读取</button>
                <button type="button" onClick={() => void loadDirectories(browser?.parentPath ?? undefined)} className="mp-btn" disabled={!browser?.parentPath}>上级</button>
              </div>
              <select className="mp-select sm:col-span-2" value={form.basePath} onChange={(e) => setForm((p) => ({ ...p, basePath: e.target.value }))}>
                <option value="">从下拉选择目录</option>
                {browser?.directories.map((dir) => <option key={dir.path} value={dir.path}>{dir.path}</option>)}
              </select>
            </>
          ) : null}

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.encrypted} onChange={(e) => setForm((p) => ({ ...p, encrypted: e.target.checked }))} />加密存储</label>
          <button type="submit" className="mp-btn mp-btn-primary sm:col-span-2">新增存储</button>
        </form>
      </div>

      <div className="mp-panel p-4">
        <TableToolbar title="存储列表" search={search} onSearchChange={setSearch} pageSize={table.pageSize} onPageSizeChange={table.setPageSize} totalItems={table.totalItems} />
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ark-line)] text-left text-xs mp-muted">
                <th className="px-2 py-2">名称</th>
                <th className="px-2 py-2">类型</th>
                <th className="px-2 py-2">路径</th>
                <th className="px-2 py-2">加密</th>
              </tr>
            </thead>
            <tbody>
              {table.paged.map((s) => (
                <tr key={s.id} className="border-b border-[var(--ark-line)]/70">
                  <td className="px-2 py-2 font-medium">{s.name}</td>
                  <td className="px-2 py-2">{s.type}</td>
                  <td className="px-2 py-2 break-all text-xs mp-muted">{s.basePath}</td>
                  <td className="px-2 py-2">{s.encrypted ? "是" : "否"}</td>
                </tr>
              ))}
              {!table.paged.length ? (
                <tr>
                  <td className="px-2 py-4 text-center text-xs mp-muted" colSpan={4}>暂无数据</td>
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
