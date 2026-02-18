import type {
  BackupAsset,
  BackupJob,
  LivePhotoPair,
  Metrics,
  PreviewResult,
  PreviewTokenResult,
  StorageTarget
} from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";

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

export function getJobs() {
  return fetchJson<{ items: BackupJob[] }>("/api/jobs");
}

export function getBackups() {
  return fetchJson<{ items: BackupAsset[]; livePhotoPairs: LivePhotoPair[] }>("/api/backups");
}

export function createPreviewToken(assetId: string) {
  return fetchJson<PreviewTokenResult>(`/api/backups/${assetId}/preview-token`, { method: "POST" });
}

export function getPreview(assetId: string, token: string) {
  const q = new URLSearchParams({ token });
  return fetchJson<PreviewResult>(`/api/backups/${assetId}/preview?${q.toString()}`);
}
