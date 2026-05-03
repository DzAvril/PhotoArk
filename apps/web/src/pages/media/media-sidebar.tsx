import { RefreshCw } from "lucide-react";
import { StatusBadge } from "../../components/data/status-badge";
import { Button } from "../../components/ui/button";
import { Field } from "../../components/ui/field";
import { SegmentedControl } from "../../components/ui/segmented-control";
import type { StorageTarget } from "../../types/api";
import type { MediaKindFilter } from "./media-types";
import { getStorageTypeLabel } from "./media-utils";

type DateRangeFilter = "all" | "7d" | "30d" | "365d";

type MediaSidebarProps = {
  idPrefix?: string;
  storages: StorageTarget[];
  storageId: string;
  selectedStorage: StorageTarget | undefined;
  loadingMedia: boolean;
  displayCount: number;
  kindFilter: MediaKindFilter;
  normalizedThumbSize: number;
  searchTerm: string;
  dateRange: DateRangeFilter;
  onStorageChange: (nextId: string) => void;
  onRefresh: () => void;
  onKindFilterChange: (next: MediaKindFilter) => void;
  onThumbSizeChange: (next: number) => void;
  onSearchChange: (next: string) => void;
  onDateRangeChange: (next: DateRangeFilter) => void;
};

const kindItems: Array<{ value: MediaKindFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "live", label: "Live Photo" }
];

const dateRangeItems: Array<{ value: DateRangeFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "7d", label: "近 7 天" },
  { value: "30d", label: "近 30 天" },
  { value: "365d", label: "近一年" }
];

export function MediaSidebar(props: MediaSidebarProps) {
  const {
    idPrefix = "media",
    storages,
    storageId,
    selectedStorage,
    loadingMedia,
    displayCount,
    kindFilter,
    normalizedThumbSize,
    searchTerm,
    dateRange,
    onStorageChange,
    onRefresh,
    onKindFilterChange,
    onThumbSizeChange,
    onSearchChange,
    onDateRangeChange
  } = props;
  const storageSelectId = `${idPrefix}-storage-select`;
  const searchId = `${idPrefix}-search`;
  const zoomId = `${idPrefix}-zoom`;
  const showCloudPreviewHint = !selectedStorage || selectedStorage.type === "cloud_115";

  return (
    <aside className="mp-panel flex min-h-0 flex-col gap-4 p-3">
      <div className="space-y-3">
        <Field id={storageSelectId} label="选择存储">
          <select
            id={storageSelectId}
            className="mp-select"
            value={storageId}
            disabled={!storages.length}
            onChange={(e) => onStorageChange(e.target.value)}
          >
            <option value="">选择存储</option>
            {storages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({getStorageTypeLabel(s.type)})
              </option>
            ))}
          </select>
        </Field>
        <Button className="w-full justify-center" onClick={onRefresh} disabled={!selectedStorage || loadingMedia} busy={loadingMedia}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          刷新目录
        </Button>
      </div>

      <div className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={selectedStorage ? "success" : "neutral"}>
            {selectedStorage ? getStorageTypeLabel(selectedStorage.type) : "未选择存储"}
          </StatusBadge>
          {showCloudPreviewHint ? <StatusBadge tone="info">115 云盘暂不支持直接预览</StatusBadge> : null}
          <StatusBadge>筛选 {displayCount.toLocaleString("zh-CN")}</StatusBadge>
        </div>
        <p className="mt-2 break-all text-xs leading-5 mp-muted">
          {selectedStorage ? `${selectedStorage.name} · ${selectedStorage.basePath}` : "选择本地存储后可浏览媒体。"}
        </p>
      </div>

      <div>
        <p className="mb-2 mp-kicker">筛选类型</p>
        <SegmentedControl ariaLabel="筛选媒体类型" value={kindFilter} items={kindItems} onChange={onKindFilterChange} />
      </div>

      <Field id={searchId} label="快速搜索">
        <input
          id={searchId}
          className="mp-input"
          placeholder="输入文件名或路径关键词"
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </Field>

      <div>
        <p className="mb-2 mp-kicker">时间范围</p>
        <SegmentedControl ariaLabel="筛选拍摄时间" value={dateRange} items={dateRangeItems} onChange={onDateRangeChange} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor={zoomId} className="text-sm font-medium">
            缩略图尺寸
          </label>
          <StatusBadge>{normalizedThumbSize}px</StatusBadge>
        </div>
        <input
          id={zoomId}
          type="range"
          min={110}
          max={260}
          step={10}
          value={normalizedThumbSize}
          onChange={(e) => onThumbSizeChange(Number(e.target.value))}
          className="mp-slider"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={normalizedThumbSize <= 150 ? "primary" : "default"}
            className="flex-1"
            onClick={() => onThumbSizeChange(140)}
          >
            紧凑
          </Button>
          <Button
            size="sm"
            variant={normalizedThumbSize > 150 && normalizedThumbSize < 200 ? "primary" : "default"}
            className="flex-1"
            onClick={() => onThumbSizeChange(170)}
          >
            标准
          </Button>
          <Button
            size="sm"
            variant={normalizedThumbSize >= 200 ? "primary" : "default"}
            className="flex-1"
            onClick={() => onThumbSizeChange(220)}
          >
            放大
          </Button>
        </div>
      </div>
    </aside>
  );
}
