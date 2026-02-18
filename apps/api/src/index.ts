import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import type { BackupJob, StorageTarget } from "@photoark/shared";
import { z } from "zod";
import { env } from "./config/env.js";
import { EncryptionService } from "./modules/crypto/encryption-service.js";
import { LivePhotoService } from "./modules/livephoto/live-photo-service.js";
import { FileStateRepository } from "./modules/backup/repository/file-state-repository.js";
import type { BackupAsset, BackupState, JobRun } from "./modules/backup/repository/types.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const publicRoot = path.resolve(currentDir, "../public");
const hasWebAssets = existsSync(publicRoot);
if (hasWebAssets) {
  await app.register(fastifyStatic, {
    root: publicRoot,
    prefix: "/"
  });
}
app.setErrorHandler((error, _req, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({
      message: "Invalid request payload",
      issues: error.issues
    });
  }

  const fastifyError = error as { statusCode?: number; code?: string; message?: string };
  if (fastifyError.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
    return reply.code(400).send({ message: "Body cannot be empty when content-type is set to application/json" });
  }

  const statusCode =
    typeof fastifyError.statusCode === "number" && fastifyError.statusCode >= 400
      ? fastifyError.statusCode
      : 500;
  const message = error instanceof Error ? error.message : "Internal server error";
  return reply.code(statusCode).send({ message });
});

const encryption = new EncryptionService(Buffer.from(env.MASTER_KEY_BASE64, "base64"));
const livePhoto = new LivePhotoService();
const stateRepo = new FileStateRepository(env.BACKUP_STATE_FILE);

const previewTokens = new Map<string, { assetId: string; expiresAt: number }>();
const previewTickets = new Map<string, { assetId: string; expiresAt: number }>();
const PREVIEW_TOKEN_TTL_MS = 60_000;

const storageCreateSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["local_fs", "external_ssd", "cloud_115"]),
  basePath: z.string().min(1),
  encrypted: z.boolean()
});

const jobCreateSchema = z.object({
  name: z.string().min(1),
  sourceTargetId: z.string().min(1),
  sourcePath: z.string().min(1),
  destinationTargetId: z.string().min(1),
  destinationPath: z.string().min(1),
  schedule: z.string().optional(),
  watchMode: z.boolean(),
  enabled: z.boolean()
});

const assetCreateSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["photo", "live_photo_image", "live_photo_video"]),
  storageTargetId: z.string().min(1),
  encrypted: z.boolean(),
  sizeBytes: z.number().int().nonnegative(),
  capturedAt: z.string().datetime(),
  livePhotoAssetId: z.string().optional()
});

function metricSummary(state: BackupState) {
  const encryptedAssets = state.assets.filter((a) => a.encrypted).length;
  const livePhotoPairs = new Set(state.assets.map((a) => a.livePhotoAssetId).filter(Boolean)).size;

  return {
    storageTargets: state.storages.length,
    backupJobs: state.jobs.length,
    encryptedAssets,
    livePhotoPairs
  };
}

function isLocalStorage(type: StorageTarget["type"]): boolean {
  return type === "local_fs" || type === "external_ssd";
}

function resolvePathInStorage(storage: StorageTarget, inputPath?: string): string {
  const rootPath = path.resolve(storage.basePath);
  const targetPath = path.resolve(inputPath ?? rootPath);
  const inStorage = targetPath === rootPath || targetPath.startsWith(`${rootPath}${path.sep}`);

  if (!inStorage) {
    throw new Error("Path is outside storage base path");
  }

  return targetPath;
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".m4v", ".avi", ".mkv", ".webm"]);
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".heic": "image/heic",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".avi": "video/x-msvideo",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm"
};

type VersionSource = "github_release" | "github_tag" | "unavailable";

function normalizeVersion(input: string): string {
  return input.trim().replace(/^v/i, "");
}

function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a).split(".").map((x) => Number.parseInt(x, 10));
  const pb = normalizeVersion(b).split(".").map((x) => Number.parseInt(x, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const av = Number.isFinite(pa[i]) ? pa[i] : 0;
    const bv = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

async function fetchLatestVersion(repo: string): Promise<{ latestVersion: string; source: VersionSource; latestUrl: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.VERSION_CHECK_TIMEOUT_MS);

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "PhotoArk-Version-Checker"
  };
  if (env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  }

  try {
    const releaseRes = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers,
      signal: controller.signal
    });
    if (releaseRes.ok) {
      const releaseJson = (await releaseRes.json()) as { tag_name?: string; html_url?: string };
      if (releaseJson.tag_name) {
        return {
          latestVersion: normalizeVersion(releaseJson.tag_name),
          source: "github_release",
          latestUrl: releaseJson.html_url ?? null
        };
      }
    }

    const tagsRes = await fetch(`https://api.github.com/repos/${repo}/tags?per_page=1`, {
      headers,
      signal: controller.signal
    });
    if (tagsRes.ok) {
      const tagsJson = (await tagsRes.json()) as Array<{ name?: string }>;
      const tagName = tagsJson[0]?.name;
      if (tagName) {
        return {
          latestVersion: normalizeVersion(tagName),
          source: "github_tag",
          latestUrl: `https://github.com/${repo}/tags`
        };
      }
    }
    throw new Error("No release/tag found");
  } finally {
    clearTimeout(timer);
  }
}

function toPosixPath(input: string): string {
  return input.split(path.sep).join(path.posix.sep);
}

function isMediaFile(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) || VIDEO_EXTENSIONS.has(ext);
}

function detectAssetKind(fileName: string, livePhotoAssetId: string | undefined): BackupAsset["kind"] {
  const ext = path.extname(fileName).toLowerCase();
  if (!livePhotoAssetId) return "photo";
  return VIDEO_EXTENSIONS.has(ext) ? "live_photo_video" : "live_photo_image";
}

async function collectMediaFiles(dirPath: string): Promise<string[]> {
  const out: string[] = [];

  async function walk(currentPath: string) {
    const entries = await readdir(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && isMediaFile(entry.name)) {
        out.push(fullPath);
      }
    }
  }

  await walk(dirPath);
  return out;
}

function buildLivePhotoIdByRelativePath(relativePaths: string[]): Map<string, string> {
  const images = new Set([".jpg", ".jpeg", ".heic"]);
  const videos = new Set([".mov"]);
  const baseGroups = new Map<string, { image?: string; video?: string }>();

  for (const relPath of relativePaths) {
    const ext = path.extname(relPath).toLowerCase();
    const base = relPath.slice(0, relPath.length - ext.length).toLowerCase();
    const row = baseGroups.get(base) ?? {};
    if (images.has(ext)) row.image = relPath;
    if (videos.has(ext)) row.video = relPath;
    baseGroups.set(base, row);
  }

  const out = new Map<string, string>();
  for (const [base, pair] of baseGroups.entries()) {
    if (pair.image && pair.video) {
      const id = `lp_${base}`;
      out.set(pair.image, id);
      out.set(pair.video, id);
    }
  }
  return out;
}

async function executeJob(state: BackupState, jobId: string): Promise<JobRun> {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) {
    throw new Error("Job not found");
  }
  if (!job.enabled) {
    throw new Error("Job is disabled");
  }

  const sourceStorage = state.storages.find((item) => item.id === job.sourceTargetId);
  const destinationStorage = state.storages.find((item) => item.id === job.destinationTargetId);
  if (!sourceStorage || !destinationStorage) {
    throw new Error("Storage target for this job is missing");
  }
  if (!isLocalStorage(sourceStorage.type) || !isLocalStorage(destinationStorage.type)) {
    throw new Error("Only local-to-local sync is supported in current version");
  }

  const sourceRoot = resolvePathInStorage(sourceStorage, job.sourcePath);
  const destinationRoot = resolvePathInStorage(destinationStorage, job.destinationPath);
  const startedAt = new Date().toISOString();

  const copiedSamples: string[] = [];
  const errors: JobRun["errors"] = [];
  let copiedCount = 0;
  let failedCount = 0;
  let photoCount = 0;
  let videoCount = 0;
  const copiedLivePhotoIds = new Set<string>();

  const sourceFiles = await collectMediaFiles(sourceRoot);
  const relativePaths = sourceFiles.map((fullPath) => toPosixPath(path.relative(sourceRoot, fullPath)));
  const livePhotoMap = buildLivePhotoIdByRelativePath(relativePaths);

  for (let i = 0; i < sourceFiles.length; i += 1) {
    const sourceFile = sourceFiles[i];
    const relativePath = relativePaths[i];
    const destinationFile = path.join(destinationRoot, relativePath);
    try {
      const input = await readFile(sourceFile);
      const output = destinationStorage.encrypted ? encryption.encrypt(input) : input;
      await mkdir(path.dirname(destinationFile), { recursive: true });
      await writeFile(destinationFile, output);

      const st = await stat(sourceFile);
      const livePhotoAssetId = livePhotoMap.get(relativePath);
      const existing = state.assets.find(
        (asset) => asset.storageTargetId === destinationStorage.id && asset.name === relativePath
      );
      const nextAsset: BackupAsset = {
        id: existing?.id ?? `asset_${randomUUID()}`,
        name: relativePath,
        kind: detectAssetKind(relativePath, livePhotoAssetId),
        storageTargetId: destinationStorage.id,
        encrypted: destinationStorage.encrypted,
        sizeBytes: st.size,
        capturedAt: st.mtime.toISOString(),
        livePhotoAssetId
      };

      if (existing) {
        const idx = state.assets.findIndex((asset) => asset.id === existing.id);
        state.assets[idx] = nextAsset;
      } else {
        state.assets.push(nextAsset);
      }

      if (nextAsset.kind === "photo" || nextAsset.kind === "live_photo_image") {
        photoCount += 1;
      }
      if (nextAsset.kind === "live_photo_video") {
        videoCount += 1;
      } else {
        const ext = path.extname(relativePath).toLowerCase();
        if (VIDEO_EXTENSIONS.has(ext)) videoCount += 1;
      }
      if (livePhotoAssetId) {
        copiedLivePhotoIds.add(livePhotoAssetId);
      }

      copiedCount += 1;
      if (copiedSamples.length < 20) {
        copiedSamples.push(relativePath);
      }
    } catch (error) {
      failedCount += 1;
      errors.push({ path: relativePath, error: (error as Error).message });
    }
  }

  const finishedAt = new Date().toISOString();
  const run: JobRun = {
    id: `run_${randomUUID()}`,
    jobId: job.id,
    status: failedCount === 0 ? "success" : "failed",
    startedAt,
    finishedAt,
    copiedCount,
    failedCount,
    photoCount,
    videoCount,
    livePhotoPairCount: copiedLivePhotoIds.size,
    copiedSamples,
    errors,
    message: `照片 ${photoCount}，视频 ${videoCount}，Live Photo ${copiedLivePhotoIds.size}，失败 ${failedCount}`
  };
  state.jobRuns.unshift(run);
  state.jobRuns = state.jobRuns.slice(0, 200);
  return run;
}

app.get("/healthz", async () => ({ ok: true }));

app.get("/api/metrics", async () => {
  const state = await stateRepo.loadState();
  return metricSummary(state);
});

app.get("/api/version", async () => {
  const checkedAt = new Date().toISOString();
  const currentVersion = normalizeVersion(env.APP_VERSION);
  try {
    const { latestVersion, source, latestUrl } = await fetchLatestVersion(env.VERSION_CHECK_REPO);
    const cmp = compareVersions(currentVersion, latestVersion);
    return {
      currentVersion,
      latestVersion,
      upToDate: cmp >= 0,
      hasUpdate: cmp < 0,
      source,
      checkedAt,
      repo: env.VERSION_CHECK_REPO,
      latestUrl
    };
  } catch (error) {
    return {
      currentVersion,
      latestVersion: null,
      upToDate: null,
      hasUpdate: null,
      source: "unavailable" as VersionSource,
      checkedAt,
      repo: env.VERSION_CHECK_REPO,
      latestUrl: null,
      error: (error as Error).message
    };
  }
});

app.get("/api/storages", async () => {
  const state = await stateRepo.loadState();
  return { items: state.storages };
});

app.get<{ Querystring: { path?: string } }>("/api/fs/directories", async (req, reply) => {
  const inputPath = req.query.path ?? env.FS_BROWSE_ROOT ?? "/";
  const currentPath = path.resolve(inputPath);
  const rootPath = path.resolve(env.FS_BROWSE_ROOT || "/");
  const dirEntries = await readdir(currentPath, { withFileTypes: true }).catch(() => null);
  if (!dirEntries) {
    return reply.code(404).send({ message: "Directory not found" });
  }
  const directories = dirEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      path: path.join(currentPath, entry.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parentPath =
    currentPath === rootPath
      ? null
      : path.dirname(currentPath).startsWith(rootPath)
        ? path.dirname(currentPath)
        : rootPath;

  return {
    rootPath,
    currentPath,
    parentPath,
    directories
  };
});

app.get<{ Params: { storageId: string }; Querystring: { path?: string } }>(
  "/api/storages/:storageId/directories",
  async (req, reply) => {
    const state = await stateRepo.loadState();
    const storage = state.storages.find((item) => item.id === req.params.storageId);
    if (!storage) {
      return reply.code(404).send({ message: "Storage not found" });
    }
    if (!isLocalStorage(storage.type)) {
      return reply.code(400).send({ message: "Directory browse is only supported for local storage types" });
    }

    let currentPath = "";
    try {
      currentPath = resolvePathInStorage(storage, req.query.path);
    } catch (error) {
      return reply.code(403).send({ message: (error as Error).message });
    }

    const rootPath = path.resolve(storage.basePath);
    const dirEntries = await readdir(currentPath, { withFileTypes: true }).catch(() => null);
    if (!dirEntries) {
      return reply.code(404).send({ message: "Directory not found" });
    }
    const directories = dirEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        name: entry.name,
        path: path.join(currentPath, entry.name)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const rawParent = path.dirname(currentPath);
    const parentPath = rawParent === currentPath ? null : rawParent.startsWith(rootPath) ? rawParent : null;

    return {
      rootPath,
      currentPath,
      parentPath,
      directories
    };
  }
);

app.get<{ Params: { storageId: string }; Querystring: { path?: string } }>(
  "/api/storages/:storageId/media",
  async (req, reply) => {
    const state = await stateRepo.loadState();
    const storage = state.storages.find((item) => item.id === req.params.storageId);
    if (!storage) {
      return reply.code(404).send({ message: "Storage not found" });
    }
    if (!isLocalStorage(storage.type)) {
      return reply.code(400).send({ message: "Media browse is only supported for local storage types" });
    }

    let currentPath = "";
    try {
      currentPath = resolvePathInStorage(storage, req.query.path);
    } catch (error) {
      return reply.code(403).send({ message: (error as Error).message });
    }

    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => null);
    if (!entries) {
      return reply.code(404).send({ message: "Directory not found" });
    }
    const files = entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const ext = path.extname(entry.name).toLowerCase();
        const kind = IMAGE_EXTENSIONS.has(ext) ? "image" : VIDEO_EXTENSIONS.has(ext) ? "video" : "other";
        return {
          name: entry.name,
          path: path.join(currentPath, entry.name),
          kind
        };
      })
      .filter((entry) => entry.kind !== "other");

    return {
      storageId: storage.id,
      path: currentPath,
      files
    };
  }
);

app.get<{ Params: { storageId: string }; Querystring: { path?: string } }>(
  "/api/storages/:storageId/media/stream",
  async (req, reply) => {
    const rawPath = req.query.path;
    if (!rawPath) {
      return reply.code(400).send({ message: "Path is required" });
    }

    const state = await stateRepo.loadState();
    const storage = state.storages.find((item) => item.id === req.params.storageId);
    if (!storage) {
      return reply.code(404).send({ message: "Storage not found" });
    }
    if (!isLocalStorage(storage.type)) {
      return reply.code(400).send({ message: "Media stream is only supported for local storage types" });
    }

    let targetPath = "";
    try {
      targetPath = resolvePathInStorage(storage, rawPath);
    } catch (error) {
      return reply.code(403).send({ message: (error as Error).message });
    }

    const fileStat = await stat(targetPath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      return reply.code(404).send({ message: "File not found" });
    }

    const ext = path.extname(targetPath).toLowerCase();
    const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
    const range = req.headers.range;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) {
        return reply.code(416).send({ message: "Invalid range header" });
      }

      const start = match[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match[2] ? Number.parseInt(match[2], 10) : fileStat.size - 1;
      if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= fileStat.size) {
        return reply.code(416).send({ message: "Requested range not satisfiable" });
      }

      const stream = createReadStream(targetPath, { start, end });
      reply
        .code(206)
        .header("Content-Type", mimeType)
        .header("Accept-Ranges", "bytes")
        .header("Content-Length", String(end - start + 1))
        .header("Content-Range", `bytes ${start}-${end}/${fileStat.size}`);
      return reply.send(stream);
    }

    reply
      .header("Content-Type", mimeType)
      .header("Content-Length", String(fileStat.size))
      .header("Accept-Ranges", "bytes");
    return reply.send(createReadStream(targetPath));
  }
);

app.post<{ Body: Omit<StorageTarget, "id"> }>("/api/storages", async (req) => {
  const state = await stateRepo.loadState();
  const body = storageCreateSchema.parse(req.body);
  const item: StorageTarget = { id: `st_${randomUUID()}`, ...body };
  state.storages.push(item);
  await stateRepo.saveState(state);
  return item;
});

app.delete<{ Params: { storageId: string } }>("/api/storages/:storageId", async (req, reply) => {
  const state = await stateRepo.loadState();
  const before = state.storages.length;
  state.storages = state.storages.filter((s) => s.id !== req.params.storageId);
  if (state.storages.length === before) {
    return reply.code(404).send({ message: "Storage not found" });
  }
  await stateRepo.saveState(state);
  return { ok: true };
});

app.get("/api/jobs", async () => {
  const state = await stateRepo.loadState();
  return { items: state.jobs };
});

app.post<{ Body: Omit<BackupJob, "id"> }>("/api/jobs", async (req) => {
  const state = await stateRepo.loadState();
  const body = jobCreateSchema.parse(req.body);
  const item: BackupJob = { id: `job_${randomUUID()}`, ...body };
  state.jobs.push(item);
  await stateRepo.saveState(state);
  return item;
});

app.put<{ Params: { jobId: string }; Body: Omit<BackupJob, "id"> }>("/api/jobs/:jobId", async (req, reply) => {
  const state = await stateRepo.loadState();
  const body = jobCreateSchema.parse(req.body);
  const idx = state.jobs.findIndex((j) => j.id === req.params.jobId);
  if (idx < 0) {
    return reply.code(404).send({ message: "Job not found" });
  }
  const updated: BackupJob = { id: req.params.jobId, ...body };
  state.jobs[idx] = updated;
  await stateRepo.saveState(state);
  return updated;
});

app.delete<{ Params: { jobId: string } }>("/api/jobs/:jobId", async (req, reply) => {
  try {
    const state = await stateRepo.loadState();
    const before = state.jobs.length;
    state.jobs = state.jobs.filter((j) => j.id !== req.params.jobId);
    if (state.jobs.length === before) {
      return reply.code(404).send({ message: "Job not found" });
    }
    state.jobRuns = state.jobRuns.filter((run) => run.jobId !== req.params.jobId);
    await stateRepo.saveState(state);
    return { ok: true };
  } catch (error) {
    return reply.code(500).send({ message: (error as Error).message || "Delete job failed" });
  }
});

app.get("/api/runs", async () => {
  const state = await stateRepo.loadState();
  return { items: state.jobRuns };
});

app.get<{ Params: { jobId: string } }>("/api/jobs/:jobId/runs", async (req, reply) => {
  const state = await stateRepo.loadState();
  const hasJob = state.jobs.some((j) => j.id === req.params.jobId);
  if (!hasJob) {
    return reply.code(404).send({ message: "Job not found" });
  }
  return { items: state.jobRuns.filter((run) => run.jobId === req.params.jobId) };
});

app.post<{ Params: { jobId: string } }>("/api/jobs/:jobId/run", async (req, reply) => {
  const state = await stateRepo.loadState();
  try {
    const run = await executeJob(state, req.params.jobId);
    await stateRepo.saveState(state);
    return run;
  } catch (error) {
    return reply.code(400).send({ message: (error as Error).message });
  }
});

app.get("/api/backups", async () => {
  const state = await stateRepo.loadState();
  const livePhotoPairs = livePhoto.detectPairs(state.assets.map((a) => a.name));

  return {
    items: state.assets,
    livePhotoPairs
  };
});

app.post<{ Body: Omit<BackupAsset, "id"> }>("/api/backups", async (req) => {
  const state = await stateRepo.loadState();
  const body = assetCreateSchema.parse(req.body);
  const item: BackupAsset = { id: `asset_${randomUUID()}`, ...body };
  state.assets.push(item);
  await stateRepo.saveState(state);
  return item;
});

app.delete<{ Params: { assetId: string } }>("/api/backups/:assetId", async (req, reply) => {
  const state = await stateRepo.loadState();
  const before = state.assets.length;
  state.assets = state.assets.filter((a) => a.id !== req.params.assetId);
  if (state.assets.length === before) {
    return reply.code(404).send({ message: "Asset not found" });
  }
  await stateRepo.saveState(state);
  return { ok: true };
});

app.post<{ Params: { assetId: string } }>("/api/backups/:assetId/preview-token", async (req, reply) => {
  const state = await stateRepo.loadState();
  const asset = state.assets.find((item) => item.id === req.params.assetId);
  if (!asset) {
    return reply.code(404).send({ message: "Asset not found" });
  }

  const token = randomUUID();
  previewTokens.set(token, {
    assetId: asset.id,
    expiresAt: Date.now() + PREVIEW_TOKEN_TTL_MS
  });

  return {
    token,
    expiresAt: new Date(Date.now() + PREVIEW_TOKEN_TTL_MS).toISOString(),
    assetId: asset.id,
    encrypted: asset.encrypted
  };
});

app.get<{ Params: { assetId: string }; Querystring: { token?: string } }>(
  "/api/backups/:assetId/preview",
  async (req, reply) => {
    const token = req.query.token;
    if (!token) {
      return reply.code(400).send({ message: "Preview token is required" });
    }

    const tokenInfo = previewTokens.get(token);
    if (!tokenInfo || tokenInfo.assetId !== req.params.assetId || tokenInfo.expiresAt < Date.now()) {
      return reply.code(401).send({ message: "Preview token is invalid or expired" });
    }

    const state = await stateRepo.loadState();
    const asset = state.assets.find((item) => item.id === req.params.assetId);
    if (!asset) {
      return reply.code(404).send({ message: "Asset not found" });
    }

    previewTokens.delete(token);
    const ticket = randomUUID();
    previewTickets.set(ticket, { assetId: asset.id, expiresAt: Date.now() + PREVIEW_TOKEN_TTL_MS });

    return {
      assetId: asset.id,
      mode: asset.encrypted ? "decrypted_memory_stream" : "direct_stream",
      streamUrl: `/api/backups/${asset.id}/stream?ticket=${ticket}`,
      message: asset.encrypted
        ? "Encrypted asset will be decrypted in-memory for one-time preview."
        : "Asset can be previewed directly."
    };
  }
);

app.get<{ Params: { assetId: string } }>("/api/backups/:assetId/live-photo", async (req, reply) => {
  const state = await stateRepo.loadState();
  const asset = state.assets.find((item) => item.id === req.params.assetId);
  if (!asset) {
    return reply.code(404).send({ message: "Asset not found" });
  }
  if (!asset.livePhotoAssetId) {
    return { pair: null };
  }

  const image = state.assets.find(
    (item) => item.livePhotoAssetId === asset.livePhotoAssetId && item.kind === "live_photo_image"
  );
  const video = state.assets.find(
    (item) => item.livePhotoAssetId === asset.livePhotoAssetId && item.kind === "live_photo_video"
  );

  return {
    pair: {
      livePhotoAssetId: asset.livePhotoAssetId,
      image: image ?? null,
      video: video ?? null
    }
  };
});

app.get<{ Params: { assetId: string }; Querystring: { ticket?: string } }>(
  "/api/backups/:assetId/stream",
  async (req, reply) => {
    const ticket = req.query.ticket;
    if (!ticket) {
      return reply.code(400).send({ message: "Preview ticket is required" });
    }

    const ticketInfo = previewTickets.get(ticket);
    if (!ticketInfo || ticketInfo.assetId !== req.params.assetId || ticketInfo.expiresAt < Date.now()) {
      return reply.code(401).send({ message: "Preview ticket is invalid or expired" });
    }

    previewTickets.delete(ticket);
    return reply
      .type("application/json")
      .send({ assetId: req.params.assetId, status: "stream_ready_placeholder" });
  }
);

app.post<{ Body: { names: string[] } }>("/api/live-photo/pairs", async (req) => {
  return { pairs: livePhoto.detectPairs(req.body.names) };
});

app.post<{ Body: { contentBase64: string } }>("/api/crypto/encrypt", async (req) => {
  const plain = Buffer.from(req.body.contentBase64, "base64");
  const encrypted = encryption.encrypt(plain);
  return { cipherBase64: encrypted.toString("base64") };
});

app.setNotFoundHandler((req, reply) => {
  if (req.raw.url?.startsWith("/api/")) {
    return reply.code(404).send({ message: "Not found" });
  }
  if (hasWebAssets) {
    return reply.sendFile("index.html");
  }
  return reply.code(404).send({ message: "Not found" });
});

app.listen({ port: env.API_PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
