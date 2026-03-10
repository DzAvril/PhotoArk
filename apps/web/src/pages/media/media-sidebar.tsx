import type { StorageTarget } from "../../types/api";
import type { MediaKindFilter } from "./media-types";
import { getStorageTypeLabel } from "./media-utils";

type MediaSidebarProps = {
  storages: StorageTarget[];
  storageId: string;
  selectedStorage: StorageTarget | undefined;
  loadingMedia: boolean;
  displayCount: number;
  kindFilter: MediaKindFilter;
  normalizedThumbSize: number;
  onStorageChange: (nextId: string) => void;
  onRefresh: () => void;
  onKindFilterChange: (next: MediaKindFilter) => void;
  onThumbSizeChange: (next: number) => void;
};

export function MediaSidebar(props: MediaSidebarProps) {
  const {
    storages,
    storageId,
    selectedStorage,
    loadingMedia,
    displayCount,
    kindFilter,
    normalizedThumbSize,
    onStorageChange,
    onRefresh,
    onKindFilterChange,
    onThumbSizeChange
  } = props;

  return (
    <aside className="mp-panel mp-panel-soft p-3">
      <label htmlFor="media-storage-select" className="block text-sm font-medium">
        选择存储
      </label>
      <div className="mt-1.5 flex items-center gap-2">
        <select
          id="media-storage-select"
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
        <button
          type="button"
          className="mp-btn shrink-0"
          onClick={onRefresh}
          disabled={!selectedStorage || loadingMedia}
        >
          刷新
        </button>
      </div>
      <p className="mt-2 text-[11px] mp-muted break-all">
        {selectedStorage ? `${selectedStorage.name} · ${selectedStorage.basePath}` : "选择存储后可浏览媒体内容"}
      </p>
      <div className="mp-subtle-card mt-3 p-3">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] mp-muted">当前视图</p>
        <p className="mt-1 text-sm font-medium">
          {selectedStorage ? `${selectedStorage.name} · ${getStorageTypeLabel(selectedStorage.type)}` : "未选择存储"}
        </p>
        <p className="mt-1 text-xs mp-muted">
          {selectedStorage
            ? `当前筛选结果 ${displayCount} 项，可点击缩略图打开大图预览。`
            : "选择本地存储后可浏览媒体；115 云盘当前不支持直接预览。"}
        </p>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] mp-muted">筛选类型</p>
        <div className="mp-segment">
          <button
            type="button"
            className="mp-segment-item"
            aria-pressed={kindFilter === "all"}
            onClick={() => onKindFilterChange("all")}
          >
            全部
          </button>
          <button
            type="button"
            className="mp-segment-item"
            aria-pressed={kindFilter === "image"}
            onClick={() => onKindFilterChange("image")}
          >
            图片
          </button>
          <button
            type="button"
            className="mp-segment-item"
            aria-pressed={kindFilter === "video"}
            onClick={() => onKindFilterChange("video")}
          >
            视频
          </button>
          <button
            type="button"
            className="mp-segment-item"
            aria-pressed={kindFilter === "live"}
            onClick={() => onKindFilterChange("live")}
          >
            Live Photo
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="media-zoom" className="text-sm font-medium">
            缩略图尺寸
          </label>
          <span className="mp-chip text-xs">{normalizedThumbSize}px</span>
        </div>
        <input
          id="media-zoom"
          type="range"
          min={110}
          max={260}
          step={10}
          value={normalizedThumbSize}
          onChange={(e) => onThumbSizeChange(Number(e.target.value))}
          className="mp-slider"
        />
        <div className="flex gap-2">
          <button
            type="button"
            className={`mp-btn flex-1 ${normalizedThumbSize <= 150 ? "mp-btn-primary" : ""}`}
            onClick={() => onThumbSizeChange(140)}
          >
            紧凑
          </button>
          <button
            type="button"
            className={`mp-btn flex-1 ${normalizedThumbSize > 150 && normalizedThumbSize < 200 ? "mp-btn-primary" : ""}`}
            onClick={() => onThumbSizeChange(170)}
          >
            标准
          </button>
          <button
            type="button"
            className={`mp-btn flex-1 ${normalizedThumbSize >= 200 ? "mp-btn-primary" : ""}`}
            onClick={() => onThumbSizeChange(220)}
          >
            放大
          </button>
        </div>
      </div>
    </aside>
  );
}
