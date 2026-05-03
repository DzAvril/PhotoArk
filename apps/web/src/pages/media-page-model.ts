export function normalizeThumbSize(input: number): number {
  return Math.max(110, Math.min(260, Number(input) || 170));
}

export function getMediaGridColumns(containerWidth: number, thumbSize: number): number {
  const normalizedWidth = Math.max(0, Number(containerWidth) || 0);
  const normalizedThumb = normalizeThumbSize(thumbSize);
  if (normalizedWidth < 480) return Math.max(2, Math.floor(normalizedWidth / Math.max(130, normalizedThumb * 0.78)) || 2);
  return Math.max(2, Math.floor(normalizedWidth / normalizedThumb));
}

export function getMediaLibraryStatusText(input: { loaded: number; total: number; filtered: number }): string {
  return `已加载 ${input.loaded.toLocaleString("zh-CN")}/${input.total.toLocaleString("zh-CN")} · 筛选后 ${input.filtered.toLocaleString("zh-CN")}`;
}
