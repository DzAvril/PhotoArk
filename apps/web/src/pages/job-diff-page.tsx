import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InlineAlert } from "../components/inline-alert";
import { deleteJobFile, getJobDiff, getJobs, getStorageMediaStreamUrl, getStorages, runJob, syncJobFile } from "../lib/api";
import type { BackupJob, JobDiffFile, JobDiffItem, JobDiffKind, JobDiffResult, JobDiffStatus, StorageTarget } from "../types/api";

function isLocalStorageType(type: StorageTarget["type"]): boolean {
  return type === "local_fs" || type === "external_ssd";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "-";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value >= 100 || idx === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[idx]}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function formatSignedMs(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "-";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value} ms`;
}

function getStatusLabel(status: JobDiffStatus): string {
  if (status === "source_only") return "仅源目录";
  if (status === "destination_only") return "仅目标目录";
  if (status === "changed") return "元数据/内容差异";
  return "完全一致";
}

function getStatusChipClass(status: JobDiffStatus): string {
  if (status === "source_only") return "mp-chip border-rose-200 bg-rose-50 text-rose-700";
  if (status === "destination_only") return "mp-chip border-violet-200 bg-violet-50 text-violet-700";
  if (status === "changed") return "mp-chip mp-chip-warning";
  return "mp-chip mp-chip-success";
}

function getKindLabel(kind: JobDiffKind): string {
  return kind === "video" ? "视频" : "图片";
}

function describeChangeReason(item: JobDiffItem): string {
  if (item.status !== "changed") return "-";
  if (item.changeReason === "size_mtime") return "大小 + 修改时间";
  if (item.changeReason === "size") return "大小";
  if (item.changeReason === "mtime") return "修改时间";
  return "-";
}

function getCellColorClass(item: JobDiffItem, side: "source" | "destination"): string {
  if (item.status === "same") return "bg-emerald-500 shadow-[0_0_0_1px_rgba(22,163,74,0.28)_inset]";
  if (item.status === "changed") return "bg-amber-400 shadow-[0_0_0_1px_rgba(217,119,6,0.28)_inset]";
  if (item.status === "source_only") {
    return side === "source"
      ? "bg-rose-500 shadow-[0_0_0_1px_rgba(190,18,60,0.28)_inset]"
      : "bg-slate-300 shadow-[0_0_0_1px_rgba(100,116,139,0.22)_inset]";
  }
  return side === "destination"
    ? "bg-rose-500 shadow-[0_0_0_1px_rgba(190,18,60,0.28)_inset]"
    : "bg-slate-300 shadow-[0_0_0_1px_rgba(100,116,139,0.22)_inset]";
}

function getSquareSizePx(itemCount: number): number {
  if (!Number.isFinite(itemCount) || itemCount <= 0) return 12;
  const adaptive = 22 - Math.log2(Math.max(1, itemCount)) * 1.15;
  return Math.max(10, Math.min(20, Math.round(adaptive)));
}

const DIFF_INITIAL_RENDER_COUNT = 1200;
const DIFF_RENDER_BATCH = 1200;

function DiffFileMeta({
  title,
  file
}: {
  title: string;
  file: JobDiffFile | null;
}) {
  if (!file) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3">
        <p className="text-xs font-semibold mp-muted">{title}</p>
        <div className="mt-2 rounded-lg border border-dashed border-[var(--ark-line)] bg-[var(--ark-surface)] px-3 py-2 text-sm mp-muted">
          该侧无文件
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3">
      <p className="text-xs font-semibold mp-muted">{title}</p>
      <dl className="mt-2 space-y-1 rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface)] px-3 py-2 text-xs">
        <div className="flex items-start justify-between gap-3">
          <dt className="mp-muted">体积</dt>
          <dd className="text-right font-medium">{formatBytes(file.sizeBytes)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="mp-muted">修改时间</dt>
          <dd className="text-right font-medium">{formatDateTime(file.modifiedAt)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="mp-muted">路径</dt>
          <dd className="max-w-[70%] break-all text-right font-medium">{file.absolutePath}</dd>
        </div>
      </dl>
    </div>
  );
}

export function JobDiffPage() {
  const navigate = useNavigate();
  const requestSeqRef = useRef(0);
  const leftPaneRef = useRef<HTMLDivElement | null>(null);
  const rightPaneRef = useRef<HTMLDivElement | null>(null);
  const syncScrollSourceRef = useRef<"left" | "right" | null>(null);

  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [storages, setStorages] = useState<StorageTarget[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | JobDiffKind>("all");
  const [hideSame, setHideSame] = useState(true);
  const [visibleCount, setVisibleCount] = useState(DIFF_INITIAL_RENDER_COUNT);
  const [result, setResult] = useState<JobDiffResult | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [refreshingDiff, setRefreshingDiff] = useState(false);
  const [runningSync, setRunningSync] = useState(false);
  const [syncingFile, setSyncingFile] = useState(false);
  const [deletingFile, setDeletingFile] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewSide, setPreviewSide] = useState<"source" | "destination">("source");
  const [previewFailed, setPreviewFailed] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const storageById = useMemo(() => new Map(storages.map((item) => [item.id, item])), [storages]);
  const diffableJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const source = storageById.get(job.sourceTargetId);
        const destination = storageById.get(job.destinationTargetId);
        return Boolean(source && destination && isLocalStorageType(source.type) && isLocalStorageType(destination.type));
      }),
    [jobs, storageById]
  );

  const loadDiff = useCallback(
    async (forceRefresh = false) => {
      if (!selectedJobId) {
        setResult(null);
        setSelectedItemId(null);
        return;
      }

      const reqSeq = requestSeqRef.current + 1;
      requestSeqRef.current = reqSeq;
      if (forceRefresh) {
        setRefreshingDiff(true);
      } else {
        setLoadingDiff(true);
      }

      try {
        const res = await getJobDiff(selectedJobId, {
          status: "all",
          kind: kindFilter,
          refresh: forceRefresh,
          all: true
        });
        if (requestSeqRef.current !== reqSeq) return;
        setResult(res);
      } catch (err) {
        if (requestSeqRef.current !== reqSeq) return;
        setResult(null);
        setSelectedItemId(null);
        setError((err as Error).message);
      } finally {
        if (requestSeqRef.current === reqSeq) {
          setLoadingDiff(false);
          setRefreshingDiff(false);
        }
      }
    },
    [selectedJobId, kindFilter]
  );

  useEffect(() => {
    let canceled = false;
    async function loadSetup() {
      setLoadingSetup(true);
      try {
        const [jobsRes, storagesRes] = await Promise.all([getJobs(), getStorages()]);
        if (canceled) return;
        setJobs(jobsRes.items);
        setStorages(storagesRes.items);
        setSelectedJobId((prev) => {
          const jobSet = new Set(jobsRes.items.map((item) => item.id));
          if (prev && jobSet.has(prev)) return prev;
          const localStorageById = new Map(storagesRes.items.map((item) => [item.id, item]));
          const next = jobsRes.items.find((job) => {
            const source = localStorageById.get(job.sourceTargetId);
            const destination = localStorageById.get(job.destinationTargetId);
            return Boolean(source && destination && isLocalStorageType(source.type) && isLocalStorageType(destination.type));
          });
          return next?.id ?? "";
        });
      } catch (err) {
        if (canceled) return;
        setError((err as Error).message);
      } finally {
        if (!canceled) {
          setLoadingSetup(false);
        }
      }
    }
    void loadSetup();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    void loadDiff(false);
  }, [loadDiff]);

  const displayItems = useMemo(() => {
    const rows = result?.items ?? [];
    if (!hideSame) return rows;
    return rows.filter((item) => item.status !== "same");
  }, [result, hideSame]);

  useEffect(() => {
    setVisibleCount(DIFF_INITIAL_RENDER_COUNT);
  }, [selectedJobId, kindFilter, hideSame, result?.generatedAt]);

  const visibleItems = useMemo(
    () => displayItems.slice(0, Math.min(displayItems.length, visibleCount)),
    [displayItems, visibleCount]
  );
  const displayItemById = useMemo(() => new Map(displayItems.map((item) => [item.id, item])), [displayItems]);
  const squareSizePx = useMemo(() => getSquareSizePx(displayItems.length), [displayItems.length]);

  useEffect(() => {
    if (!displayItems.length) {
      setSelectedItemId(null);
      return;
    }
    if (selectedItemId && displayItemById.has(selectedItemId)) return;
    setSelectedItemId(displayItems[0].id);
  }, [displayItems, displayItemById, selectedItemId]);

  const selectedItem = useMemo(
    () => (selectedItemId ? displayItemById.get(selectedItemId) ?? null : displayItems[0] ?? null),
    [displayItems, displayItemById, selectedItemId]
  );

  const detailItem = selectedItem;
  const previewSourceAvailable = Boolean(detailItem?.source && result);
  const previewDestinationAvailable = Boolean(detailItem?.destination && result);
  const previewStorageId =
    detailItem && result
      ? previewSide === "source"
        ? result.job.sourceStorageId
        : result.job.destinationStorageId
      : "";
  const previewFile =
    detailItem ? (previewSide === "source" ? (detailItem.source ?? detailItem.destination) : (detailItem.destination ?? detailItem.source)) : null;
  const previewStreamUrl = previewOpen && previewFile ? getStorageMediaStreamUrl(previewStorageId, previewFile.absolutePath) : "";
  const previewTitle = previewSide === "source" ? "源目录预览" : "目标目录预览";

  function handleLeftPaneScroll() {
    const source = leftPaneRef.current;
    const target = rightPaneRef.current;
    if (!source || !target) return;
    if (syncScrollSourceRef.current === "right") return;
    syncScrollSourceRef.current = "left";
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    if (source.scrollTop + source.clientHeight >= source.scrollHeight - 220) {
      setVisibleCount((prev) => Math.min(displayItems.length, prev + DIFF_RENDER_BATCH));
    }
    window.requestAnimationFrame(() => {
      if (syncScrollSourceRef.current === "left") syncScrollSourceRef.current = null;
    });
  }

  function handleRightPaneScroll() {
    const source = rightPaneRef.current;
    const target = leftPaneRef.current;
    if (!source || !target) return;
    if (syncScrollSourceRef.current === "left") return;
    syncScrollSourceRef.current = "right";
    target.scrollTop = source.scrollTop;
    target.scrollLeft = source.scrollLeft;
    if (source.scrollTop + source.clientHeight >= source.scrollHeight - 220) {
      setVisibleCount((prev) => Math.min(displayItems.length, prev + DIFF_RENDER_BATCH));
    }
    window.requestAnimationFrame(() => {
      if (syncScrollSourceRef.current === "right") syncScrollSourceRef.current = null;
    });
  }

  async function handleRunSync() {
    if (!selectedJobId) return;
    setRunningSync(true);
    setError("");
    setMessage("");
    try {
      await runJob(selectedJobId);
      setMessage("同步任务已开始，可切到后台继续执行。");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunningSync(false);
    }
  }

  async function handleSyncSelectedFile() {
    if (!selectedJobId || !detailItem) return;
    if (detailItem.status === "same") return;
    if (detailItem.status === "destination_only") {
      setError("该文件仅存在于目标目录，当前仅支持按源目录 -> 目标目录同步单文件。");
      return;
    }
    setSyncingFile(true);
    setError("");
    try {
      await syncJobFile(selectedJobId, detailItem.relativePath);
      setMessage(`已同步文件：${detailItem.relativePath}`);
      await loadDiff(true);
      setSelectedItemId(detailItem.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSyncingFile(false);
    }
  }

  async function handleDeleteSelectedFile() {
    if (!selectedJobId || !detailItem) return;
    if (detailItem.status !== "source_only" && detailItem.status !== "destination_only") return;
    const side = detailItem.status === "source_only" ? "source" : "destination";
    const confirmText =
      side === "source"
        ? "确认删除源目录中的该文件吗？此操作不可恢复。"
        : "确认删除目标目录中的该文件吗？此操作不可恢复。";
    if (!window.confirm(confirmText)) return;
    setDeletingFile(true);
    setError("");
    try {
      await deleteJobFile(selectedJobId, detailItem.relativePath, side);
      setMessage(`已删除${side === "source" ? "源目录" : "目标目录"}文件：${detailItem.relativePath}`);
      await loadDiff(true);
      setSelectedItemId(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeletingFile(false);
    }
  }

  function handleOpenPreview() {
    if (!detailItem || !result) return;
    const initialSide: "source" | "destination" = detailItem.source ? "source" : "destination";
    setPreviewSide(initialSide);
    setPreviewFailed(false);
    setPreviewOpen(true);
  }

  function handleClosePreview() {
    setPreviewOpen(false);
    setPreviewFailed(false);
  }

  return (
    <section className="space-y-3 md:flex md:h-full md:flex-col">
      {message ? (
        <InlineAlert tone="success" autoCloseMs={5200} onClose={() => setMessage("")}>
          {message}
        </InlineAlert>
      ) : null}
      {error ? (
        <InlineAlert tone="error" onClose={() => setError("")}>
          {error}
        </InlineAlert>
      ) : null}

      <div className="mp-panel mp-panel-soft p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">目录差异</h3>
          </div>
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
          <select
            className="mp-select"
            value={selectedJobId}
            onChange={(event) => setSelectedJobId(event.target.value)}
            disabled={loadingSetup || !diffableJobs.length}
          >
            {!diffableJobs.length ? <option value="">暂无可比对任务</option> : null}
            {diffableJobs.map((job) => {
              const sourceName = storageById.get(job.sourceTargetId)?.name ?? job.sourceTargetId;
              const destinationName = storageById.get(job.destinationTargetId)?.name ?? job.destinationTargetId;
              return (
                <option key={job.id} value={job.id}>
                  {job.name} ({sourceName}
                  {" -> "}
                  {destinationName})
                </option>
              );
            })}
          </select>
          <button type="button" className="mp-btn" disabled={refreshingDiff || !selectedJobId} onClick={() => void loadDiff(true)}>
            {refreshingDiff ? "刷新中..." : "刷新差异"}
          </button>
          <button
            type="button"
            className="mp-btn"
            disabled={!selectedJobId}
            onClick={() => navigate(`/settings/jobs?editJobId=${selectedJobId}`)}
          >
            编辑任务
          </button>
          <button type="button" className="mp-btn mp-btn-primary" disabled={!selectedJobId || runningSync} onClick={() => void handleRunSync()}>
            {runningSync ? "启动中..." : "立即同步"}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-emerald-500" /> 相同</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-amber-400" /> 差异</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-rose-500" /> 独有</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-sm bg-slate-300" /> 缺失</span>
        </div>
      </div>

      <div className="grid gap-3 md:min-h-0 md:flex-1 xl:grid-cols-[minmax(0,1fr)_390px]">
        <article className="mp-panel p-3 md:flex md:h-full md:min-h-0 md:flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="mp-segment">
              {[
                { value: "all", label: "全部类型" },
                { value: "image", label: "图片" },
                { value: "video", label: "视频" }
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="mp-segment-item"
                  aria-pressed={kindFilter === item.value}
                  onClick={() => setKindFilter(item.value as "all" | JobDiffKind)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className={`mp-btn ${hideSame ? "mp-btn-primary" : ""}`}
              onClick={() => setHideSame((prev) => !prev)}
            >
              {hideSame ? "显示相同项" : "隐藏相同项"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:min-h-0 md:flex-1 md:grid-cols-2">
            <div className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2 md:flex md:min-h-0 md:flex-col">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold">源目录视图</p>
                <span className="text-[11px] mp-muted">{result ? result.job.sourceStorageName : "-"}</span>
              </div>
              <div
                ref={leftPaneRef}
                className="h-[46vh] min-h-[280px] overflow-auto rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface)] p-2 md:h-auto md:min-h-0 md:flex-1"
                onScroll={handleLeftPaneScroll}
              >
                <div className="flex flex-wrap content-start gap-1.5">
                  {visibleItems.map((item) => {
                    const active = selectedItem?.id === item.id;
                    return (
                      <button
                        key={`left:${item.id}`}
                        type="button"
                        className={`rounded-[3px] transition-transform ${getCellColorClass(item, "source")} ${active ? "ring-2 ring-[var(--ark-primary)]" : ""}`}
                        style={{ width: `${squareSizePx}px`, height: `${squareSizePx}px` }}
                        onClick={() => setSelectedItemId(item.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2 md:flex md:min-h-0 md:flex-col">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold">目标目录视图</p>
                <span className="text-[11px] mp-muted">{result ? result.job.destinationStorageName : "-"}</span>
              </div>
              <div
                ref={rightPaneRef}
                className="h-[46vh] min-h-[280px] overflow-auto rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface)] p-2 md:h-auto md:min-h-0 md:flex-1"
                onScroll={handleRightPaneScroll}
              >
                <div className="flex flex-wrap content-start gap-1.5">
                  {visibleItems.map((item) => {
                    const active = selectedItem?.id === item.id;
                    return (
                      <button
                        key={`right:${item.id}`}
                        type="button"
                        className={`rounded-[3px] transition-transform ${getCellColorClass(item, "destination")} ${active ? "ring-2 ring-[var(--ark-primary)]" : ""}`}
                        style={{ width: `${squareSizePx}px`, height: `${squareSizePx}px` }}
                        onClick={() => setSelectedItemId(item.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-2 text-xs mp-muted">
            已渲染 {visibleItems.length}/{displayItems.length} 项
          </p>

        </article>

        <aside className="mp-panel p-3 md:min-h-0 md:overflow-auto">
          <h4 className="text-sm font-semibold">选中项信息</h4>
          {detailItem && result ? (
            <div className="mt-2 space-y-3">
              <div className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3">
                <p className="break-all text-sm font-semibold">{detailItem.relativePath}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  <span className={getStatusChipClass(detailItem.status)}>{getStatusLabel(detailItem.status)}</span>
                  <span className="mp-chip">{getKindLabel(detailItem.kind)}</span>
                  <span className="mp-chip">时间差 {formatSignedMs(detailItem.mtimeDeltaMs)}</span>
                </div>
                {detailItem.status !== "same" ? (
                  <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                    <p>Diff: {detailItem.status === "changed" ? describeChangeReason(detailItem) : getStatusLabel(detailItem.status)}</p>
                  </div>
                ) : null}
                {detailItem.status !== "same" ? (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="mp-btn mp-btn-primary"
                      disabled={syncingFile || detailItem.status === "destination_only"}
                      onClick={() => void handleSyncSelectedFile()}
                    >
                      {syncingFile ? "同步中..." : "仅同步该文件"}
                    </button>
                    {detailItem.status === "destination_only" ? (
                      <p className="mt-1 text-xs mp-muted">该文件仅在目标目录存在，无法从源目录执行单文件同步。</p>
                    ) : null}
                    {(detailItem.status === "source_only" || detailItem.status === "destination_only") ? (
                      <div className="mt-2">
                        <button
                          type="button"
                          className="mp-btn"
                          disabled={deletingFile}
                          onClick={() => void handleDeleteSelectedFile()}
                        >
                          {deletingFile
                            ? "删除中..."
                            : detailItem.status === "source_only"
                              ? "删除源目录该文件"
                              : "删除目标目录该文件"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {detailItem ? (
                  <div className="mt-2">
                    <button type="button" className="mp-btn" disabled={!previewSourceAvailable && !previewDestinationAvailable} onClick={handleOpenPreview}>
                      预览
                    </button>
                  </div>
                ) : null}
              </div>

              <DiffFileMeta
                title={`源目录 · ${result.job.sourceStorageName}`}
                file={detailItem.source}
              />
              <DiffFileMeta
                title={`目标目录 · ${result.job.destinationStorageName}`}
                file={detailItem.destination}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm mp-muted">点击方块查看详情。</p>
          )}
        </aside>
      </div>

      {previewOpen && detailItem && previewFile ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-4xl rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-3 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{previewTitle}</p>
                <p className="text-xs mp-muted">{detailItem.relativePath}</p>
              </div>
              <div className="flex items-center gap-2">
                {previewSourceAvailable && previewDestinationAvailable ? (
                  <div className="mp-segment">
                    <button
                      type="button"
                      className="mp-segment-item"
                      aria-pressed={previewSide === "source"}
                      onClick={() => {
                        setPreviewSide("source");
                        setPreviewFailed(false);
                      }}
                    >
                      源
                    </button>
                    <button
                      type="button"
                      className="mp-segment-item"
                      aria-pressed={previewSide === "destination"}
                      onClick={() => {
                        setPreviewSide("destination");
                        setPreviewFailed(false);
                      }}
                    >
                      目标
                    </button>
                  </div>
                ) : null}
                <button type="button" className="mp-btn" onClick={handleClosePreview}>
                  关闭
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-[var(--ark-line)] bg-black/70 p-2">
              {previewFailed ? (
                <div className="flex h-[68vh] items-center justify-center text-sm text-white/75">预览失败</div>
              ) : detailItem.kind === "video" ? (
                <video
                  className="h-[68vh] w-full rounded-md bg-black object-contain"
                  controls
                  preload="metadata"
                  src={previewStreamUrl}
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                <img
                  className="h-[68vh] w-full rounded-md bg-black object-contain"
                  src={previewStreamUrl}
                  alt={detailItem.relativePath}
                  loading="eager"
                  onError={() => setPreviewFailed(true)}
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
