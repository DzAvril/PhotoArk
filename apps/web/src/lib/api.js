const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080";
async function fetchJson(path, init) {
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
    return (await res.json());
}
export function getMetrics() {
    return fetchJson("/api/metrics");
}
export function getStorages() {
    return fetchJson("/api/storages");
}
export function getJobs() {
    return fetchJson("/api/jobs");
}
export function getBackups() {
    return fetchJson("/api/backups");
}
export function createPreviewToken(assetId) {
    return fetchJson(`/api/backups/${assetId}/preview-token`, { method: "POST" });
}
export function getPreview(assetId, token) {
    const q = new URLSearchParams({ token });
    return fetchJson(`/api/backups/${assetId}/preview?${q.toString()}`);
}
