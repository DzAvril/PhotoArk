import { useEffect, useMemo, useState } from "react";
import { InlineAlert } from "../components/inline-alert";
import { EmptyState } from "../components/ui/empty-state";
import { SectionCard } from "../components/ui/section-card";
import { compareStorages, getStorages } from "../lib/api";
import type { StorageTarget } from "../types/api";
import type { DiffItem, DiffResult, DiffFilters, DiffFilterStatus, DiffFilterKind } from "../types/diff";
import { DiffPreviewModal } from "./diff-preview-modal";

const statusLabels: Record<DiffFilterStatus, string> = {
  all: "全部",
  left_only: "仅左侧",
  right_only: "仅右侧",
  different: "有差异",
  same: "相同",
};

const kindLabels: Record<DiffFilterKind, string> = {
  all: "全部类型",
  image: "图片",
  video: "视频",
  other: "其他",
};

function getStorageTypeLabel(type: StorageTarget["type"]): string {
  if (type === "local_fs") return "NAS";
  if (type === "external_ssd") return "SSD";
  return "115 云盘";
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 100 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getKindFromPath(path: string): "image" | "video" | "other" {
  const lower = path.toLowerCase();
  if (/\.(jpg|jpeg|png|heic|webp|gif|bmp|tiff?)$/i.test(lower)) return "image";
  if (/\.(mov|mp4|m4v|avi|mkv|webm|flv|wmv)$/i.test(lower)) return "video";
  return "other";
}

export function DiffPage() {
  const [storages, setStorages] = useState<StorageTarget[]>([]);
  const [leftStorageId, setLeftStorageId] = useState<string>("");
  const [rightStorageId, setRightStorageId] = useState<string>("");
  const [result, setResult] = useState<DiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const [filters, setFilters] = useState<DiffFilters>({
    status: "all",
    kind: "all",
    search: "",
  });

  const [previewItem, setPreviewItem] = useState<DiffItem | null>(null);
  const [previewSide, setPreviewSide] = useState<"left" | "right">("left");

  useEffect(() => {
    void getStorages().then((res) => {
      setStorages(res.items);
      if (res.items.length >= 2) {
        setLeftStorageId(res.items[0].id);
        setRightStorageId(res.items[1].id);
      }
    });
  }, []);

  async function handleCompare() {
    if (!leftStorageId || !rightStorageId) {
      setError("请选择两个存储");
      return;
    }
    if (leftStorageId === rightStorageId) {
      setError("不能选择同一个存储进行对比");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await compareStorages(leftStorageId, rightStorageId);
      setResult(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const filteredItems = useMemo(() => {
    if (!result) return [];
    return result.items.filter((item) => {
      // Status filter
      if (filters.status !== "all") {
        if (filters.status === "left_only" && item.status !== "left_only") return false;
        if (filters.status === "right_only" && item.status !== "right_only") return false;
        if (filters.status === "different" && item.status !== "both_different") return false;
        if (filters.status === "same" && item.status !== "both_same") return false;
      }
      // Kind filter
      if (filters.kind !== "all") {
        const itemKind = getKindFromPath(item.relativePath);
        if (filters.kind !== itemKind) return false;
      }
      // Search filter
      if (filters.search.trim()) {
        const search = filters.search.toLowerCase();
        const path = item.relativePath.toLowerCase();
        if (!path.includes(search)) return false;
      }
      return true;
    });
  }, [result, filters]);

  const summary = result?.summary;

  return (
    <section className="space-y-4 md:flex md:h-full md:flex-col">
      <SectionCard
        title="存储对比"
        description="用于按目录比较两个存储的文件差异，适合人工核对，不会直接执行同步。"
        right={
          <button
            type="button"
            className="mp-btn mp-btn-primary"
            onClick={() => void handleCompare()}
            disabled={loading || !leftStorageId || !rightStorageId}
          >
            {loading ? "对比中..." : "开始对比"}
          </button>
        }
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-sm font-medium">左侧存储</label>
            <select
              className="mp-select"
              value={leftStorageId}
              onChange={(e) => setLeftStorageId(e.target.value)}
            >
              <option value="">选择存储</option>
              {storages.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === rightStorageId}>
                  {s.name} ({getStorageTypeLabel(s.type)})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium">右侧存储</label>
            <select
              className="mp-select"
              value={rightStorageId}
              onChange={(e) => setRightStorageId(e.target.value)}
            >
              <option value="">选择存储</option>
              {storages.map((s) => (
                <option key={s.id} value={s.id} disabled={s.id === leftStorageId}>
                  {s.name} ({getStorageTypeLabel(s.type)})
                </option>
              ))}
            </select>
          </div>
        </div>

        {error ? (
          <InlineAlert tone="error" className="mt-3" onClose={() => setError("")}>
            {error}
          </InlineAlert>
        ) : null}

        {summary ? (
          <div className="mt-4 mp-stat-grid">
            <div className="mp-stat-card">
              <h4>总文件数</h4>
              <p className="text-2xl font-semibold">{summary.totalCount}</p>
            </div>
            <div className="mp-stat-card">
              <h4>仅左侧</h4>
              <p className="text-2xl font-semibold text-amber-600">{summary.leftOnlyCount}</p>
            </div>
            <div className="mp-stat-card">
              <h4>仅右侧</h4>
              <p className="text-2xl font-semibold text-amber-600">{summary.rightOnlyCount}</p>
            </div>
            <div className="mp-stat-card">
              <h4>完全相同</h4>
              <p className="text-2xl font-semibold text-emerald-600">{summary.bothSameCount}</p>
            </div>
            <div className="mp-stat-card">
              <h4>存在差异</h4>
              <p className="text-2xl font-semibold text-red-600">{summary.bothDifferentCount}</p>
            </div>
            <div className="mp-stat-card">
              <h4>图片</h4>
              <p className="text-2xl font-semibold">{summary.imageCount}</p>
            </div>
            <div className="mp-stat-card">
              <h4>视频</h4>
              <p className="text-2xl font-semibold">{summary.videoCount}</p>
            </div>
          </div>
        ) : null}
      </SectionCard>

      {result ? (
        <SectionCard
          title="差异明细"
          description="支持状态、类型与关键字过滤，可快速定位差异文件。"
          className="md:min-h-0 md:flex-1 md:flex md:flex-col"
          right={
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="mp-chip">显示 {filteredItems.length} / {result.items.length}</span>
              <span className="mp-chip">{statusLabels[filters.status]}</span>
              <span className="mp-chip">{kindLabels[filters.kind]}</span>
            </div>
          }
        >
          <div className="mp-toolbar">
            <div className="mp-toolbar-group">
              <label className="text-sm font-medium">
                状态
                <select
                  className="mp-select ml-2 h-8 min-h-0 py-1 text-sm"
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value as DiffFilterStatus }))}
                >
                  <option value="all">全部 ({summary?.totalCount ?? 0})</option>
                  <option value="left_only">仅左侧 ({summary?.leftOnlyCount ?? 0})</option>
                  <option value="right_only">仅右侧 ({summary?.rightOnlyCount ?? 0})</option>
                  <option value="different">有差异 ({summary?.bothDifferentCount ?? 0})</option>
                  <option value="same">完全相同 ({summary?.bothSameCount ?? 0})</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                类型
                <select
                  className="mp-select ml-2 h-8 min-h-0 py-1 text-sm"
                  value={filters.kind}
                  onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value as DiffFilterKind }))}
                >
                  <option value="all">全部</option>
                  <option value="image">图片</option>
                  <option value="video">视频</option>
                  <option value="other">其他</option>
                </select>
              </label>
            </div>
            <div className="mp-toolbar-group">
              <label className="text-sm font-medium">
                搜索
                <input
                  type="text"
                  className="mp-input ml-2 h-8 min-h-0 py-1 text-sm"
                  placeholder="输入文件路径关键词..."
                  value={filters.search}
                  onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
                />
              </label>
            </div>
          </div>

          <div className="mt-3 min-h-0 flex-1 overflow-auto">
            <div className="mp-table-shell">
              <table className="mp-data-table min-w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--ark-line)] text-left">
                  <th className="px-2 py-2 text-xs font-semibold">相对路径</th>
                  <th className="px-2 py-2 text-xs font-semibold">状态</th>
                  <th className="px-2 py-2 text-xs font-semibold">类型</th>
                  <th className="px-2 py-2 text-xs font-semibold">左侧</th>
                  <th className="px-2 py-2 text-xs font-semibold">右侧</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const statusConfig: Record<
                    DiffItem["status"],
                    { label: string; className: string }
                  > = {
                    left_only: { label: "仅左侧", className: "text-amber-600" },
                    right_only: { label: "仅右侧", className: "text-amber-600" },
                    both_same: { label: "相同", className: "text-emerald-600" },
                    both_different: { label: "不同", className: "text-red-600" },
                  };
                  const statusInfo = statusConfig[item.status];
                  const isImage = item.kind === "image";

                  return (
                    <tr
                      key={item.relativePath}
                      className="border-b border-[var(--ark-line)]/70 hover:bg-[var(--ark-surface-soft)]"
                    >
                      <td className="max-w-xs px-2 py-2">
                        <div className="truncate font-mono text-xs" title={item.relativePath}>
                          {item.relativePath}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <span className={`text-xs font-medium ${statusInfo.className}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        <span className="rounded bg-[var(--ark-surface-soft)] px-1.5 py-0.5 text-xs">
                          {kindLabels[item.kind]}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {item.left ? (
                          <div className="space-y-0.5">
                            <div className="text-xs">{formatBytes(item.left.sizeBytes)}</div>
                            {isImage && (
                              <button
                                type="button"
                                className="text-xs text-[var(--ark-primary)] hover:underline"
                                onClick={() => {
                                  setPreviewItem(item);
                                  setPreviewSide("left");
                                }}
                              >
                                预览
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--ark-ink-soft)]">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {item.right ? (
                          <div className="space-y-0.5">
                            <div className="text-xs">{formatBytes(item.right.sizeBytes)}</div>
                            {isImage && (
                              <button
                                type="button"
                                className="text-xs text-[var(--ark-primary)] hover:underline"
                                onClick={() => {
                                  setPreviewItem(item);
                                  setPreviewSide("right");
                                }}
                              >
                                预览
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--ark-ink-soft)]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredItems.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-2 py-8 text-center text-sm text-[var(--ark-ink-soft)]">
                      没有找到匹配的项目
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>
        </SectionCard>
      ) : (
        <EmptyState title="暂无对比结果" description="选择两个存储并开始对比后，这里会展示差异明细。" />
      )}

      <DiffPreviewModal
        isOpen={!!previewItem}
        item={previewItem}
        side={previewSide}
        leftStorageId={leftStorageId}
        rightStorageId={rightStorageId}
        onClose={() => setPreviewItem(null)}
        onSwitchSide={() => setPreviewSide((s) => (s === "left" ? "right" : "left"))}
      />
    </section>
  );
}
