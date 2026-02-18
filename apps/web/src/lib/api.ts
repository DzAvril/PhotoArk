import type {
  BackupAsset,
  BackupJob,
  DirectoryBrowseResult,
  LivePhotoPair,
  LivePhotoDetail,
  Metrics,
  PreviewResult,
  PreviewTokenResult,
  StorageTarget
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
    throw new Error(text || `Request failed: ${res.status}`);
  }

  return (await res.json()) as T;
}

export function getMetrics() {
  return fetchJson<Metrics>("/api/metrics");
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

export function createStorage(payload: Omit<StorageTarget, "id">) {
  return fetchJson<StorageTarget>("/api/storages", {
    method: "POST",
    body: JSON.stringify(payload)
  });
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

export function getBackups() {
  return fetchJson<{ items: BackupAsset[]; livePhotoPairs: LivePhotoPair[] }>("/api/backups");
}

export function createBackupAsset(payload: Omit<BackupAsset, "id">) {
  return fetchJson<BackupAsset>("/api/backups", {
    method: "POST",
    body: JSON.stringify(payload)
  });
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
