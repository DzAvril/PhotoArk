import { useEffect, useState } from "react";
import { getStorageMediaStreamUrl } from "../lib/api";
import type { DiffItem } from "../types/diff";

interface DiffPreviewModalProps {
  isOpen: boolean;
  item: DiffItem | null;
  side: "left" | "right";
  leftStorageId: string;
  rightStorageId: string;
  onClose: () => void;
  onSwitchSide: () => void;
}

export function DiffPreviewModal({
  isOpen,
  item,
  side,
  leftStorageId,
  rightStorageId,
  onClose,
  onSwitchSide,
}: DiffPreviewModalProps) {
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (isOpen) {
      setError("");
    }
  }, [isOpen, item, side]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !item) return null;

  const storageId = side === "left" ? leftStorageId : rightStorageId;
  const fileInfo = side === "left" ? item.left : item.right;

  if (!fileInfo) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-[3px]"
        onClick={onClose}
      >
        <div
          className="w-full max-w-3xl rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-6 shadow-[0_28px_64px_rgba(2,8,23,0.45)]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">预览</h3>
            <button type="button" className="mp-btn" onClick={onClose}>
              关闭
            </button>
          </div>
          <p className="mt-4 text-sm text-[var(--ark-ink-soft)]">
            该文件在 {side === "left" ? "左侧" : "右侧"} 存储中不存在
          </p>
        </div>
      </div>
    );
  }

  const streamUrl = getStorageMediaStreamUrl(storageId, fileInfo.path);
  const isImage = fileInfo.kind === "image";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/78 p-3 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-surface)] shadow-[0_28px_64px_rgba(2,8,23,0.45)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--ark-line)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold" title={fileInfo.name}>
              {fileInfo.name}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--ark-ink-soft)]">
              {side === "left" ? "左侧" : "右侧"} · {formatBytes(fileInfo.sizeBytes)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {item.left && item.right && (
              <button type="button" className="mp-btn" onClick={onSwitchSide}>
                切换侧边
              </button>
            )}
            <button type="button" className="mp-btn" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          {error ? (
            <div className="text-center">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          ) : isImage ? (
            <img
              src={streamUrl}
              alt={fileInfo.name}
              className="max-h-full max-w-full rounded-lg object-contain"
              onError={() => setError("图片加载失败")}
            />
          ) : (
            <div className="text-center">
              <p className="text-sm text-[var(--ark-ink-soft)]">视频预览暂不支持</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
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
