import { useEffect, useState } from "react";
import { InlineAlert } from "../components/inline-alert";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
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
        className="mp-overlay fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-[3px]"
        onClick={onClose}
      >
        <Card
          variant="panel"
          className="w-full max-w-3xl p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold">预览</h3>
            <Button onClick={onClose}>
              关闭
            </Button>
          </div>
          <p className="mt-4 text-sm text-[var(--ark-ink-soft)]">
            该文件在 {side === "left" ? "左侧" : "右侧"} 存储中不存在
          </p>
        </Card>
      </div>
    );
  }

  const streamUrl = getStorageMediaStreamUrl(storageId, fileInfo.path);
  const isImage = fileInfo.kind === "image";

  return (
    <div
      className="mp-overlay fixed inset-0 z-50 flex items-center justify-center p-3 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <Card
        variant="panel"
        className="flex max-h-[90vh] w-full max-w-5xl flex-col"
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
              <Button onClick={onSwitchSide}>
                切换侧边
              </Button>
            )}
            <Button onClick={onClose}>
              关闭
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
          {error ? (
            <div className="text-center">
              <InlineAlert tone="error">{error}</InlineAlert>
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
      </Card>
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
