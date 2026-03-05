import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { InlineAlert } from "../components/inline-alert";
import { TablePagination } from "../components/table/table-pagination";
import { getJobDiff, getJobs, getStorageMediaStreamUrl, getStorages, runJob } from "../lib/api";
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
  return "内容差异";
}

function getStatusChipClass(status: JobDiffStatus): string {
  if (status === "source_only") return "mp-chip border-sky-200 bg-sky-50 text-sky-700";
  if (status === "destination_only") return "mp-chip border-violet-200 bg-violet-50 text-violet-700";
  return "mp-chip mp-chip-warning";
}

function getKindLabel(kind: JobDiffKind): string {
  return kind === "video" ? "视频" : "图片";
}

function describeItemSize(item: JobDiffItem): string {
  if (item.status === "source_only") {
    return `源 ${formatBytes(item.source?.sizeBytes ?? 0)}`;
  }
  if (item.status === "destination_only") {
    return `目标 ${formatBytes(item.destination?.sizeBytes ?? 0)}`;
  }
  return `源 ${formatBytes(item.source?.sizeBytes ?? 0)} / 目标 ${formatBytes(item.destination?.sizeBytes ?? 0)}`;
}

function describeChangeReason(item: JobDiffItem): string {
  if (item.status !== "changed") return "-";
  if (item.changeReason === "size_mtime") return "大小 + 修改时间";
  if (item.changeReason === "size") return "大小";
  if (item.changeReason === "mtime") return "修改时间";
  return "-";
}

function DiffFilePreview({
  title,
  storageId,
  kind,
  file
}: {
  title: string;
  storageId: string;
  kind: JobDiffKind;
  file: JobDiffFile | null;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);
  useEffect(() => {
    setPreviewFailed(false);
  }, [file?.absolutePath, storageId, kind]);

  if (!file) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3">
        <p className="text-xs font-semibold mp-muted">{title}</p>
        <div className="mt-2 flex aspect-[4/3] items-center justify-center rounded-lg border border-dashed border-[var(--ark-line)] bg-[var(--ark-surface)] text-sm mp-muted">
          该侧无文件
        </div>
      </div>
    );
  }

  const streamUrl = getStorageMediaStreamUrl(storageId, file.absolutePath);
  return (
    <div className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3">
      <p className="text-xs font-semibold mp-muted">{title}</p>
      <div className="mt-2 overflow-hidden rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface)]">
        {previewFailed ? (
          <div className="flex aspect-[4/3] items-center justify-center text-sm mp-muted">预览失败</div>
        ) : kind === "video" ? (
          <video
            className="aspect-[4/3] h-full w-full bg-black"
            controls
            preload="metadata"
            src={streamUrl}
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <img
            className="aspect-[4/3] h-full w-full object-contain bg-black/5"
            src={streamUrl}
            alt={title}
            loading="lazy"
            onError={() => setPreviewFailed(true)}
          />
        )}
      </div>
      <p className="mt-2 text-xs mp-muted">
        {formatBytes(file.sizeBytes)} · {formatDateTime(file.modifiedAt)}
      </p>
    </div>
  );
}

export function JobDiffPage() {
  const navigate = useNavigate();
  const requestSeqRef = useRef(0);
  const [jobs, setJobs] = useState<BackupJob[]>([]);
  const [storages, setStorages] = useState<StorageTarget[]>([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | JobDiffStatus>("all");
  const [kindFilter, setKindFilter] = useState<"all" | JobDiffKind>("all");
  const [searchInput, setSearchInput] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);
  const [result, setResult] = useState<JobDiffResult | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [refreshingDiff, setRefreshingDiff] = useState(false);
  const [runningSync, setRunningSync] = useState(false);
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

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setKeyword(searchInput.trim());
    }, 220);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [selectedJobId, statusFilter, kindFilter, keyword, pageSize]);

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
          status: statusFilter,
          kind: kindFilter,
          keyword,
          page,
          pageSize,
          refresh: forceRefresh
        });
        if (requestSeqRef.current !== reqSeq) return;
        setResult(res);
        setPage(res.page);
        setSelectedItemId((prev) => {
          if (!res.items.length) return null;
          if (prev && res.items.some((item) => item.id === prev)) return prev;
          return res.items[0].id;
        });
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
    [selectedJobId, statusFilter, kindFilter, keyword, page, pageSize]
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

  const selectedItem = useMemo(
    () => result?.items.find((item) => item.id === selectedItemId) ?? result?.items[0] ?? null,
    [result, selectedItemId]
  );

  const selectedJob = useMemo(() => diffableJobs.find((item) => item.id === selectedJobId) ?? null, [diffableJobs, selectedJobId]);

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
            <h3 className="text-base font-semibold">同步差异浏览</h3>
            <p className="mt-1 text-sm mp-muted">按任务对比源目录与目标目录差异，支持图片/视频预览。</p>
          </div>
          {result ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="mp-chip">总差异 {result.summary.totalDiffCount}</span>
              <span className="mp-chip border-sky-200 bg-sky-50 text-sky-700">仅源 {result.summary.sourceOnlyCount}</span>
              <span className="mp-chip mp-chip-warning">内容差异 {result.summary.changedCount}</span>
              <span className="mp-chip border-violet-200 bg-violet-50 text-violet-700">
                仅目标 {result.summary.destinationOnlyCount}
              </span>
            </div>
          ) : null}
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
        {result ? (
          <p className="mt-2 text-xs mp-muted">
            扫描源 {result.scan.sourceFileCount} 个媒体，目标 {result.scan.destinationFileCount} 个媒体 · 最近更新{" "}
            {formatDateTime(result.generatedAt)}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 md:min-h-0 md:flex-1 xl:grid-cols-[minmax(0,1fr)_360px]">
        <article className="mp-panel p-3 md:flex md:min-h-0 md:flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="mp-segment">
              {[
                { value: "all", label: "全部" },
                { value: "source_only", label: "仅源" },
                { value: "changed", label: "差异" },
                { value: "destination_only", label: "仅目标" }
              ].map((item) => (
                <button
                  key={item.value}
                  type="button"
                  className="mp-segment-item"
                  aria-pressed={statusFilter === item.value}
                  onClick={() => setStatusFilter(item.value as "all" | JobDiffStatus)}
                >
                  {item.label}
                </button>
              ))}
            </div>
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
            <label className="relative block w-full">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ark-ink-soft)]">
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M16 16 20 20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </span>
              <input
                className="mp-input mp-input-with-icon w-full pr-10"
                placeholder="搜索相对路径"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
              />
              {searchInput ? (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-[var(--ark-ink-soft)] transition-colors hover:bg-[var(--ark-surface-soft)] hover:text-[var(--ark-ink)]"
                  aria-label="清空搜索"
                  onClick={() => setSearchInput("")}
                >
                  <svg viewBox="0 0 20 20" fill="none" className="h-3.5 w-3.5" aria-hidden="true">
                    <path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </button>
              ) : null}
            </label>
            <select className="mp-select sm:w-[110px]" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
              <option value={20}>20 / 页</option>
              <option value={30}>30 / 页</option>
              <option value={50}>50 / 页</option>
            </select>
          </div>

          <div className="mt-3 space-y-2 md:min-h-0 md:flex-1 md:overflow-auto">
            {loadingSetup || loadingDiff ? (
              <p className="py-12 text-center text-sm mp-muted">加载差异中...</p>
            ) : !selectedJobId ? (
              <p className="py-12 text-center text-sm mp-muted">暂无可比对的本地同步任务，请先创建 local {"->"} local 任务。</p>
            ) : result && result.items.length > 0 ? (
              result.items.map((item) => {
                const active = selectedItem?.id === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`w-full rounded-xl border p-3 text-left transition ${
                      active
                        ? "border-[var(--ark-primary)] bg-[var(--ark-primary-soft)]/35"
                        : "border-[var(--ark-line)] bg-[var(--ark-surface-soft)] hover:border-[var(--ark-line-strong)]"
                    }`}
                    onClick={() => setSelectedItemId(item.id)}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="max-w-full break-all text-sm font-semibold">{item.relativePath}</p>
                      <span className={getStatusChipClass(item.status)}>{getStatusLabel(item.status)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                      <span className="mp-chip">{getKindLabel(item.kind)}</span>
                      <span className="mp-chip">{describeItemSize(item)}</span>
                      {item.status === "changed" ? (
                        <span className="mp-chip">原因 {describeChangeReason(item)}</span>
                      ) : null}
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="py-12 text-center text-sm mp-muted">当前筛选条件下没有差异项。</p>
            )}
          </div>

          {result ? <TablePagination page={result.page} totalPages={result.totalPages} onChange={setPage} /> : null}
        </article>

        <aside className="mp-panel p-3 md:min-h-0 md:overflow-auto">
          <h4 className="text-sm font-semibold">差异预览</h4>
          {selectedItem && result ? (
            <div className="mt-2 space-y-3">
              <div className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-3">
                <p className="break-all text-sm font-semibold">{selectedItem.relativePath}</p>
                <div className="mt-1 flex flex-wrap gap-2 text-xs">
                  <span className={getStatusChipClass(selectedItem.status)}>{getStatusLabel(selectedItem.status)}</span>
                  <span className="mp-chip">{getKindLabel(selectedItem.kind)}</span>
                  <span className="mp-chip">时间差 {formatSignedMs(selectedItem.mtimeDeltaMs)}</span>
                </div>
              </div>

              <DiffFilePreview
                title={`源目录 · ${result.job.sourceStorageName}`}
                storageId={result.job.sourceStorageId}
                kind={selectedItem.kind}
                file={selectedItem.source}
              />
              <DiffFilePreview
                title={`目标目录 · ${result.job.destinationStorageName}`}
                storageId={result.job.destinationStorageId}
                kind={selectedItem.kind}
                file={selectedItem.destination}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm mp-muted">选择左侧差异项后，在此查看双侧预览。</p>
          )}
        </aside>
      </div>

      {selectedJob ? (
        <p className="text-xs mp-muted">
          当前任务路径：源 {selectedJob.sourcePath}
          {" -> "}
          目标 {selectedJob.destinationPath}
        </p>
      ) : null}
    </section>
  );
}
