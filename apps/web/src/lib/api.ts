import type {
  AuthResult,
  AuthStatus,
  AuthUser,
  AppSettings,
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
  StorageCapacityItem,
  StorageTarget,
  VersionInfo
} from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const AUTH_TOKEN_KEY = "photoark-auth-token";
const AUTH_REQUIRED_EVENT = "photoark-auth-required";

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export function getStoredAuthToken(): string | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(AUTH_TOKEN_KEY);
  return value ? value.trim() : null;
}

export function setStoredAuthToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

function notifyAuthRequired() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT));
}

export function onAuthRequired(handler: () => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }
  const wrapped = () => handler();
  window.addEventListener(AUTH_REQUIRED_EVENT, wrapped);
  return () => window.removeEventListener(AUTH_REQUIRED_EVENT, wrapped);
}

function withAccessToken(url: string): string {
  const token = getStoredAuthToken();
  if (!token) return url;
  const hasQuery = url.includes("?");
  const encoded = encodeURIComponent(token);
  return `${url}${hasQuery ? "&" : "?"}access_token=${encoded}`;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers ?? {});
  if (init?.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getStoredAuthToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Request failed: ${res.status}`;
    let code: string | undefined;
    if (text) {
      try {
        const json = JSON.parse(text) as { message?: string; code?: string };
        message = json.message || message;
        code = json.code;
      } catch {
        message = text;
      }
    }
    const error = new ApiRequestError(message, res.status, code);
    if (res.status === 401 || code === "AUTH_REQUIRED" || code === "AUTH_INVALID_TOKEN") {
      setStoredAuthToken(null);
      notifyAuthRequired();
    }
    throw error;
  }

  return (await res.json()) as T;
}

export function getAuthStatus() {
  return fetchJson<AuthStatus>("/api/auth/status");
}

export function bootstrapAdmin(payload: { username: string; password: string }) {
  return fetchJson<AuthResult>("/api/auth/bootstrap", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function login(payload: { username: string; password: string }) {
  return fetchJson<AuthResult>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getCurrentUser() {
  return fetchJson<{ user: AuthUser }>("/api/auth/me");
}

export function logout() {
  return fetchJson<{ ok: true }>("/api/auth/logout", { method: "POST" });
}

export function updateMyPassword(payload: { currentPassword: string; newPassword: string }) {
  return fetchJson<{ ok: true }>("/api/auth/password", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function getMetrics() {
  return fetchJson<Metrics>("/api/metrics");
}

export function getVersionInfo() {
  return fetchJson<VersionInfo>("/api/version");
}

export function getSettings() {
  return fetchJson<{ settings: AppSettings }>("/api/settings");
}

export function updateSettings(payload: AppSettings) {
  return fetchJson<{ settings: AppSettings }>("/api/settings", {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function sendTelegramTest() {
  return fetchJson<{ ok: true }>("/api/settings/telegram/test", { method: "POST" });
}

export function getStorages() {
  return fetchJson<{ items: StorageTarget[] }>("/api/storages");
}

export function getStorageCapacities() {
  return fetchJson<{ items: StorageCapacityItem[] }>("/api/storages/capacity");
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
  return withAccessToken(`${API_BASE}/api/storages/${storageId}/media/stream?${q.toString()}`);
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

export function updateJob(jobId: string, payload: Omit<BackupJob, "id">) {
  return fetchJson<BackupJob>(`/api/jobs/${jobId}`, {
    method: "PUT",
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

export function getRuns() {
  return fetchJson<{ items: JobRun[] }>("/api/runs");
}

export function deleteRun(runId: string) {
  return fetchJson<{ ok: true }>(`/api/runs/${runId}`, { method: "DELETE" });
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
  return fetchJson<PreviewResult>(`/api/backups/${assetId}/preview?${q.toString()}`).then((result) => ({
    ...result,
    streamUrl: withAccessToken(result.streamUrl)
  }));
}
