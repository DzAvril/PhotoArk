import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat, statfs, utimes } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { watch as chokidarWatch, type FSWatcher } from "chokidar";
import type { BackupJob, StorageTarget } from "@photoark/shared";
import { z } from "zod";
import { env } from "./config/env.js";
import { EncryptionService } from "./modules/crypto/encryption-service.js";
import { LivePhotoService } from "./modules/livephoto/live-photo-service.js";
import { TelegramService } from "./modules/notification/telegram-service.js";
import { PasswordService } from "./modules/auth/password-service.js";
import { FileStateRepository } from "./modules/backup/repository/file-state-repository.js";
import type {
  AppSettings,
  AuthSession,
  AuthUser,
  BackupAsset,
  BackupState,
  JobRun,
  JobRunTrigger
} from "./modules/backup/repository/types.js";

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

function parseMasterKey(input: string, sourceName: string): Buffer {
  try {
    return Buffer.from(input, "base64");
  } catch {
    throw new Error(`${sourceName} is not valid base64.`);
  }
}

function parseLegacyKeys(raw?: string): Buffer[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((item) => parseMasterKey(item, "LEGACY_MASTER_KEYS_BASE64 item"));
}

const encryption = new EncryptionService(
  parseMasterKey(env.MASTER_KEY_BASE64, "MASTER_KEY_BASE64"),
  parseLegacyKeys(env.LEGACY_MASTER_KEYS_BASE64)
);
const livePhoto = new LivePhotoService();
const passwordService = new PasswordService();
const stateRepo = new FileStateRepository(env.BACKUP_STATE_FILE);

const previewTokens = new Map<string, { assetId: string; expiresAt: number }>();
const previewTickets = new Map<string, { assetId: string; expiresAt: number }>();
const PREVIEW_TOKEN_TTL_MS = 60_000;
const usernamePattern = /^[A-Za-z0-9._-]{3,32}$/;

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
    authTokenHash?: string;
  }
}

const authBootstrapSchema = z.object({
  username: z
    .string()
    .trim()
    .regex(usernamePattern, "Username must be 3-32 chars and contain only letters, numbers, . _ -"),
  password: z.string().min(8).max(128)
});

const authLoginSchema = authBootstrapSchema;

const authUpdatePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128)
});

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
  kind: z.enum(["photo", "video", "live_photo_image", "live_photo_video"]),
  storageTargetId: z.string().min(1),
  encrypted: z.boolean(),
  sizeBytes: z.number().int().nonnegative(),
  capturedAt: z.string().datetime(),
  livePhotoAssetId: z.string().optional()
});

const settingsSchema = z.object({
  telegram: z.object({
    enabled: z.boolean(),
    botToken: z.string().trim(),
    chatId: z.string().trim(),
    proxyUrl: z.string().trim()
  })
});

function normalizeSettings(input: Partial<AppSettings> | undefined): AppSettings {
  return {
    telegram: {
      enabled: Boolean(input?.telegram?.enabled),
      botToken: input?.telegram?.botToken?.trim() ?? "",
      chatId: input?.telegram?.chatId?.trim() ?? "",
      proxyUrl: input?.telegram?.proxyUrl?.trim() ?? ""
    }
  };
}

type PublicAuthUser = Pick<AuthUser, "id" | "username" | "role" | "createdAt" | "updatedAt" | "lastLoginAt">;

function toPublicAuthUser(user: AuthUser): PublicAuthUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLoginAt: user.lastLoginAt
  };
}

function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

function hashAccessToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function issueSession(state: BackupState, userId: string): { session: AuthSession; token: string } {
  const nowMs = Date.now();
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + env.AUTH_SESSION_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashAccessToken(token);

  const session: AuthSession = {
    id: `sess_${randomUUID()}`,
    userId,
    tokenHash,
    createdAt,
    expiresAt
  };
  state.sessions.push(session);
  return { session, token };
}

function pruneExpiredSessions(state: BackupState): boolean {
  const now = Date.now();
  const before = state.sessions.length;
  state.sessions = state.sessions.filter((session) => {
    const expiresAtMs = Date.parse(session.expiresAt);
    return Number.isFinite(expiresAtMs) && expiresAtMs > now;
  });
  return state.sessions.length !== before;
}

function extractBearerToken(headerValue: string | undefined): string | null {
  if (!headerValue) return null;
  const [scheme, token] = headerValue.split(" ");
  if ((scheme ?? "").toLowerCase() !== "bearer" || !token) {
    return null;
  }
  return token.trim();
}

const publicApiRoutes = new Set<string>([
  "/api/version",
  "/api/auth/status",
  "/api/auth/bootstrap",
  "/api/auth/login"
]);

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

function isSameOrSubPath(basePath: string, candidatePath: string): boolean {
  const normalizedBase = path.resolve(basePath);
  const normalizedCandidate = path.resolve(candidatePath);
  return normalizedCandidate === normalizedBase || normalizedCandidate.startsWith(`${normalizedBase}${path.sep}`);
}

function hasOverlappingPaths(sourceRoot: string, destinationRoot: string): boolean {
  return isSameOrSubPath(sourceRoot, destinationRoot) || isSameOrSubPath(destinationRoot, sourceRoot);
}

function validateJobPathSafety(state: BackupState, body: Omit<BackupJob, "id">): string | null {
  const sourceStorage = state.storages.find((item) => item.id === body.sourceTargetId);
  const destinationStorage = state.storages.find((item) => item.id === body.destinationTargetId);
  if (!sourceStorage || !destinationStorage) {
    return "Storage target for this job is missing";
  }
  if (!isLocalStorage(sourceStorage.type) || !isLocalStorage(destinationStorage.type)) {
    return null;
  }

  let sourceRoot = "";
  let destinationRoot = "";
  try {
    sourceRoot = resolvePathInStorage(sourceStorage, body.sourcePath);
    destinationRoot = resolvePathInStorage(destinationStorage, body.destinationPath);
  } catch (error) {
    return (error as Error).message;
  }

  if (hasOverlappingPaths(sourceRoot, destinationRoot)) {
    return "Source path and destination path cannot overlap";
  }
  return null;
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

type ByteRange = {
  start: number;
  end: number;
};

function parseByteRange(rangeHeader: string | undefined, size: number): { range: ByteRange | null; error: string | null } {
  if (!rangeHeader) {
    return { range: null, error: null };
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
  if (!match) {
    return { range: null, error: "Invalid range header" };
  }

  const start = match[1] ? Number.parseInt(match[1], 10) : 0;
  const end = match[2] ? Number.parseInt(match[2], 10) : size - 1;
  const invalid = !Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= size;
  if (invalid) {
    return { range: null, error: "Requested range not satisfiable" };
  }

  return {
    range: { start, end },
    error: null
  };
}

function resolveMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

type StorageCapacitySnapshot = {
  storageId: string;
  storageName: string;
  groupKey: string;
  available: boolean;
  reason: string | null;
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usedPercent: number | null;
};

function buildUnavailableStorageCapacitySnapshot(
  storage: StorageTarget,
  reason: string,
  groupKey = `storage:${storage.id}`
): StorageCapacitySnapshot {
  return {
    storageId: storage.id,
    storageName: storage.name,
    groupKey,
    available: false,
    reason,
    totalBytes: null,
    usedBytes: null,
    freeBytes: null,
    usedPercent: null
  };
}

function buildStorageCapacityGroupKey(pathDev: bigint, fsStats: Awaited<ReturnType<typeof statfs>>): string {
  // st_dev alone can collide on some mount layouts; include filesystem geometry for safer grouping.
  return `fs:${pathDev.toString()}:${fsStats.type}:${fsStats.bsize}:${fsStats.blocks}:${fsStats.files}`;
}

async function buildStorageCapacitySnapshot(storage: StorageTarget): Promise<StorageCapacitySnapshot> {
  if (!isLocalStorage(storage.type)) {
    return buildUnavailableStorageCapacitySnapshot(storage, "云存储暂不支持容量读取");
  }

  try {
    const targetPath = path.resolve(storage.basePath);
    const [pathStats, fsStats] = await Promise.all([stat(targetPath, { bigint: true }), statfs(targetPath)]);
    const totalBytes = fsStats.blocks * fsStats.bsize;
    const freeBytes = fsStats.bavail * fsStats.bsize;
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const usedPercent = totalBytes > 0 ? Number(((usedBytes / totalBytes) * 100).toFixed(1)) : 0;

    return {
      storageId: storage.id,
      storageName: storage.name,
      groupKey: buildStorageCapacityGroupKey(pathStats.dev, fsStats),
      available: true,
      reason: null,
      totalBytes,
      usedBytes,
      freeBytes,
      usedPercent
    };
  } catch (error) {
    return buildUnavailableStorageCapacitySnapshot(storage, `读取失败: ${(error as Error).message}`);
  }
}

function mergeStorageCapacitySnapshots(snapshots: StorageCapacitySnapshot[]): StorageCapacityItem[] {
  const groups = new Map<string, StorageCapacityItem>();

  for (const snapshot of snapshots) {
    const existing = groups.get(snapshot.groupKey);
    if (!existing) {
      groups.set(snapshot.groupKey, {
        id: snapshot.groupKey,
        storageIds: [snapshot.storageId],
        storageNames: [snapshot.storageName],
        available: snapshot.available,
        reason: snapshot.reason,
        totalBytes: snapshot.totalBytes,
        usedBytes: snapshot.usedBytes,
        freeBytes: snapshot.freeBytes,
        usedPercent: snapshot.usedPercent
      });
      continue;
    }

    existing.storageIds.push(snapshot.storageId);
    existing.storageNames.push(snapshot.storageName);
    if (!existing.available && snapshot.available) {
      existing.available = true;
      existing.reason = null;
      existing.totalBytes = snapshot.totalBytes;
      existing.usedBytes = snapshot.usedBytes;
      existing.freeBytes = snapshot.freeBytes;
      existing.usedPercent = snapshot.usedPercent;
    }
  }

  const items = [...groups.values()].map((item) => ({
    ...item,
    storageNames: [...item.storageNames].sort((a, b) => a.localeCompare(b, "zh-CN")),
    storageIds: [...item.storageIds].sort((a, b) => a.localeCompare(b))
  }));

  items.sort((a, b) => {
    if (a.available !== b.available) return a.available ? -1 : 1;
    return (a.storageNames[0] ?? "").localeCompare(b.storageNames[0] ?? "", "zh-CN");
  });
  return items;
}

function sendBufferWithRange(reply: FastifyReply, plain: Buffer, mimeType: string, rangeHeader: string | undefined) {
  const parsed = parseByteRange(rangeHeader, plain.length);
  if (parsed.error) {
    return reply.code(416).send({ message: parsed.error });
  }

  if (parsed.range) {
    const { start, end } = parsed.range;
    const chunk = plain.subarray(start, end + 1);
    reply
      .code(206)
      .header("Content-Type", mimeType)
      .header("Accept-Ranges", "bytes")
      .header("Content-Length", String(chunk.length))
      .header("Content-Range", `bytes ${start}-${end}/${plain.length}`);
    return reply.send(chunk);
  }

  reply
    .header("Content-Type", mimeType)
    .header("Content-Length", String(plain.length))
    .header("Accept-Ranges", "bytes");
  return reply.send(plain);
}

function sendLocalFileStreamWithRange(
  reply: FastifyReply,
  filePath: string,
  fileSize: number,
  mimeType: string,
  rangeHeader: string | undefined
) {
  const parsed = parseByteRange(rangeHeader, fileSize);
  if (parsed.error) {
    return reply.code(416).send({ message: parsed.error });
  }

  if (parsed.range) {
    const { start, end } = parsed.range;
    const stream = createReadStream(filePath, { start, end });
    reply
      .code(206)
      .header("Content-Type", mimeType)
      .header("Accept-Ranges", "bytes")
      .header("Content-Length", String(end - start + 1))
      .header("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    return reply.send(stream);
  }

  reply
    .header("Content-Type", mimeType)
    .header("Content-Length", String(fileSize))
    .header("Accept-Ranges", "bytes");
  return reply.send(createReadStream(filePath));
}

type JobWatcherControl = {
  watcher: FSWatcher;
  sourceRoot: string;
  usePolling: boolean;
  faulted: boolean;
  lastError: string | null;
  debounceTimer: NodeJS.Timeout | null;
  pendingPath: string | null;
  pendingReason: string | null;
  pendingSinceMs: number | null;
};

const jobWatchers = new Map<string, JobWatcherControl>();
const forcedPollingJobs = new Set<string>();
const runningWatchJobs = new Set<string>();
const queuedWatchJobs = new Set<string>();
let runExecutionQueue: Promise<unknown> = Promise.resolve();
let watcherReconcileTimer: NodeJS.Timeout | null = null;
const jobExecutions = new Map<string, JobExecution>();
const JOB_EXECUTION_HISTORY_LIMIT = 200;

type JobExecutionStatus = "queued" | "running" | "success" | "failed";
type JobExecutionPhase = "queued" | "scanning" | "syncing" | "finished";

type JobExecutionProgress = {
  phase: JobExecutionPhase;
  totalCount: number | null;
  scannedCount: number;
  processedCount: number;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
  photoCount: number;
  videoCount: number;
  livePhotoPairCount: number;
  percent: number;
  currentPath: string | null;
};

type JobExecution = {
  id: string;
  jobId: string;
  trigger: JobRunTrigger;
  status: JobExecutionStatus;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
  runId: string | null;
  message: string | null;
  error: string | null;
  progress: JobExecutionProgress;
};

type VersionSource = "github_release" | "github_tag" | "unavailable";

type StorageCapacityItem = {
  id: string;
  storageIds: string[];
  storageNames: string[];
  available: boolean;
  reason: string | null;
  totalBytes: number | null;
  usedBytes: number | null;
  freeBytes: number | null;
  usedPercent: number | null;
};

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
  if (!livePhotoAssetId) return VIDEO_EXTENSIONS.has(ext) ? "video" : "photo";
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

type JobExecutionProgressUpdate = {
  phase: JobExecutionPhase;
  totalCount: number | null;
  scannedCount: number;
  processedCount: number;
  copiedCount: number;
  skippedCount: number;
  failedCount: number;
  photoCount: number;
  videoCount: number;
  livePhotoPairCount: number;
  percent: number;
  currentPath: string | null;
};

type ExecuteJobProgressHandler = (progress: JobExecutionProgressUpdate) => void;

function clampProgressPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 100) return 100;
  return Math.round(value);
}

function normalizeJobExecution(execution: JobExecution): JobExecution {
  return {
    ...execution,
    trigger: normalizeRunTrigger(execution.trigger),
    progress: {
      ...execution.progress
    }
  };
}

function listJobExecutions(): JobExecution[] {
  const items = [...jobExecutions.values()];
  items.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return items.map(normalizeJobExecution);
}

function trimJobExecutions() {
  const all = [...jobExecutions.values()];
  const activeIds = new Set(all.filter((item) => item.status === "queued" || item.status === "running").map((item) => item.id));
  const finishedIds = all
    .filter((item) => item.status === "success" || item.status === "failed")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, JOB_EXECUTION_HISTORY_LIMIT)
    .map((item) => item.id);
  const keepIds = new Set([...activeIds, ...finishedIds]);
  for (const id of jobExecutions.keys()) {
    if (!keepIds.has(id)) {
      jobExecutions.delete(id);
    }
  }
}

function createJobExecution(jobId: string, trigger: JobRunTrigger): JobExecution {
  const now = new Date().toISOString();
  const execution: JobExecution = {
    id: `exec_${randomUUID()}`,
    jobId,
    trigger,
    status: "queued",
    createdAt: now,
    startedAt: null,
    finishedAt: null,
    updatedAt: now,
    runId: null,
    message: null,
    error: null,
    progress: {
      phase: "queued",
      totalCount: null,
      scannedCount: 0,
      processedCount: 0,
      copiedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      photoCount: 0,
      videoCount: 0,
      livePhotoPairCount: 0,
      percent: 0,
      currentPath: null
    }
  };
  jobExecutions.set(execution.id, execution);
  trimJobExecutions();
  return execution;
}

function updateJobExecution(executionId: string, updater: (execution: JobExecution) => void) {
  const current = jobExecutions.get(executionId);
  if (!current) return;
  updater(current);
  current.updatedAt = new Date().toISOString();
}

async function executeJob(
  state: BackupState,
  jobId: string,
  trigger: JobRunTrigger,
  onProgress?: ExecuteJobProgressHandler
): Promise<JobRun> {
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
  if (hasOverlappingPaths(sourceRoot, destinationRoot)) {
    throw new Error("Source path and destination path cannot overlap");
  }

  const emitProgress = (
    phase: JobExecutionPhase,
    progress: {
      totalCount: number | null;
      scannedCount: number;
      processedCount: number;
      copiedCount: number;
      skippedCount: number;
      failedCount: number;
      photoCount: number;
      videoCount: number;
      livePhotoPairCount: number;
      currentPath: string | null;
    }
  ) => {
    if (!onProgress) return;
    const { totalCount, processedCount } = progress;
    const percent = clampProgressPercent(totalCount && totalCount > 0 ? (processedCount / totalCount) * 100 : phase === "finished" ? 100 : 0);
    onProgress({
      phase,
      totalCount,
      scannedCount: progress.scannedCount,
      processedCount,
      copiedCount: progress.copiedCount,
      skippedCount: progress.skippedCount,
      failedCount: progress.failedCount,
      photoCount: progress.photoCount,
      videoCount: progress.videoCount,
      livePhotoPairCount: progress.livePhotoPairCount,
      percent,
      currentPath: progress.currentPath
    });
  };

  const startedAt = new Date().toISOString();
  emitProgress("scanning", {
    totalCount: null,
    scannedCount: 0,
    processedCount: 0,
    copiedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    photoCount: 0,
    videoCount: 0,
    livePhotoPairCount: 0,
    currentPath: null
  });

  const sourceFiles = await collectMediaFiles(sourceRoot);
  const relativePaths = sourceFiles.map((fullPath) => toPosixPath(path.relative(sourceRoot, fullPath)));
  const livePhotoMap = buildLivePhotoIdByRelativePath(relativePaths);

  const copiedSamples: string[] = [];
  const errors: JobRun["errors"] = [];
  const scannedCount = sourceFiles.length;
  let processedCount = 0;
  let skippedCount = 0;
  let copiedCount = 0;
  let failedCount = 0;
  let photoCount = 0;
  let videoCount = 0;
  const copiedLivePhotoIds = new Set<string>();
  const destinationAssetIndexByName = new Map<string, number>();

  for (let idx = 0; idx < state.assets.length; idx += 1) {
    const asset = state.assets[idx];
    if (asset.storageTargetId === destinationStorage.id) {
      destinationAssetIndexByName.set(asset.name, idx);
    }
  }

  emitProgress("syncing", {
    totalCount: scannedCount,
    scannedCount,
    processedCount,
    copiedCount,
    skippedCount,
    failedCount,
    photoCount,
    videoCount,
    livePhotoPairCount: copiedLivePhotoIds.size,
    currentPath: null
  });

  for (let i = 0; i < sourceFiles.length; i += 1) {
    const sourceFile = sourceFiles[i];
    const relativePath = relativePaths[i];
    const destinationFile = path.join(destinationRoot, relativePath);
    try {
      const sourceStat = await stat(sourceFile);
      const sourceCapturedAt = sourceStat.mtime.toISOString();
      const livePhotoAssetId = livePhotoMap.get(relativePath);
      const nextKind = detectAssetKind(relativePath, livePhotoAssetId);
      const existingIdx = destinationAssetIndexByName.get(relativePath);
      const existing = existingIdx === undefined ? undefined : state.assets[existingIdx];
      const destinationStat = await stat(destinationFile).catch(() => null);
      const destinationExists = Boolean(destinationStat?.isFile());
      if (
        existing &&
        existingIdx !== undefined &&
        destinationExists &&
        existing.sizeBytes === sourceStat.size &&
        existing.capturedAt === sourceCapturedAt &&
        existing.encrypted === destinationStorage.encrypted
      ) {
        const nextAsset: BackupAsset = {
          id: existing.id,
          name: relativePath,
          kind: nextKind,
          storageTargetId: destinationStorage.id,
          encrypted: destinationStorage.encrypted,
          sizeBytes: sourceStat.size,
          capturedAt: sourceCapturedAt,
          livePhotoAssetId
        };
        if (
          existing.kind !== nextAsset.kind ||
          (existing.livePhotoAssetId ?? undefined) !== (nextAsset.livePhotoAssetId ?? undefined)
        ) {
          state.assets[existingIdx] = nextAsset;
        }
        skippedCount += 1;
        processedCount += 1;
        emitProgress("syncing", {
          totalCount: scannedCount,
          scannedCount,
          processedCount,
          copiedCount,
          skippedCount,
          failedCount,
          photoCount,
          videoCount,
          livePhotoPairCount: copiedLivePhotoIds.size,
          currentPath: relativePath
        });
        continue;
      }

      await mkdir(path.dirname(destinationFile), { recursive: true });
      if (!sourceStorage.encrypted && !destinationStorage.encrypted) {
        await copyFile(sourceFile, destinationFile);
      } else if (!sourceStorage.encrypted && destinationStorage.encrypted) {
        await encryption.encryptFile(sourceFile, destinationFile);
      } else if (sourceStorage.encrypted && !destinationStorage.encrypted) {
        await encryption.decryptFile(sourceFile, destinationFile);
      } else {
        await encryption.reencryptFile(sourceFile, destinationFile);
      }
      await utimes(destinationFile, sourceStat.atime, sourceStat.mtime).catch(() => undefined);
      const nextAsset: BackupAsset = {
        id: existing?.id ?? `asset_${randomUUID()}`,
        name: relativePath,
        kind: nextKind,
        storageTargetId: destinationStorage.id,
        encrypted: destinationStorage.encrypted,
        sizeBytes: sourceStat.size,
        capturedAt: sourceCapturedAt,
        livePhotoAssetId
      };

      if (existingIdx !== undefined) {
        state.assets[existingIdx] = nextAsset;
      } else {
        state.assets.push(nextAsset);
        destinationAssetIndexByName.set(relativePath, state.assets.length - 1);
      }

      const ext = path.extname(relativePath).toLowerCase();
      if (livePhotoAssetId) {
        copiedLivePhotoIds.add(livePhotoAssetId);
      } else if (VIDEO_EXTENSIONS.has(ext)) {
        videoCount += 1;
      } else if (IMAGE_EXTENSIONS.has(ext)) {
        photoCount += 1;
      }

      copiedCount += 1;
      processedCount += 1;
      emitProgress("syncing", {
        totalCount: scannedCount,
        scannedCount,
        processedCount,
        copiedCount,
        skippedCount,
        failedCount,
        photoCount,
        videoCount,
        livePhotoPairCount: copiedLivePhotoIds.size,
        currentPath: relativePath
      });
      if (copiedSamples.length < 20) {
        copiedSamples.push(relativePath);
      }
    } catch (error) {
      failedCount += 1;
      processedCount += 1;
      errors.push({ path: relativePath, error: (error as Error).message });
      emitProgress("syncing", {
        totalCount: scannedCount,
        scannedCount,
        processedCount,
        copiedCount,
        skippedCount,
        failedCount,
        photoCount,
        videoCount,
        livePhotoPairCount: copiedLivePhotoIds.size,
        currentPath: relativePath
      });
    }
  }

  const finishedAt = new Date().toISOString();
  const run: JobRun = {
    id: `run_${randomUUID()}`,
    jobId: job.id,
    trigger,
    status: failedCount === 0 ? "success" : "failed",
    startedAt,
    finishedAt,
    scannedCount,
    skippedCount,
    copiedCount,
    failedCount,
    photoCount,
    videoCount,
    livePhotoPairCount: copiedLivePhotoIds.size,
    copiedSamples,
    errors,
    message: `扫描 ${scannedCount}，同步 ${copiedCount}，跳过 ${skippedCount}，失败 ${failedCount}；照片 ${photoCount}，视频 ${videoCount}，Live Photo ${copiedLivePhotoIds.size}`
  };
  state.jobRuns.unshift(run);
  state.jobRuns = state.jobRuns.slice(0, 200);
  emitProgress("finished", {
    totalCount: scannedCount,
    scannedCount,
    processedCount,
    copiedCount,
    skippedCount,
    failedCount,
    photoCount,
    videoCount,
    livePhotoPairCount: copiedLivePhotoIds.size,
    currentPath: null
  });
  return run;
}

function enqueueRunExecution<T>(task: () => Promise<T>): Promise<T> {
  const next = runExecutionQueue.then(task, task);
  runExecutionQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function normalizeRunTrigger(trigger: string | undefined): JobRunTrigger {
  if (trigger === "manual" || trigger === "watch" || trigger === "schedule") {
    return trigger;
  }
  return "unknown";
}

function normalizeJobRun(run: JobRun): JobRun {
  return {
    ...run,
    trigger: normalizeRunTrigger(run.trigger)
  };
}

function mapTriggerLabel(trigger: JobRunTrigger): string {
  if (trigger === "manual") return "手动执行";
  if (trigger === "watch") return "实时监听";
  if (trigger === "schedule") return "定时任务";
  return "未知";
}

function buildRunTelegramSummary(state: BackupState, run: JobRun): string {
  const job = state.jobs.find((item) => item.id === run.jobId);
  const statusLabel = run.status === "success" ? "成功" : "失败";
  return [
    `PhotoArk 备份${statusLabel}`,
    `任务: ${job?.name ?? run.jobId}`,
    `触发: ${mapTriggerLabel(run.trigger)}`,
    `结果: ${run.copiedCount}/${run.failedCount} (成功/失败)`,
    `摘要: 照片 ${run.photoCount}，视频 ${run.videoCount}，Live Photo ${run.livePhotoPairCount}`,
    `完成时间: ${new Date(run.finishedAt).toLocaleString("zh-CN", { hour12: false })}`
  ].join("\n");
}

async function sendTelegramRunSummaryIfEnabled(state: BackupState, run: JobRun): Promise<void> {
  const settings = normalizeSettings(state.settings);
  if (!settings.telegram.enabled) {
    return;
  }
  if (!settings.telegram.botToken || !settings.telegram.chatId) {
    app.log.warn("Telegram notification skipped: botToken or chatId is empty");
    return;
  }

  const telegram = new TelegramService({
    botToken: settings.telegram.botToken,
    chatId: settings.telegram.chatId,
    proxyUrl: settings.telegram.proxyUrl
  });
  await telegram.send(buildRunTelegramSummary(state, run));
}

async function executeJobAndPersist(jobId: string, trigger: JobRunTrigger): Promise<JobRun> {
  return enqueueRunExecution(async () => {
    const state = await stateRepo.loadState();
    const run = await executeJob(state, jobId, trigger);
    await stateRepo.saveState(state);
    void sendTelegramRunSummaryIfEnabled(state, run).catch((error) => {
      app.log.error({ err: error, runId: run.id, jobId: run.jobId }, "Failed to send Telegram backup summary");
    });
    return run;
  });
}

function startJobExecution(jobId: string, trigger: JobRunTrigger): JobExecution {
  const execution = createJobExecution(jobId, trigger);
  void enqueueRunExecution(async () => {
    updateJobExecution(execution.id, (current) => {
      current.status = "running";
      current.startedAt = new Date().toISOString();
      current.progress.phase = "scanning";
      current.progress.percent = 0;
      current.progress.currentPath = null;
      current.error = null;
      current.message = null;
    });

    try {
      const state = await stateRepo.loadState();
      const run = await executeJob(state, jobId, trigger, (progress) => {
        updateJobExecution(execution.id, (current) => {
          current.progress = {
            ...current.progress,
            ...progress
          };
        });
      });
      await stateRepo.saveState(state);
      updateJobExecution(execution.id, (current) => {
        current.status = run.status;
        current.finishedAt = run.finishedAt;
        current.runId = run.id;
        current.message = run.message ?? null;
        current.error = null;
        current.progress = {
          ...current.progress,
          phase: "finished",
          totalCount: run.scannedCount,
          scannedCount: run.scannedCount,
          processedCount: run.scannedCount,
          copiedCount: run.copiedCount,
          skippedCount: run.skippedCount,
          failedCount: run.failedCount,
          photoCount: run.photoCount,
          videoCount: run.videoCount,
          livePhotoPairCount: run.livePhotoPairCount,
          percent: 100,
          currentPath: null
        };
      });
      void sendTelegramRunSummaryIfEnabled(state, run).catch((error) => {
        app.log.error({ err: error, runId: run.id, jobId: run.jobId }, "Failed to send Telegram backup summary");
      });
    } catch (error) {
      const message = (error as Error).message;
      updateJobExecution(execution.id, (current) => {
        current.status = "failed";
        current.finishedAt = new Date().toISOString();
        current.runId = null;
        current.error = message;
        current.message = message;
        current.progress.phase = "finished";
      });
      app.log.error({ err: error, executionId: execution.id, jobId }, "Job execution failed");
    } finally {
      trimJobExecutions();
    }
  });

  return execution;
}

function resolveWatchSourceRoot(state: BackupState, job: BackupJob): string | null {
  if (!job.enabled || !job.watchMode) {
    return null;
  }

  const sourceStorage = state.storages.find((item) => item.id === job.sourceTargetId);
  const destinationStorage = state.storages.find((item) => item.id === job.destinationTargetId);
  if (!sourceStorage || !destinationStorage) {
    return null;
  }
  if (!isLocalStorage(sourceStorage.type) || !isLocalStorage(destinationStorage.type)) {
    return null;
  }

  try {
    const sourceRoot = resolvePathInStorage(sourceStorage, job.sourcePath);
    const destinationRoot = resolvePathInStorage(destinationStorage, job.destinationPath);
    if (hasOverlappingPaths(sourceRoot, destinationRoot)) {
      return null;
    }
    return sourceRoot;
  } catch {
    return null;
  }
}

function shouldForcePollingByError(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? "").toUpperCase();
  if (code === "EMFILE" || code === "ENOSPC" || code === "EPERM" || code === "EACCES") {
    return true;
  }
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("operation not permitted") ||
    message.includes("system limit for number of file watchers reached") ||
    message.includes("too many open files")
  );
}

function parseWatcherError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function resolveWatchBatchWindowMs() {
  const settleDelayMs = Math.max(1000, env.WATCH_SETTLE_DELAY_MS);
  const maxWaitMs = Math.max(settleDelayMs, env.WATCH_BATCH_MAX_WAIT_MS);
  return { settleDelayMs, maxWaitMs };
}

async function stopJobWatcher(jobId: string) {
  const control = jobWatchers.get(jobId);
  if (!control) {
    return;
  }

  if (control.debounceTimer) {
    clearTimeout(control.debounceTimer);
    control.debounceTimer = null;
  }
  control.pendingPath = null;
  control.pendingReason = null;
  control.pendingSinceMs = null;
  queuedWatchJobs.delete(jobId);
  runningWatchJobs.delete(jobId);
  await control.watcher.close();
  jobWatchers.delete(jobId);
}

async function runWatchedJob(jobId: string, reason: string, changedPath?: string) {
  if (runningWatchJobs.has(jobId)) {
    queuedWatchJobs.add(jobId);
    return;
  }

  runningWatchJobs.add(jobId);
  try {
    const run = await executeJobAndPersist(jobId, "watch");
    app.log.info(
      {
        jobId,
        runId: run.id,
        reason,
        changedPath,
        copiedCount: run.copiedCount,
        failedCount: run.failedCount
      },
      "Watch mode backup run completed"
    );
  } catch (error) {
    app.log.error(
      {
        jobId,
        reason,
        changedPath,
        err: error
      },
      "Watch mode backup run failed"
    );
  } finally {
    runningWatchJobs.delete(jobId);
    if (queuedWatchJobs.delete(jobId)) {
      void runWatchedJob(jobId, "queued");
    }
  }
}

function scheduleWatchedJob(jobId: string, reason: string, changedPath: string) {
  const control = jobWatchers.get(jobId);
  if (!control) {
    return;
  }

  const now = Date.now();
  if (control.pendingSinceMs === null) {
    control.pendingSinceMs = now;
  }
  const { settleDelayMs, maxWaitMs } = resolveWatchBatchWindowMs();
  control.pendingPath = changedPath;
  control.pendingReason = reason;
  if (control.debounceTimer) {
    clearTimeout(control.debounceTimer);
  }
  const elapsedMs = now - control.pendingSinceMs;
  const remainingMaxWaitMs = Math.max(0, maxWaitMs - elapsedMs);
  const delayMs = Math.min(settleDelayMs, remainingMaxWaitMs);
  const flush = () => {
    control.debounceTimer = null;
    const pendingPath = control.pendingPath ?? undefined;
    const pendingReason = control.pendingReason ?? reason;
    control.pendingPath = null;
    control.pendingReason = null;
    control.pendingSinceMs = null;
    void runWatchedJob(jobId, pendingReason, pendingPath);
  };

  if (delayMs <= 0) {
    flush();
    return;
  }

  control.debounceTimer = setTimeout(flush, delayMs);
}

async function createJobWatcher(job: BackupJob, sourceRoot: string, usePolling: boolean): Promise<JobWatcherControl> {
  const watcher = chokidarWatch(sourceRoot, {
    ignoreInitial: true,
    usePolling,
    interval: env.WATCH_POLLING_INTERVAL_MS,
    binaryInterval: Math.max(env.WATCH_POLLING_INTERVAL_MS, 1200),
    awaitWriteFinish: {
      stabilityThreshold: 800,
      pollInterval: 100
    },
    atomic: true
  });

  const onMediaChange = (watchPath: string, reason: string) => {
    if (!isMediaFile(path.basename(watchPath))) {
      return;
    }
    scheduleWatchedJob(job.id, reason, watchPath);
  };

  watcher.on("add", (watchPath) => onMediaChange(watchPath, "add"));
  watcher.on("change", (watchPath) => onMediaChange(watchPath, "change"));
  watcher.on("unlink", (watchPath) => onMediaChange(watchPath, "unlink"));
  watcher.on("addDir", (watchPath) => scheduleWatchedJob(job.id, "add_dir", watchPath));
  watcher.on("unlinkDir", (watchPath) => scheduleWatchedJob(job.id, "unlink_dir", watchPath));
  watcher.on("error", (error) => {
    const control = jobWatchers.get(job.id);
    if (control) {
      control.faulted = true;
      control.lastError = parseWatcherError(error);
    }
    if (!usePolling && shouldForcePollingByError(error)) {
      forcedPollingJobs.add(job.id);
    }
    app.log.error({ jobId: job.id, sourceRoot, usePolling, err: error }, "Watcher error");
    void reloadAndReconcileWatchers().catch((reconcileError) => {
      app.log.error({ jobId: job.id, err: reconcileError }, "Watcher reconcile after error failed");
    });
  });
  watcher.on("ready", () => {
    const control = jobWatchers.get(job.id);
    if (control) {
      control.faulted = false;
      control.lastError = null;
    }
    app.log.info({ jobId: job.id, sourceRoot, usePolling }, "Watcher ready");
  });

  return {
    watcher,
    sourceRoot,
    usePolling,
    faulted: false,
    lastError: null,
    debounceTimer: null,
    pendingPath: null,
    pendingReason: null,
    pendingSinceMs: null
  };
}

async function reconcileJobWatchers(state: BackupState) {
  const expectedWatchers = new Map<string, { sourceRoot: string; usePolling: boolean }>();

  for (const job of state.jobs) {
    const sourceRoot = resolveWatchSourceRoot(state, job);
    if (!sourceRoot) {
      continue;
    }

    const sourceStat = await stat(sourceRoot).catch(() => null);
    if (!sourceStat?.isDirectory()) {
      app.log.warn({ jobId: job.id, sourceRoot }, "Watch mode source path does not exist or is not a directory");
      continue;
    }

    const usePolling = env.WATCH_USE_POLLING || forcedPollingJobs.has(job.id);
    expectedWatchers.set(job.id, { sourceRoot, usePolling });
    const current = jobWatchers.get(job.id);
    if (
      current &&
      current.sourceRoot === sourceRoot &&
      current.usePolling === usePolling &&
      !current.faulted
    ) {
      continue;
    }

    if (current) {
      await stopJobWatcher(job.id);
    }

    const nextWatcher = await createJobWatcher(job, sourceRoot, usePolling);
    jobWatchers.set(job.id, nextWatcher);
  }

  for (const jobId of [...jobWatchers.keys()]) {
    if (!expectedWatchers.has(jobId)) {
      await stopJobWatcher(jobId);
      forcedPollingJobs.delete(jobId);
    }
  }
}

async function reloadAndReconcileWatchers() {
  const state = await stateRepo.loadState();
  await reconcileJobWatchers(state);
}

app.addHook("onRequest", async (req, reply) => {
  const rawUrl = req.raw.url ?? "";
  const pathname = rawUrl.split("?")[0];
  if (!pathname.startsWith("/api/")) {
    return;
  }
  if (publicApiRoutes.has(pathname)) {
    return;
  }

  const state = await stateRepo.loadState();
  const cleaned = pruneExpiredSessions(state);
  if (cleaned) {
    await stateRepo.saveState(state);
  }

  if (!state.users.length) {
    return reply.code(428).send({
      message: "User system is not initialized. Please create the first admin account.",
      code: "AUTH_BOOTSTRAP_REQUIRED"
    });
  }

  let token = extractBearerToken(req.headers.authorization);
  if (!token && req.method === "GET") {
    try {
      const requestUrl = new URL(rawUrl, "http://photoark.local");
      token = requestUrl.searchParams.get("access_token")?.trim() || null;
    } catch {
      token = null;
    }
  }
  if (!token) {
    return reply.code(401).send({ message: "Authentication required", code: "AUTH_REQUIRED" });
  }
  const tokenHash = hashAccessToken(token);
  const session = state.sessions.find((item) => item.tokenHash === tokenHash);
  if (!session) {
    return reply.code(401).send({ message: "Session is invalid or expired", code: "AUTH_INVALID_TOKEN" });
  }

  const user = state.users.find((item) => item.id === session.userId);
  if (!user) {
    return reply.code(401).send({ message: "Session user not found", code: "AUTH_INVALID_USER" });
  }

  req.authUser = user;
  req.authTokenHash = tokenHash;
});

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

app.get("/api/auth/status", async () => {
  const state = await stateRepo.loadState();
  const cleaned = pruneExpiredSessions(state);
  if (cleaned) {
    await stateRepo.saveState(state);
  }
  return {
    enabled: true,
    hasUsers: state.users.length > 0
  };
});

app.post<{ Body: { username: string; password: string } }>("/api/auth/bootstrap", async (req, reply) => {
  const state = await stateRepo.loadState();
  if (state.users.length > 0) {
    return reply.code(409).send({ message: "User system has already been initialized" });
  }

  const body = authBootstrapSchema.parse(req.body);
  const now = new Date().toISOString();
  const { saltHex, hashHex } = passwordService.hashPassword(body.password);
  const user: AuthUser = {
    id: `usr_${randomUUID()}`,
    username: body.username.trim(),
    role: "admin",
    passwordSalt: saltHex,
    passwordHash: hashHex,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  };

  state.users = [user];
  state.sessions = [];
  const { session, token } = issueSession(state, user.id);
  await stateRepo.saveState(state);

  return {
    user: toPublicAuthUser(user),
    token,
    expiresAt: session.expiresAt
  };
});

app.post<{ Body: { username: string; password: string } }>("/api/auth/login", async (req, reply) => {
  const state = await stateRepo.loadState();
  if (!state.users.length) {
    return reply.code(428).send({ message: "No users configured yet, please bootstrap first" });
  }

  const body = authLoginSchema.parse(req.body);
  const normalizedInputUsername = normalizeUsername(body.username);
  const user = state.users.find((item) => normalizeUsername(item.username) === normalizedInputUsername);
  if (!user) {
    return reply.code(401).send({ message: "Invalid username or password" });
  }
  const ok = passwordService.verifyPassword(body.password, user.passwordSalt, user.passwordHash);
  if (!ok) {
    return reply.code(401).send({ message: "Invalid username or password" });
  }

  const now = new Date().toISOString();
  user.lastLoginAt = now;
  user.updatedAt = now;
  pruneExpiredSessions(state);
  const { session, token } = issueSession(state, user.id);
  await stateRepo.saveState(state);

  return {
    user: toPublicAuthUser(user),
    token,
    expiresAt: session.expiresAt
  };
});

app.get("/api/auth/me", async (req, reply) => {
  const authUser = req.authUser;
  if (!authUser) {
    return reply.code(401).send({ message: "Authentication required" });
  }
  return { user: toPublicAuthUser(authUser) };
});

app.post("/api/auth/logout", async (req, reply) => {
  const authTokenHash = req.authTokenHash;
  if (!authTokenHash) {
    return reply.code(401).send({ message: "Authentication required" });
  }
  const state = await stateRepo.loadState();
  const before = state.sessions.length;
  state.sessions = state.sessions.filter((session) => session.tokenHash !== authTokenHash);
  if (state.sessions.length !== before) {
    await stateRepo.saveState(state);
  }
  return { ok: true };
});

app.put<{ Body: { currentPassword: string; newPassword: string } }>("/api/auth/password", async (req, reply) => {
  const authUser = req.authUser;
  if (!authUser) {
    return reply.code(401).send({ message: "Authentication required" });
  }
  const state = await stateRepo.loadState();
  const user = state.users.find((item) => item.id === authUser.id);
  if (!user) {
    return reply.code(404).send({ message: "User not found" });
  }

  const body = authUpdatePasswordSchema.parse(req.body);
  const ok = passwordService.verifyPassword(body.currentPassword, user.passwordSalt, user.passwordHash);
  if (!ok) {
    return reply.code(400).send({ message: "Current password is incorrect" });
  }

  const { saltHex, hashHex } = passwordService.hashPassword(body.newPassword);
  user.passwordSalt = saltHex;
  user.passwordHash = hashHex;
  user.updatedAt = new Date().toISOString();
  state.sessions = state.sessions.filter((session) => session.userId !== user.id);
  await stateRepo.saveState(state);
  return { ok: true };
});

app.get("/api/settings", async () => {
  const state = await stateRepo.loadState();
  return { settings: normalizeSettings(state.settings) };
});

app.put<{ Body: AppSettings }>("/api/settings", async (req) => {
  const state = await stateRepo.loadState();
  const body = settingsSchema.parse(req.body);
  state.settings = normalizeSettings(body);
  await stateRepo.saveState(state);
  return { settings: state.settings };
});

app.post("/api/settings/telegram/test", async (_req, reply) => {
  const state = await stateRepo.loadState();
  const settings = normalizeSettings(state.settings);
  if (!settings.telegram.botToken || !settings.telegram.chatId) {
    return reply.code(400).send({ message: "请先配置 Telegram Bot Token 和 Chat ID" });
  }
  try {
    const telegram = new TelegramService({
      botToken: settings.telegram.botToken,
      chatId: settings.telegram.chatId,
      proxyUrl: settings.telegram.proxyUrl
    });
    await telegram.send(
      `PhotoArk 测试通知\n时间: ${new Date().toLocaleString("zh-CN", { hour12: false })}\n状态: Telegram 配置可用`
    );
    return { ok: true };
  } catch (error) {
    return reply.code(400).send({ message: (error as Error).message });
  }
});

app.get("/api/storages", async () => {
  const state = await stateRepo.loadState();
  return { items: state.storages };
});

app.get("/api/storages/capacity", async () => {
  const state = await stateRepo.loadState();
  const snapshots = await Promise.all(state.storages.map((storage) => buildStorageCapacitySnapshot(storage)));
  const items = mergeStorageCapacitySnapshots(snapshots);
  return { items };
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
    const files = (
      await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const ext = path.extname(entry.name).toLowerCase();
            const kind = IMAGE_EXTENSIONS.has(ext) ? "image" : VIDEO_EXTENSIONS.has(ext) ? "video" : "other";
            if (kind === "other") return null;

            const fullPath = path.join(currentPath, entry.name);
            const fileStat = await stat(fullPath).catch(() => null);
            const modifiedAt = fileStat?.mtime?.toISOString() ?? null;
            const capturedAt =
              fileStat && Number.isFinite(fileStat.birthtimeMs) && fileStat.birthtimeMs > 0
                ? fileStat.birthtime.toISOString()
                : modifiedAt;

            return {
              name: entry.name,
              path: fullPath,
              kind,
              sizeBytes: fileStat?.size ?? null,
              modifiedAt,
              capturedAt,
              latitude: null,
              longitude: null
            };
          })
      )
    )
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => a.name.localeCompare(b.name));

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

    const mimeType = resolveMimeType(targetPath);
    if (!storage.encrypted) {
      return sendLocalFileStreamWithRange(reply, targetPath, fileStat.size, mimeType, req.headers.range);
    }

    try {
      const encryptedBlob = await readFile(targetPath);
      const plain = encryption.decrypt(encryptedBlob);
      return sendBufferWithRange(reply, plain, mimeType, req.headers.range);
    } catch (error) {
      return reply.code(422).send({
        message: `Failed to decrypt media file: ${(error as Error).message}`
      });
    }
  }
);

app.post<{ Body: Omit<StorageTarget, "id"> }>("/api/storages", async (req) => {
  const state = await stateRepo.loadState();
  const body = storageCreateSchema.parse(req.body);
  const item: StorageTarget = { id: `st_${randomUUID()}`, ...body };
  state.storages.push(item);
  await stateRepo.saveState(state);
  await reconcileJobWatchers(state);
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
  await reconcileJobWatchers(state);
  return { ok: true };
});

app.get("/api/jobs", async () => {
  const state = await stateRepo.loadState();
  return { items: state.jobs };
});

app.post<{ Body: Omit<BackupJob, "id"> }>("/api/jobs", async (req, reply) => {
  const state = await stateRepo.loadState();
  const body = jobCreateSchema.parse(req.body);
  const pathSafetyError = validateJobPathSafety(state, body);
  if (pathSafetyError) {
    return reply.code(400).send({ message: pathSafetyError });
  }
  const item: BackupJob = { id: `job_${randomUUID()}`, ...body };
  state.jobs.push(item);
  await stateRepo.saveState(state);
  await reconcileJobWatchers(state);
  return item;
});

app.put<{ Params: { jobId: string }; Body: Omit<BackupJob, "id"> }>("/api/jobs/:jobId", async (req, reply) => {
  const state = await stateRepo.loadState();
  const body = jobCreateSchema.parse(req.body);
  const pathSafetyError = validateJobPathSafety(state, body);
  if (pathSafetyError) {
    return reply.code(400).send({ message: pathSafetyError });
  }
  const idx = state.jobs.findIndex((j) => j.id === req.params.jobId);
  if (idx < 0) {
    return reply.code(404).send({ message: "Job not found" });
  }
  const updated: BackupJob = { id: req.params.jobId, ...body };
  state.jobs[idx] = updated;
  await stateRepo.saveState(state);
  await reconcileJobWatchers(state);
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
    await reconcileJobWatchers(state);
    return { ok: true };
  } catch (error) {
    return reply.code(500).send({ message: (error as Error).message || "Delete job failed" });
  }
});

app.get("/api/runs", async () => {
  const state = await stateRepo.loadState();
  return { items: state.jobRuns.map(normalizeJobRun) };
});

app.get<{ Params: { jobId: string } }>("/api/jobs/:jobId/runs", async (req, reply) => {
  const state = await stateRepo.loadState();
  const hasJob = state.jobs.some((j) => j.id === req.params.jobId);
  if (!hasJob) {
    return reply.code(404).send({ message: "Job not found" });
  }
  return { items: state.jobRuns.filter((run) => run.jobId === req.params.jobId).map(normalizeJobRun) };
});

app.delete<{ Params: { runId: string } }>("/api/runs/:runId", async (req, reply) => {
  const state = await stateRepo.loadState();
  const before = state.jobRuns.length;
  state.jobRuns = state.jobRuns.filter((run) => run.id !== req.params.runId);
  if (state.jobRuns.length === before) {
    return reply.code(404).send({ message: "Run not found" });
  }
  await stateRepo.saveState(state);
  return { ok: true };
});

app.get("/api/job-executions", async () => {
  return { items: listJobExecutions() };
});

app.get<{ Params: { executionId: string } }>("/api/job-executions/:executionId", async (req, reply) => {
  const execution = jobExecutions.get(req.params.executionId);
  if (!execution) {
    return reply.code(404).send({ message: "Execution not found" });
  }
  return { execution: normalizeJobExecution(execution) };
});

app.post<{ Params: { jobId: string } }>("/api/jobs/:jobId/run", async (req, reply) => {
  try {
    const state = await stateRepo.loadState();
    const job = state.jobs.find((item) => item.id === req.params.jobId);
    if (!job) {
      return reply.code(404).send({ message: "Job not found" });
    }
    if (!job.enabled) {
      return reply.code(400).send({ message: "Job is disabled" });
    }
    const execution = startJobExecution(req.params.jobId, "manual");
    return reply.code(202).send({ execution: normalizeJobExecution(execution) });
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
    const state = await stateRepo.loadState();
    const asset = state.assets.find((item) => item.id === req.params.assetId);
    if (!asset) {
      return reply.code(404).send({ message: "Asset not found" });
    }

    const storage = state.storages.find((item) => item.id === asset.storageTargetId);
    if (!storage) {
      return reply.code(404).send({ message: "Storage not found for asset" });
    }
    if (!isLocalStorage(storage.type)) {
      return reply.code(400).send({ message: "Preview stream is only supported for local storage types" });
    }

    let targetPath = "";
    try {
      targetPath = resolvePathInStorage(storage, path.resolve(storage.basePath, asset.name));
    } catch (error) {
      return reply.code(403).send({ message: (error as Error).message });
    }

    const fileStat = await stat(targetPath).catch(() => null);
    if (!fileStat || !fileStat.isFile()) {
      return reply.code(404).send({ message: "Asset file not found" });
    }

    const mimeType = resolveMimeType(asset.name);
    const shouldDecrypt = asset.encrypted || storage.encrypted;
    if (!shouldDecrypt) {
      return sendLocalFileStreamWithRange(reply, targetPath, fileStat.size, mimeType, req.headers.range);
    }

    try {
      const encryptedBlob = await readFile(targetPath);
      const plain = encryption.decrypt(encryptedBlob);
      return sendBufferWithRange(reply, plain, mimeType, req.headers.range);
    } catch (error) {
      return reply.code(422).send({
        message: `Failed to decrypt backup asset: ${(error as Error).message}`
      });
    }
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

app.addHook("onClose", async () => {
  if (watcherReconcileTimer) {
    clearInterval(watcherReconcileTimer);
    watcherReconcileTimer = null;
  }
  for (const jobId of [...jobWatchers.keys()]) {
    await stopJobWatcher(jobId);
  }
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

try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  await reloadAndReconcileWatchers();
  watcherReconcileTimer = setInterval(() => {
    void reloadAndReconcileWatchers().catch((error) => {
      app.log.error({ err: error }, "Periodic watcher reconcile failed");
    });
  }, env.WATCH_RECONCILE_INTERVAL_MS);
  watcherReconcileTimer.unref();
  app.log.info({ watcherCount: jobWatchers.size }, "Watch mode initialized");
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
