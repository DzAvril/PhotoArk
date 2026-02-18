import { useEffect, useMemo, useState } from "react";
import { TablePagination } from "../components/table/table-pagination";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { createPreviewToken, getBackups, getLivePhotoDetail, getPreview, getStorages } from "../lib/api";
import type { BackupAsset, LivePhotoDetail, PreviewResult, StorageTarget } from "../types/api";

type SortKey = "name" | "kind" | "storageTargetId" | "encrypted";
const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export function BackupsPage() {
  const [items, setItems] = useState<BackupAsset[]>([]);
  const [storages, setStorages] = useState<StorageTarget[]>([]);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [liveDetail, setLiveDetail] = useState<LivePhotoDetail["pair"]>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);

  const storageById = useMemo(() => Object.fromEntries(storages.map((s) => [s.id, s])), [storages]);

  async function load() {
    try {
      const [backupsRes, storagesRes] = await Promise.all([getBackups(), getStorages()]);
      setItems(backupsRes.items);
      setStorages(storagesRes.items);
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
        (row: BackupAsset, keyword: string) => {
          const storage = storageById[row.storageTargetId];
          return `${row.name} ${row.kind} ${storage?.name ?? row.storageTargetId}`.toLowerCase().includes(keyword);
        },
      [storageById]
    )
  );

  return (
    <section className="space-y-3">
      <div className="mp-panel p-4">
        <h2 className="mp-section-title">备份内容</h2>
        <p className="mt-1 text-xs mp-muted">此页面展示任务执行后自动生成的备份文件索引，不需要手动新增资产。</p>
        {error ? <p className="mp-error mt-3">{error}</p> : null}
      </div>

      {preview ? (
        <article className="mp-panel p-4 text-xs">
          <p>预览资产: {preview.assetId}</p>
          <p className="mt-1">模式: {preview.mode}</p>
          <p className="mt-1">流地址: {preview.streamUrl}</p>
          <a className="mt-2 inline-block text-[var(--ark-primary)] underline" href={`${apiBase}${preview.streamUrl}`} target="_blank" rel="noreferrer">
            打开预览流接口
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
        <TableToolbar title="备份文件列表" search={search} onSearchChange={setSearch} pageSize={table.pageSize} onPageSizeChange={table.setPageSize} totalItems={table.totalItems} />
        <div className="overflow-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--ark-line)] text-left text-xs mp-muted">
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("name")}>文件</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("kind")}>类型</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("storageTargetId")}>所属存储</th>
                <th className="px-2 py-2 cursor-pointer" onClick={() => toggleSort("encrypted")}>加密状态</th>
                <th className="px-2 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {table.paged.map((a) => {
                const st = storageById[a.storageTargetId];
                return (
                  <tr key={a.id} className="border-b border-[var(--ark-line)]/70">
                    <td className="px-2 py-2 font-medium break-all">{a.name}</td>
                    <td className="px-2 py-2">{a.kind}</td>
                    <td className="px-2 py-2 text-xs">
                      <div>{st?.name ?? a.storageTargetId}</div>
                      <div className="mp-muted break-all">{st?.basePath ?? ""}</div>
                    </td>
                    <td className="px-2 py-2">{a.encrypted ? "加密" : "明文"}</td>
                    <td className="px-2 py-2"><button type="button" onClick={() => void handlePreview(a.id)} className="mp-btn">请求预览</button></td>
                  </tr>
                );
              })}
              {!table.paged.length ? <tr><td className="px-2 py-4 text-center text-xs mp-muted" colSpan={5}>暂无数据</td></tr> : null}
            </tbody>
          </table>
        </div>
        <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
      </div>
    </section>
  );
}
