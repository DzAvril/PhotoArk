import * as Collapsible from "@radix-ui/react-collapsible";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { TablePagination } from "../components/table/table-pagination";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { createBackupAsset, createPreviewToken, deleteBackupAsset, getBackups, getLivePhotoDetail, getPreview } from "../lib/api";
import type { BackupAsset, LivePhotoDetail, PreviewResult } from "../types/api";

type SortKey = "name" | "kind" | "storageTargetId" | "encrypted";

const initialForm: Omit<BackupAsset, "id"> = {
  name: "",
  kind: "photo",
  storageTargetId: "",
  encrypted: true,
  sizeBytes: 0,
  capturedAt: new Date().toISOString(),
  livePhotoAssetId: ""
};
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export function BackupsPage() {
  const [items, setItems] = useState<BackupAsset[]>([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [liveDetail, setLiveDetail] = useState<LivePhotoDetail["pair"]>(null);
  const [formOpen, setFormOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const res = await getBackups();
      setItems(res.items);
      setSelected(new Set());
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handlePreview(assetId: string) {
    setError("");
    try {
      const tokenResult = await createPreviewToken(assetId);
      const previewResult = await getPreview(assetId, tokenResult.token);
      setPreview(previewResult);
      const detail = await getLivePhotoDetail(assetId);
      setLiveDetail(detail.pair);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createBackupAsset({
        ...form,
        sizeBytes: Number(form.sizeBytes),
        livePhotoAssetId: form.livePhotoAssetId || undefined
      });
      setForm(initialForm);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleDeleteSelected() {
    setError("");
    try {
      await Promise.all([...selected].map((id) => deleteBackupAsset(id)));
      await load();
    } catch (err) {
      setError((err as Error).message);
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
      const av = sortKey === "encrypted" ? Number(a.encrypted) : String(a[sortKey]);
      const bv = sortKey === "encrypted" ? Number(b.encrypted) : String(b[sortKey]);
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
        (row: BackupAsset, keyword: string) =>
          `${row.name} ${row.kind} ${row.storageTargetId}`.toLowerCase().includes(keyword),
      []
    )
  );

  const allCurrentPageSelected = table.paged.length > 0 && table.paged.every((a) => selected.has(a.id));

  return (
    <section className="space-y-3">
      <Collapsible.Root open={formOpen} onOpenChange={setFormOpen} className="mp-panel p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="mp-section-title">备份浏览</h2>
            <p className="mt-1 text-xs mp-muted">115 加密对象预览采用一次性 token + 内存解密流</p>
          </div>
          <Collapsible.Trigger className="mp-btn">{formOpen ? "收起" : "展开"}</Collapsible.Trigger>
        </div>
        {error ? <p className="mp-error mt-3">{error}</p> : null}

        <Collapsible.Content>
          <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <input className="mp-input" placeholder="文件名" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
            <input className="mp-input" placeholder="storageTargetId" value={form.storageTargetId} onChange={(e) => setForm((p) => ({ ...p, storageTargetId: e.target.value }))} required />
            <select className="mp-select" value={form.kind} onChange={(e) => setForm((p) => ({ ...p, kind: e.target.value as BackupAsset["kind"] }))}>
              <option value="photo">photo</option>
              <option value="live_photo_image">live_photo_image</option>
              <option value="live_photo_video">live_photo_video</option>
            </select>
            <input className="mp-input" type="number" placeholder="sizeBytes" value={form.sizeBytes} onChange={(e) => setForm((p) => ({ ...p, sizeBytes: Number(e.target.value) }))} required />
            <input className="mp-input" placeholder="livePhotoAssetId (可选)" value={form.livePhotoAssetId ?? ""} onChange={(e) => setForm((p) => ({ ...p, livePhotoAssetId: e.target.value }))} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.encrypted} onChange={(e) => setForm((p) => ({ ...p, encrypted: e.target.checked }))} />加密</label>
            <button type="submit" className="mp-btn mp-btn-primary sm:col-span-2 lg:col-span-3">新增资产</button>
          </form>
        </Collapsible.Content>
      </Collapsible.Root>

      {preview ? (
        <article className="mp-panel p-4 text-xs">
          <p>预览资产: {preview.assetId}</p>
          <p className="mt-1">模式: {preview.mode}</p>
          <p className="mt-1">流地址: {preview.streamUrl}</p>
          <a className="mt-2 inline-block text-[var(--ark-primary)] underline" href={`${apiBase}${preview.streamUrl}`} target="_blank" rel="noreferrer">
            打开预览流占位接口
          </a>
          {liveDetail ? (
            <div className="mt-2 rounded-md border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2">
              <p>Live Photo 资产组: {liveDetail.livePhotoAssetId}</p>
              <p>Image: {liveDetail.image?.name ?? "缺失"}</p>
              <p>Video: {liveDetail.video?.name ?? "缺失"}</p>
            </div>
          ) : null}
        </article>
      ) : null}

      <div className="mp-panel p-4">
        <TableToolbar title="备份资产列表" search={search} onSearchChange={setSearch} pageSize={table.pageSize} onPageSizeChange={table.setPageSize} totalItems={table.totalItems} />
        <div className="mb-2 flex justify-end"><button className="mp-btn" type="button" disabled={!selected.size} onClick={() => void handleDeleteSelected()}>批量删除 ({selected.size})</button></div>
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ark-line)] text-left text-xs mp-muted">
                <th className="px-2 py-2"><input type="checkbox" checked={allCurrentPageSelected} onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) table.paged.forEach((a) => next.add(a.id));
                  else table.paged.forEach((a) => next.delete(a.id));
                  setSelected(next);
                }} /></th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("name")}>文件</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("kind")}>类型</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("storageTargetId")}>存储</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("encrypted")}>状态</th>
                <th className="px-2 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {table.paged.map((a) => (
                <tr key={a.id} className="border-b border-[var(--ark-line)]/70">
                  <td className="px-2 py-2"><input type="checkbox" checked={selected.has(a.id)} onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(a.id); else next.delete(a.id);
                    setSelected(next);
                  }} /></td>
                  <td className="px-2 py-2 font-medium">{a.name}</td>
                  <td className="px-2 py-2">{a.kind}</td>
                  <td className="px-2 py-2 text-xs mp-muted">{a.storageTargetId}</td>
                  <td className="px-2 py-2">{a.encrypted ? "加密" : "明文"}</td>
                  <td className="px-2 py-2"><button type="button" onClick={() => void handlePreview(a.id)} className="mp-btn">请求预览</button></td>
                </tr>
              ))}
              {!table.paged.length ? <tr><td className="px-2 py-4 text-center text-xs mp-muted" colSpan={6}>暂无数据</td></tr> : null}
            </tbody>
          </table>
        </div>
        <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
      </div>
    </section>
  );
}
