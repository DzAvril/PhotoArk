import type {
  BackupAsset,
  BackupJob,
  DirectoryBrowseResult,
  JobRun,
  MediaBrowseResult,
  LivePhotoPair,
  LivePhotoDetail,
  Metrics,
  PreviewResult,
  PreviewTokenResult,
  StorageTarget,
  VersionInfo
} from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  if (!res.ok) {
    const text = await res.text();
    if (text) {
      try {
        const json = JSON.parse(text) as { message?: string };
        throw new Error(json.message || text);
      } catch {
        throw new Error(text);
      }
    }
    throw new Error(`Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

export function getMetrics() {
  return fetchJson<Metrics>("/api/metrics");
}

export function getVersionInfo() {
  return fetchJson<VersionInfo>("/api/version");
}

export function getStorages() {
  return fetchJson<{ items: StorageTarget[] }>("/api/storages");
}

export function browseDirectories(dirPath?: string) {
  const q = new URLSearchParams();
  if (dirPath) q.set("path", dirPath);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchJson<DirectoryBrowseResult>(`/api/fs/directories${suffix}`);
}

export function browseStorageDirectories(storageId: string, dirPath?: string) {
  const q = new URLSearchParams();
  if (dirPath) q.set("path", dirPath);
  const suffix = q.toString() ? `?${q.toString()}` : "";
  return fetchJson<DirectoryBrowseResult>(`/api/storages/${storageId}/directories${suffix}`);
}

export function browseStorageMedia(storageId: string, dirPath: string) {
  const q = new URLSearchParams({ path: dirPath });
  return fetchJson<MediaBrowseResult>(`/api/storages/${storageId}/media?${q.toString()}`);
}

export function getStorageMediaStreamUrl(storageId: string, filePath: string) {
  const q = new URLSearchParams({ path: filePath });
  return `${API_BASE}/api/storages/${storageId}/media/stream?${q.toString()}`;
}

export function createStorage(payload: Omit<StorageTarget, "id">) {
  return fetchJson<StorageTarget>("/api/storages", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteStorage(storageId: string) {
  return fetchJson<{ ok: true }>(`/api/storages/${storageId}`, { method: "DELETE" });
}

export function getJobs() {
  return fetchJson<{ items: BackupJob[] }>("/api/jobs");
}

export function createJob(payload: Omit<BackupJob, "id">) {
  return fetchJson<BackupJob>("/api/jobs", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteJob(jobId: string) {
  return fetchJson<{ ok: true }>(`/api/jobs/${jobId}`, { method: "DELETE" });
}

export function runJob(jobId: string) {
  return fetchJson<JobRun>(`/api/jobs/${jobId}/run`, { method: "POST" });
}

export function getJobRuns(jobId: string) {
  return fetchJson<{ items: JobRun[] }>(`/api/jobs/${jobId}/runs`);
}

export function getBackups() {
  return fetchJson<{ items: BackupAsset[]; livePhotoPairs: LivePhotoPair[] }>("/api/backups");
}

export function createBackupAsset(payload: Omit<BackupAsset, "id">) {
  return fetchJson<BackupAsset>("/api/backups", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function deleteBackupAsset(assetId: string) {
  return fetchJson<{ ok: true }>(`/api/backups/${assetId}`, { method: "DELETE" });
}

export function getLivePhotoDetail(assetId: string) {
  return fetchJson<LivePhotoDetail>(`/api/backups/${assetId}/live-photo`);
}

export function createPreviewToken(assetId: string) {
  return fetchJson<PreviewTokenResult>(`/api/backups/${assetId}/preview-token`, { method: "POST" });
}

export function getPreview(assetId: string, token: string) {
  const q = new URLSearchParams({ token });
  return fetchJson<PreviewResult>(`/api/backups/${assetId}/preview?${q.toString()}`);
}
