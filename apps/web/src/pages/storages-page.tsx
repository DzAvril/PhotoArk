import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ConfirmDialog } from "../components/confirm-dialog";
import { DataTable, type DataTableColumn } from "../components/data/data-table";
import { MetricTile } from "../components/data/metric-tile";
import { MobileList } from "../components/data/mobile-list";
import { StatusBadge } from "../components/data/status-badge";
import { InlineAlert } from "../components/inline-alert";
import { PathPicker } from "../components/path-picker";
import { TablePagination } from "../components/table/table-pagination";
import { SortableHeader } from "../components/table/sortable-header";
import { TableToolbar } from "../components/table/table-toolbar";
import { useTablePagination } from "../components/table/use-table-pagination";
import { Button } from "../components/ui/button";
import { Field } from "../components/ui/field";
import { Modal } from "../components/ui/modal";
import { PageHeader } from "../components/ui/page-header";
import { useLocalStorageState } from "../hooks/use-local-storage-state";
import { browseDirectories, createStorage, deleteStorage, getStorageCapacities, getStorages } from "../lib/api";
import type { StorageCapacityItem, StorageTarget } from "../types/api";

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

function getStorageTypeLabel(type: StorageTarget["type"]): string {
  if (type === "local_fs") return "NAS";
  if (type === "external_ssd") return "SSD";
  return "115 云盘";
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "未知";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function getCapacityForStorage(storageId: string, capacities: StorageCapacityItem[]): StorageCapacityItem | undefined {
  return capacities.find((item) => item.storageIds.includes(storageId));
}

function getCapacityTone(capacity: StorageCapacityItem | undefined): "neutral" | "success" | "warning" {
  if (!capacity) return "neutral";
  if (!capacity.available) return "warning";
  return (capacity.usedPercent ?? 0) >= 85 ? "warning" : "success";
}

export function StoragesPage() {
  const [items, setItems] = useState<StorageTarget[]>([]);
  const [capacities, setCapacities] = useState<StorageCapacityItem[]>([]);
  const [capacityError, setCapacityError] = useState("");
  const [loading, setLoading] = useState(true);
  const [capacityLoading, setCapacityLoading] = useState(false);
  const [lastStorageType, setLastStorageType] = useLocalStorageState<StorageTarget["type"]>(
    "ark-last-storage-type",
    "local_fs"
  );
  const [form, setForm] = useState<Omit<StorageTarget, "id">>(() => createInitialForm(lastStorageType));
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [pendingDeleteStorageIds, setPendingDeleteStorageIds] = useState<string[] | null>(null);

  async function load() {
    setLoading(true);
    setCapacityLoading(true);
    const [storagesResult, capacitiesResult] = await Promise.allSettled([getStorages(), getStorageCapacities()]);

    if (storagesResult.status === "fulfilled") {
      setItems(storagesResult.value.items);
      setSelected(new Set());
    } else {
      setError((storagesResult.reason as Error).message);
    }

    if (capacitiesResult.status === "fulfilled") {
      setCapacities(capacitiesResult.value.items);
      setCapacityError("");
    } else {
      setCapacityError((capacitiesResult.reason as Error).message);
      setCapacities([]);
    }

    setLoading(false);
    setCapacityLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setCreating(true);
    try {
      await createStorage(form);
      setLastStorageType(form.type);
      setForm(createInitialForm(form.type));
      setCreateOpen(false);
      setMessage("已新增存储。");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
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

  function toggleStorageSelected(storageId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(storageId);
    else next.delete(storageId);
    setSelected(next);
  }

  function renderCapacity(storage: StorageTarget) {
    const capacity = getCapacityForStorage(storage.id, capacities);
    if (!capacity) return <StatusBadge>未知</StatusBadge>;
    if (!capacity.available) return <StatusBadge tone="warning">{capacity.reason ?? "不可读取"}</StatusBadge>;
    return (
      <div className="space-y-1">
        <StatusBadge tone={getCapacityTone(capacity)}>
          {capacity.usedPercent === null ? "容量已读取" : `已用 ${Math.round(capacity.usedPercent)}%`}
        </StatusBadge>
        <p className="text-xs mp-muted">
          {formatBytes(capacity.usedBytes)} / {formatBytes(capacity.totalBytes)} · 可用 {formatBytes(capacity.freeBytes)}
        </p>
      </div>
    );
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
  const encryptedCount = items.filter((item) => item.encrypted).length;
  const localCount = items.filter((item) => item.type !== "cloud_115").length;
  const cloudCount = items.length - localCount;
  const knownCapacityIds = new Set(
    capacities
      .filter((item) => item.available)
      .flatMap((item) => item.storageIds)
  );

  const columns: DataTableColumn<StorageTarget>[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          aria-label="选择当前页全部存储"
          checked={allCurrentPageSelected}
          onChange={(e) => {
            const next = new Set(selected);
            if (e.target.checked) table.paged.forEach((s) => next.add(s.id));
            else table.paged.forEach((s) => next.delete(s.id));
            setSelected(next);
          }}
        />
      ),
      render: (storage) => (
        <input
          type="checkbox"
          aria-label={`选择存储 ${storage.name}`}
          checked={selected.has(storage.id)}
          onChange={(e) => toggleStorageSelected(storage.id, e.target.checked)}
        />
      ),
      className: "w-10 px-3 py-2 align-top"
    },
    {
      key: "name",
      header: <SortableHeader label="名称" active={sortKey === "name"} ascending={sortAsc} onToggle={() => toggleSort("name")} />,
      render: (storage) => (
        <div className="min-w-[150px]">
          <p className="font-semibold">{storage.name}</p>
          <p className="mt-1 text-xs mp-muted">{storage.id}</p>
        </div>
      ),
      headerProps: { "aria-sort": getAriaSort(sortKey === "name", sortAsc) },
      className: "px-3 py-2 align-top"
    },
    {
      key: "type",
      header: <SortableHeader label="类型" active={sortKey === "type"} ascending={sortAsc} onToggle={() => toggleSort("type")} />,
      render: (storage) => <StatusBadge tone={storage.type === "cloud_115" ? "info" : "neutral"}>{getStorageTypeLabel(storage.type)}</StatusBadge>,
      headerProps: { "aria-sort": getAriaSort(sortKey === "type", sortAsc) },
      className: "px-3 py-2 align-top"
    },
    {
      key: "basePath",
      header: <SortableHeader label="路径" active={sortKey === "basePath"} ascending={sortAsc} onToggle={() => toggleSort("basePath")} />,
      render: (storage) => <span className="break-all text-sm mp-muted">{storage.basePath}</span>,
      headerProps: { "aria-sort": getAriaSort(sortKey === "basePath", sortAsc) },
      className: "min-w-[240px] px-3 py-2 align-top"
    },
    {
      key: "encrypted",
      header: <SortableHeader label="加密" active={sortKey === "encrypted"} ascending={sortAsc} onToggle={() => toggleSort("encrypted")} />,
      render: (storage) => <StatusBadge tone={storage.encrypted ? "success" : "neutral"}>{storage.encrypted ? "已加密" : "未加密"}</StatusBadge>,
      headerProps: { "aria-sort": getAriaSort(sortKey === "encrypted", sortAsc) },
      className: "px-3 py-2 align-top"
    },
    {
      key: "capacity",
      header: "容量",
      render: renderCapacity,
      className: "min-w-[190px] px-3 py-2 align-top"
    },
    {
      key: "actions",
      header: "操作",
      render: (storage) => (
        <Button
          size="sm"
          variant="danger"
          disabled={deletingSelected}
          onClick={() => setPendingDeleteStorageIds([storage.id])}
        >
          删除
        </Button>
      ),
      className: "w-20 px-3 py-2 align-top"
    }
  ];

  return (
    <section className="space-y-4">
      <PageHeader
        title="存储配置"
        description="管理本地 NAS、外接 SSD 和 115 云盘等备份目标。"
        chips={
          <>
            <StatusBadge>总存储 {items.length}</StatusBadge>
            <StatusBadge tone="success">本地 {localCount}</StatusBadge>
            <StatusBadge tone={cloudCount > 0 ? "info" : "neutral"}>云存储 {cloudCount}</StatusBadge>
            {capacityLoading ? <StatusBadge tone="info">容量读取中</StatusBadge> : null}
          </>
        }
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            新增存储
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="总存储" value={items.length} description={`${table.totalItems} 个匹配当前筛选`} />
        <MetricTile label="本地存储" value={localCount} description="NAS 与外接 SSD" tone="success" />
        <MetricTile label="云存储" value={cloudCount} description="115 云盘等 URI 目标" tone={cloudCount > 0 ? "info" : "neutral"} />
        <MetricTile
          label={capacities.length ? "容量已知" : "加密存储"}
          value={capacities.length ? knownCapacityIds.size : encryptedCount}
          description={capacities.length ? `已读取 ${capacities.length} 组容量` : "容量接口暂无数据"}
          tone={capacityError ? "warning" : "neutral"}
        />
      </div>

      <section className="mp-panel min-h-0 p-4 md:flex md:flex-1 md:flex-col">
        <div className="flex flex-col gap-3">
          {message ? (
            <InlineAlert tone="success" onClose={() => setMessage("")} autoCloseMs={5200}>
              {message}
            </InlineAlert>
          ) : null}
          {error ? (
            <InlineAlert tone="error" onClose={() => setError("")}>
              {error}
            </InlineAlert>
          ) : null}
          {capacityError ? (
            <InlineAlert tone="info" onClose={() => setCapacityError("")}>
              容量信息暂不可用：{capacityError}
            </InlineAlert>
          ) : null}
        </div>

        <div className={`${message || error || capacityError ? "mt-3" : ""} flex flex-col gap-2 md:flex-row md:items-start md:justify-between`}>
          <TableToolbar
            title="存储列表"
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
            onClick={() => setPendingDeleteStorageIds([...selected])}
          >
            {deletingSelected ? "删除中..." : `批量删除 (${selected.size})`}
          </Button>
        </div>

        {loading && !items.length ? <p className="py-10 text-center text-sm mp-muted">正在读取存储配置...</p> : null}
        {!loading && !items.length ? (
          <div className="mp-panel-soft mt-4 rounded-md p-4 text-sm mp-muted">
            暂无存储。请先新增一个 NAS、SSD 或云盘目标。
          </div>
        ) : null}
        {items.length ? (
          <>
            <MobileList
              items={table.paged}
              getKey={(storage) => storage.id}
              empty={<p className="py-6 text-center text-sm mp-muted md:hidden">暂无匹配存储</p>}
              renderItem={(storage) => (
                <article className="mp-mobile-card">
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      aria-label={`选择存储 ${storage.name}`}
                      checked={selected.has(storage.id)}
                      onChange={(e) => toggleStorageSelected(storage.id, e.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate text-sm font-semibold">{storage.name}</h4>
                      <p className="mt-1 text-xs mp-muted">{storage.id}</p>
                    </div>
                    <StatusBadge tone={storage.type === "cloud_115" ? "info" : "neutral"}>{getStorageTypeLabel(storage.type)}</StatusBadge>
                  </div>
                  <dl className="mp-kv mt-3">
                    <dt>路径</dt>
                    <dd className="break-all">{storage.basePath}</dd>
                    <dt>加密</dt>
                    <dd>{storage.encrypted ? "已加密" : "未加密"}</dd>
                    <dt>容量</dt>
                    <dd>{renderCapacity(storage)}</dd>
                  </dl>
                  <div className="mt-3">
                    <Button size="sm" variant="danger" disabled={deletingSelected} onClick={() => setPendingDeleteStorageIds([storage.id])}>
                      删除
                    </Button>
                  </div>
                </article>
              )}
            />
            <div className="mt-3 md:min-h-0 md:flex-1 md:overflow-auto">
              <DataTable
                items={table.paged}
                columns={columns}
                getKey={(storage) => storage.id}
                empty={<p className="py-6 text-center text-sm mp-muted">暂无匹配存储</p>}
              />
            </div>
            <TablePagination page={table.page} totalPages={table.totalPages} onChange={table.setPage} />
          </>
        ) : null}
      </section>

      <Modal
        open={createOpen}
        title="新增存储"
        onClose={() => setCreateOpen(false)}
        footer={
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="submit" form="storage-form" variant="primary" busy={creating}>
              新增存储
            </Button>
          </div>
        }
      >
        <form id="storage-form" onSubmit={(e) => void onSubmit(e)} className="grid gap-4 sm:grid-cols-2">
          <Field id="storage-name" label="名称" help="建议带上设备角色，例如“NAS-照片库”或“移动 SSD”。">
            <input
              id="storage-name"
              className="mp-input"
              placeholder="例如：NAS-主盘"
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </Field>

          <Field id="storage-type" label="类型">
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
              <option value="local_fs">NAS</option>
              <option value="external_ssd">SSD</option>
              <option value="cloud_115">115 云盘</option>
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field
              id="storage-base-path"
              label="路径"
              help={isLocalType ? "本地存储请选择实际挂载目录；建议为单一根目录，避免和其他存储重叠。" : "云存储请填写标准 URI，例如 115://photoark。"}
            >
              {isLocalType ? (
                <PathPicker
                  id="storage-base-path"
                  value={form.basePath}
                  onChange={(basePath) => setForm((p) => ({ ...p, basePath }))}
                  placeholder="输入本地目录路径，或点右侧选择路径"
                  browse={browseDirectories}
                  required
                />
              ) : (
                <input
                  id="storage-base-path"
                  className="mp-input"
                  placeholder="115://photoark 或其他 URI"
                  value={form.basePath}
                  onChange={(e) => setForm((p) => ({ ...p, basePath: e.target.value }))}
                  required
                />
              )}
            </Field>
          </div>

          <Field id="storage-encrypted" label="加密存储" help="启用后该存储目标会按后端配置进行加密处理。">
            <input
              id="storage-encrypted"
              type="checkbox"
              checked={form.encrypted}
              onChange={(e) => setForm((p) => ({ ...p, encrypted: e.target.checked }))}
            />
          </Field>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(pendingDeleteStorageIds?.length)}
        title="删除存储"
        description={`将删除 ${pendingDeleteStorageIds?.length ?? 0} 个存储，删除后不可恢复。`}
        confirmText="确认删除"
        destructive
        busy={deletingSelected}
        onCancel={() => setPendingDeleteStorageIds(null)}
        onConfirm={() => void handleDeleteSelected()}
      />
    </section>
  );
}
