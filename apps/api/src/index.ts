import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { copyFile, mkdir, readdir, readFile, stat, statfs, unlink, utimes } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Fastify, { type FastifyReply } from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import exifr from "exifr";
import { watch as chokidarWatch, type FSWatcher } from "chokidar";
import type { BackupJob, StorageTarget } from "@photoark/shared";
import { z } from "zod";
import { env } from "./config/env.js";
import { EncryptionService } from "./modules/crypto/encryption-service.js";
import { LivePhotoService } from "./modules/livephoto/live-photo-service.js";
import { TelegramService } from "./modules/notification/telegram-service.js";
import { PasswordService } from "./modules/auth/password-service.js";
import { FileStateRepository } from "./modules/backup/repository/file-state-repository.js";
import { MediaIndexRepository, type MediaIndexRootEntry, type MediaIndexStore } from "./modules/backup/repository/media-index-repository.js";
import type {
  AppSettings,
  AuthSession,
  AuthUser,
  BackupAsset,
  BackupState,
  JobRun,
  JobRunTrigger
} from "./modules/backup/repository/types.js";

const app = Fastify({ logger: { level: "info" }, disableRequestLogging: true });
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
app.setErrorHandler((error, req, reply) => {
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
  // #region debug-point A:api-error-handler
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "backup-500",
      runId: "post-fix",
      hypothesisId: "A",
      location: "apps/api/src/index.ts:42",
      msg: "[DEBUG] api error handler",
      data: {
        statusCode,
        code: fastifyError.code,
        message,
        method: req.method,
        url: req.url
      }
    })
  }).catch(() => {});
  // #endregion
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
const mediaIndexRepo = new MediaIndexRepository(path.join(path.dirname(path.resolve(env.BACKUP_STATE_FILE)), "media-index.json"));

const previewTokens = new Map<string, { assetId: string; expiresAt: number }>();
const previewTickets = new Map<string, { assetId: string; expiresAt: number }>();
const PREVIEW_TOKEN_TTL_MS = 60_000;
const usernamePattern = /^[A-Za-z0-9._-]{3,32}$/;

declare module "fastify" {
  interface FastifyRequest {
    authUser?: AuthUser;
    authTokenHash?: string;
    appState?: BackupState;
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

const mediaIndexRebuildSchema = z.object({
  storageId: z.string().optional()
});

const jobDiffQuerySchema = z.object({
  status: z.enum(["all", "source_only", "destination_only", "changed", "same"]).optional(),
  kind: z.enum(["all", "image", "video"]).optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  refresh: z.union([z.string(), z.boolean()]).optional(),
  all: z.union([z.string(), z.boolean()]).optional()
});

const jobSyncFileSchema = z.object({
  relativePath: z.string().min(1)
});
const jobDeleteFileSchema = z.object({
  relativePath: z.string().min(1),
  side: z.enum(["source", "destination"])
});
const sourceActivityQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100).optional()
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

const MEDIA_INDEX_MAX_AGE_MS = 30_000;
const MEDIA_INDEX_SAVE_DEBOUNCE_MS = 1_200;
const MEDIA_INDEX_STAT_CONCURRENCY = 32;
const JOB_DIFF_MTIME_TOLERANCE_MS = 1_000;

type IndexedMediaFile = {
  relativePath: string;
  fullPath: string;
  sizeBytes: number;
  mtimeMs: number;
};

let mediaIndexStore: MediaIndexStore = {
  version: 1,
  roots: {}
};
let mediaIndexLoaded = false;
let mediaIndexLoadPromise: Promise<void> | null = null;
let mediaIndexSaveTimer: NodeJS.Timeout | null = null;
let mediaIndexDirty = false;
const mediaIndexRebuildByRoot = new Map<string, Promise<MediaIndexRootEntry>>();

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

type StorageMediaSummaryMetrics = {
  counts: {
    image: number;
    video: number;
    livePhoto: number;
  };
  bytes: {
    image: number;
    video: number;
    livePhoto: number;
  };
};

function createEmptyStorageMediaSummaryMetrics(): StorageMediaSummaryMetrics {
  return {
    counts: {
      image: 0,
      video: 0,
      livePhoto: 0
    },
    bytes: {
      image: 0,
      video: 0,
      livePhoto: 0
    }
  };
}

function buildStorageMediaSummaryFromAssets(storageId: string, assets: BackupState["assets"]): StorageMediaSummaryMetrics {
  const summary = createEmptyStorageMediaSummaryMetrics();
  const livePhotoBytesById = new Map<string, number>();

  for (const asset of assets) {
    if (asset.storageTargetId !== storageId) continue;

    if (asset.kind === "photo") {
      summary.counts.image += 1;
      summary.bytes.image += asset.sizeBytes;
      continue;
    }

    if (asset.kind === "video") {
      summary.counts.video += 1;
      summary.bytes.video += asset.sizeBytes;
      continue;
    }

    const livePhotoAssetId = asset.livePhotoAssetId?.trim();
    if (!livePhotoAssetId) {
      summary.counts.livePhoto += 1;
      summary.bytes.livePhoto += asset.sizeBytes;
      continue;
    }

    livePhotoBytesById.set(livePhotoAssetId, (livePhotoBytesById.get(livePhotoAssetId) ?? 0) + asset.sizeBytes);
  }

  for (const bytes of livePhotoBytesById.values()) {
    summary.counts.livePhoto += 1;
    summary.bytes.livePhoto += bytes;
  }

  return summary;
}

async function buildStorageMediaSummaryFromLocalScan(storage: StorageTarget): Promise<StorageMediaSummaryMetrics> {
  const summary = createEmptyStorageMediaSummaryMetrics();
  const rootPath = resolvePathInStorage(storage, storage.basePath);
  const files = await collectIndexedMediaFiles(rootPath);
  const relativePaths = files.map((row) => row.relativePath);
  const livePhotoMap = buildLivePhotoIdByRelativePath(relativePaths);
  const livePhotoBytesById = new Map<string, number>();

  for (let i = 0; i < files.length; i += 1) {
    const row = files[i];
    const relativePath = row.relativePath;
    const sizeBytes = row.sizeBytes;
    const ext = path.extname(relativePath).toLowerCase();
    const livePhotoAssetId = livePhotoMap.get(relativePath);

    if (livePhotoAssetId) {
      livePhotoBytesById.set(livePhotoAssetId, (livePhotoBytesById.get(livePhotoAssetId) ?? 0) + sizeBytes);
      continue;
    }

    if (VIDEO_EXTENSIONS.has(ext)) {
      summary.counts.video += 1;
      summary.bytes.video += sizeBytes;
    } else if (IMAGE_EXTENSIONS.has(ext)) {
      summary.counts.image += 1;
      summary.bytes.image += sizeBytes;
    }
  }

  for (const bytes of livePhotoBytesById.values()) {
    summary.counts.livePhoto += 1;
    summary.bytes.livePhoto += bytes;
  }

  return summary;
}

async function buildStorageMediaSummary(state: BackupState): Promise<StorageMediaSummaryItem[]> {
  const items = await Promise.all(
    state.storages.map(async (storage) => {
      let metrics: StorageMediaSummaryMetrics;

      if (isLocalStorage(storage.type)) {
        try {
          metrics = await buildStorageMediaSummaryFromLocalScan(storage);
        } catch (error) {
          app.log.warn(
            {
              storageId: storage.id,
              storageName: storage.name,
              err: (error as Error).message
            },
            "Failed to scan storage for media summary, fallback to backup assets"
          );
          metrics = buildStorageMediaSummaryFromAssets(storage.id, state.assets);
        }
      } else {
        metrics = buildStorageMediaSummaryFromAssets(storage.id, state.assets);
      }

      const totalCount = metrics.counts.image + metrics.counts.video + metrics.counts.livePhoto;
      const totalBytes = metrics.bytes.image + metrics.bytes.video + metrics.bytes.livePhoto;

      return {
        storageId: storage.id,
        storageName: storage.name,
        basePath: storage.basePath,
        counts: metrics.counts,
        bytes: metrics.bytes,
        totalCount,
        totalBytes
      };
    })
  );

  return items.sort((a, b) => a.storageName.localeCompare(b.storageName, "zh-CN"));
}

function formatLocalDateKeyFromMs(ms: number): string {
  const date = new Date(ms);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type SourceMediaActivityDay = {
  date: string;
  count: number;
  imageCount: number;
  videoCount: number;
  livePhotoCount: number;
};

type SourceMediaActivityResult = {
  year: number;
  years: number[];
  days: SourceMediaActivityDay[];
  sourceRootCount: number;
  totalAddedCount: number;
  imageAddedCount: number;
  videoAddedCount: number;
  livePhotoAddedCount: number;
  maxDailyCount: number;
  startDate: string;
  endDate: string;
};

const SOURCE_ACTIVITY_CACHE_TTL_MS = 30_000;
const SOURCE_ACTIVITY_CACHE_MAX_ENTRIES = 24;
const sourceActivityCache = new Map<string, { expiresAt: number; data: SourceMediaActivityResult }>();
const RELATION_GRAPH_CACHE_TTL_MS = 60_000;
const RELATION_GRAPH_CACHE_MAX_ENTRIES = 4;
const relationGraphCache = new Map<string, { expiresAt: number; data: { nodes: StorageRelationNodeItem[]; edges: StorageRelationEdgeItem[] } }>();
const SOURCE_ACTIVITY_METADATA_BATCH_SIZE = 24;
const SOURCE_ACTIVITY_MEDIA_DATE_CACHE_MAX_ENTRIES = 60_000;
const sourceActivityMediaDateCache = new Map<string, { mtimeMs: number; mediaDateMs: number | null }>();

function parseMetadataDateMs(value: unknown): number | null {
  if (!value) return null;
  let ms = Number.NaN;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === "number") {
    ms = value;
  } else if (typeof value === "string") {
    ms = Date.parse(value);
  }
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const year = new Date(ms).getFullYear();
  if (year < 1990 || year > 2100) return null;
  return ms;
}

async function readMediaDateFromMetadata(fullPath: string): Promise<number | null> {
  const ext = path.extname(fullPath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext) && !VIDEO_EXTENSIONS.has(ext)) return null;
  try {
    const metadata = (await exifr.parse(fullPath, {
      pick: ["DateTimeOriginal", "CreateDate", "MediaCreateDate", "TrackCreateDate", "ModifyDate"]
    })) as Record<string, unknown> | null;
    if (!metadata) return null;
    const candidates = [
      metadata.DateTimeOriginal,
      metadata.CreateDate,
      metadata.MediaCreateDate,
      metadata.TrackCreateDate,
      metadata.ModifyDate
    ];
    for (const candidate of candidates) {
      const parsed = parseMetadataDateMs(candidate);
      if (parsed !== null) return parsed;
    }
  } catch {
    // Ignore parse failure and fallback to filesystem mtime.
  }
  return null;
}

function pruneSourceActivityMediaDateCache() {
  while (sourceActivityMediaDateCache.size > SOURCE_ACTIVITY_MEDIA_DATE_CACHE_MAX_ENTRIES) {
    const firstKey = sourceActivityMediaDateCache.keys().next().value;
    if (!firstKey) break;
    sourceActivityMediaDateCache.delete(firstKey);
  }
}

async function resolveSourceMediaDateMs(row: IndexedMediaFile): Promise<number> {
  const cacheKey = row.fullPath;
  const cached = sourceActivityMediaDateCache.get(cacheKey);
  if (cached && Math.abs(cached.mtimeMs - row.mtimeMs) < 0.001) {
    return cached.mediaDateMs ?? row.mtimeMs;
  }
  const mediaDateMs = await readMediaDateFromMetadata(row.fullPath);
  sourceActivityMediaDateCache.set(cacheKey, {
    mtimeMs: row.mtimeMs,
    mediaDateMs
  });
  pruneSourceActivityMediaDateCache();
  return mediaDateMs ?? row.mtimeMs;
}

async function buildSourceMediaActivity(state: BackupState, dayCount: number): Promise<SourceMediaActivityResult> {
  const requestedYear = Number.isFinite(dayCount) ? Math.round(dayCount) : NaN;
  const currentYear = new Date().getFullYear();
  const selectedYear = Number.isFinite(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100 ? requestedYear : currentYear;
  const storageById = new Map(state.storages.map((storage) => [storage.id, storage]));
  const sourceRoots = new Set<string>();

  for (const job of state.jobs) {
    const storage = storageById.get(job.sourceTargetId);
    if (!storage || !isLocalStorage(storage.type)) continue;
    try {
      const rootPath = resolvePathInStorage(storage, job.sourcePath);
      sourceRoots.add(rootPath);
    } catch {
      // Ignore invalid source path for this job.
    }
  }

  const sortedSourceRoots = [...sourceRoots].sort((a, b) => a.localeCompare(b, "zh-CN"));
  const cacheKey = `${selectedYear}::${sortedSourceRoots.join("||")}`;
  const nowMs = Date.now();
  const cached = sourceActivityCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    return cached.data;
  }

  const startDate = new Date(selectedYear, 0, 1);
  const endDate = new Date(selectedYear, 11, 31);
  const daysInYear = Math.round((new Date(selectedYear + 1, 0, 1).getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
  const startMs = startDate.getTime();
  const endExclusiveMs = new Date(selectedYear + 1, 0, 1).getTime();
  const counts = new Map<string, { count: number; imageCount: number; videoCount: number; livePhotoCount: number }>();
  for (let i = 0; i < daysInYear; i += 1) {
    const date = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
    counts.set(formatLocalDateKeyFromMs(date.getTime()), { count: 0, imageCount: 0, videoCount: 0, livePhotoCount: 0 });
  }

  const dedupAbsolutePath = new Set<string>();
  const yearsWithData = new Set<number>([selectedYear]);
  let imageAddedCount = 0;
  let videoAddedCount = 0;
  let livePhotoAddedCount = 0;

  for (const rootPath of sourceRoots) {
    let rows: IndexedMediaFile[] = [];
    try {
      rows = await collectIndexedMediaFiles(rootPath);
    } catch (error) {
      app.log.warn({ rootPath, err: (error as Error).message }, "Failed to scan source root for media activity");
      continue;
    }
    const livePhotoIdByRelativePath = buildLivePhotoIdByRelativePath(rows.map((row) => row.relativePath));
    const countedLivePhotoByDate = new Set<string>();

    for (let idx = 0; idx < rows.length; idx += SOURCE_ACTIVITY_METADATA_BATCH_SIZE) {
      const batch = rows.slice(idx, idx + SOURCE_ACTIVITY_METADATA_BATCH_SIZE);
      const datedBatch = await Promise.all(
        batch.map(async (row) => ({
          row,
          mediaDateMs: await resolveSourceMediaDateMs(row)
        }))
      );
      for (const { row, mediaDateMs } of datedBatch) {
        if (dedupAbsolutePath.has(row.fullPath)) continue;
        dedupAbsolutePath.add(row.fullPath);
        if (!Number.isFinite(mediaDateMs)) continue;
        yearsWithData.add(new Date(mediaDateMs).getFullYear());
        if (mediaDateMs < startMs || mediaDateMs >= endExclusiveMs) continue;
        const dayKey = formatLocalDateKeyFromMs(mediaDateMs);
        const dayRow = counts.get(dayKey);
        if (!dayRow) continue;

        dayRow.count += 1;

        const livePhotoAssetId = livePhotoIdByRelativePath.get(row.relativePath);
        if (livePhotoAssetId) {
          const livePhotoDayKey = `${dayKey}::${livePhotoAssetId}`;
          if (!countedLivePhotoByDate.has(livePhotoDayKey)) {
            countedLivePhotoByDate.add(livePhotoDayKey);
            dayRow.livePhotoCount += 1;
            livePhotoAddedCount += 1;
          }
        } else {
          const ext = path.extname(row.relativePath).toLowerCase();
          if (VIDEO_EXTENSIONS.has(ext)) {
            dayRow.videoCount += 1;
            videoAddedCount += 1;
          } else {
            dayRow.imageCount += 1;
            imageAddedCount += 1;
          }
        }
      }
    }
  }

  const days = [...counts.entries()].map(([date, value]) => ({
    date,
    count: value.count,
    imageCount: value.imageCount,
    videoCount: value.videoCount,
    livePhotoCount: value.livePhotoCount
  }));
  const totalAddedCount = days.reduce((sum, item) => sum + item.count, 0);
  const maxDailyCount = days.reduce((max, item) => (item.count > max ? item.count : max), 0);
  const years = [...yearsWithData].filter((year) => year >= 2000 && year <= 2100).sort((a, b) => b - a);

  const result: SourceMediaActivityResult = {
    year: selectedYear,
    years,
    days,
    sourceRootCount: sourceRoots.size,
    totalAddedCount,
    imageAddedCount,
    videoAddedCount,
    livePhotoAddedCount,
    maxDailyCount,
    startDate: formatLocalDateKeyFromMs(startMs),
    endDate: formatLocalDateKeyFromMs(endDate.getTime())
  };

  sourceActivityCache.set(cacheKey, {
    expiresAt: nowMs + SOURCE_ACTIVITY_CACHE_TTL_MS,
    data: result
  });
  while (sourceActivityCache.size > SOURCE_ACTIVITY_CACHE_MAX_ENTRIES) {
    const firstKey = sourceActivityCache.keys().next().value;
    if (!firstKey) break;
    sourceActivityCache.delete(firstKey);
  }

  return result;
}

type JobRelationCheckStatus = "synced" | "lagging" | "unknown";

type MediaPathSnapshotResult =
  | {
      ok: true;
      relativePaths: Set<string>;
    }
  | {
      ok: false;
      error: string;
    };

function buildRelationGraphCacheKey(state: BackupState): string {
  const storageKey = [...state.storages]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((storage) => `${storage.id}:${storage.basePath}:${storage.type}`)
    .join("|");
  const jobsKey = [...state.jobs]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((job) =>
      [
        job.id,
        job.enabled ? "1" : "0",
        job.sourceTargetId,
        job.destinationTargetId,
        job.sourcePath,
        job.destinationPath
      ].join(":"))
    .join("|");
  return `${storageKey}::${jobsKey}`;
}

async function buildStorageRelationGraph(state: BackupState): Promise<{ nodes: StorageRelationNodeItem[]; edges: StorageRelationEdgeItem[] }> {
  const cacheKey = buildRelationGraphCacheKey(state);
  const nowMs = Date.now();
  const cached = relationGraphCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs) {
    return cached.data;
  }
  const nodes = state.storages
    .map((storage) => ({
      storageId: storage.id,
      storageName: storage.name,
      basePath: storage.basePath,
      type: storage.type
    }))
    .sort((a, b) => a.storageName.localeCompare(b.storageName, "zh-CN"));

  const storageById = new Map(state.storages.map((storage) => [storage.id, storage]));
  const snapshotCache = new Map<string, Promise<MediaPathSnapshotResult>>();

  const getMediaPathSnapshot = async (storage: StorageTarget, scanPath: string): Promise<MediaPathSnapshotResult> => {
    const cacheKey = `${storage.id}:${scanPath}`;
    const cached = snapshotCache.get(cacheKey);
    if (cached) return cached;

    const promise = (async (): Promise<MediaPathSnapshotResult> => {
      try {
        const files = await collectMediaFilesPreferIndex(scanPath);
        const relativePaths = new Set(files.map((filePath) => toPosixPath(path.relative(scanPath, filePath))));
        return { ok: true, relativePaths };
      } catch (error) {
        return { ok: false, error: (error as Error).message };
      }
    })();

    snapshotCache.set(cacheKey, promise);
    return promise;
  };

  const jobChecks = await Promise.all(
    state.jobs.map(async (job) => {
      const sourceStorage = storageById.get(job.sourceTargetId);
      const destinationStorage = storageById.get(job.destinationTargetId);
      if (!sourceStorage || !destinationStorage) {
        return null;
      }

      let status: JobRelationCheckStatus = "unknown";

      if (isLocalStorage(sourceStorage.type) && isLocalStorage(destinationStorage.type)) {
        try {
          const sourceRoot = resolvePathInStorage(sourceStorage, job.sourcePath);
          const destinationRoot = resolvePathInStorage(destinationStorage, job.destinationPath);
          const [sourceSnapshot, destinationSnapshot] = await Promise.all([
            getMediaPathSnapshot(sourceStorage, sourceRoot),
            getMediaPathSnapshot(destinationStorage, destinationRoot)
          ]);

          if (sourceSnapshot.ok && destinationSnapshot.ok) {
            let missingInDestination = 0;
            for (const relativePath of sourceSnapshot.relativePaths) {
              if (!destinationSnapshot.relativePaths.has(relativePath)) {
                missingInDestination += 1;
              }
            }
            status = missingInDestination === 0 ? "synced" : "lagging";
          }
        } catch {
          status = "unknown";
        }
      }

      return {
        jobId: job.id,
        enabled: job.enabled,
        sourceStorageId: sourceStorage.id,
        sourceStorageName: sourceStorage.name,
        destinationStorageId: destinationStorage.id,
        destinationStorageName: destinationStorage.name,
        status
      };
    })
  );

  const edgeMap = new Map<
    string,
    Omit<StorageRelationEdgeItem, "status" | "summary"> & { status: StorageRelationEdgeStatus; summary: string }
  >();

  for (const row of jobChecks) {
    if (!row) continue;
    const edgeId = `${row.sourceStorageId}->${row.destinationStorageId}`;
    const existing = edgeMap.get(edgeId);
    if (!existing) {
      edgeMap.set(edgeId, {
        id: edgeId,
        sourceStorageId: row.sourceStorageId,
        sourceStorageName: row.sourceStorageName,
        destinationStorageId: row.destinationStorageId,
        destinationStorageName: row.destinationStorageName,
        status: "synced",
        jobCount: 0,
        syncedJobCount: 0,
        laggingJobCount: 0,
        unknownJobCount: 0,
        jobIds: [],
        pendingJobIds: [],
        enabledJobIds: [],
        summary: ""
      });
    }

    const edge = edgeMap.get(edgeId);
    if (!edge) continue;
    edge.jobCount += 1;
    edge.jobIds.push(row.jobId);
    if (row.enabled) {
      edge.enabledJobIds.push(row.jobId);
    }
    if (row.status === "synced") {
      edge.syncedJobCount += 1;
    } else if (row.status === "lagging") {
      edge.laggingJobCount += 1;
      edge.pendingJobIds.push(row.jobId);
    } else {
      edge.unknownJobCount += 1;
      edge.pendingJobIds.push(row.jobId);
    }
  }

  const edges = [...edgeMap.values()]
    .map((item) => {
      const status: StorageRelationEdgeStatus = item.laggingJobCount > 0 || item.unknownJobCount > 0 ? "attention" : "synced";
      const summary =
        status === "synced"
          ? `${item.syncedJobCount}/${item.jobCount} 个任务已同步`
          : [
              item.laggingJobCount > 0 ? `待同步 ${item.laggingJobCount}` : "",
              item.unknownJobCount > 0 ? `无法校验 ${item.unknownJobCount}` : ""
            ]
              .filter(Boolean)
              .join("，");

      return {
        ...item,
        jobIds: [...item.jobIds],
        pendingJobIds: [...item.pendingJobIds],
        enabledJobIds: [...item.enabledJobIds],
        status,
        summary
      };
    })
    .sort((a, b) => {
      const sourceCompare = a.sourceStorageName.localeCompare(b.sourceStorageName, "zh-CN");
      if (sourceCompare !== 0) return sourceCompare;
      return a.destinationStorageName.localeCompare(b.destinationStorageName, "zh-CN");
    });

  const result = { nodes, edges };
  relationGraphCache.set(cacheKey, { expiresAt: nowMs + RELATION_GRAPH_CACHE_TTL_MS, data: result });
  while (relationGraphCache.size > RELATION_GRAPH_CACHE_MAX_ENTRIES) {
    const firstKey = relationGraphCache.keys().next().value;
    if (!firstKey) break;
    relationGraphCache.delete(firstKey);
  }
  return result;
}

function buildEmptyJobDiffSummary(): JobDiffSummary {
  return {
    totalComparedCount: 0,
    totalDiffCount: 0,
    sameCount: 0,
    sourceOnlyCount: 0,
    destinationOnlyCount: 0,
    changedCount: 0,
    imageCount: 0,
    videoCount: 0,
    sourceOnlyBytes: 0,
    destinationOnlyBytes: 0,
    changedSourceBytes: 0,
    changedDestinationBytes: 0
  };
}

function parseBooleanQueryValue(value: string | boolean | undefined): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function detectJobDiffKind(relativePath: string): JobDiffKind {
  const ext = path.extname(relativePath).toLowerCase();
  return VIDEO_EXTENSIONS.has(ext) ? "video" : "image";
}

function toIsoDateFromMs(value: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(value).toISOString();
}

function toJobDiffFile(rootPath: string, row: IndexedMediaFile): JobDiffFile {
  return {
    absolutePath: toSystemPathFromPosixRelative(rootPath, row.relativePath),
    sizeBytes: row.sizeBytes,
    modifiedAt: toIsoDateFromMs(row.mtimeMs)
  };
}

async function buildJobDiff(
  state: BackupState,
  jobId: string,
  options: {
    statusFilter: "all" | JobDiffStatus;
    kindFilter: "all" | JobDiffKind;
    keyword: string;
    page: number;
    pageSize: number;
    forceRefresh: boolean;
    includeAll: boolean;
  }
): Promise<JobDiffResponse> {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  const sourceStorage = state.storages.find((item) => item.id === job.sourceTargetId);
  const destinationStorage = state.storages.find((item) => item.id === job.destinationTargetId);
  if (!sourceStorage || !destinationStorage) {
    throw new Error("Storage target for this job is missing");
  }
  if (!isLocalStorage(sourceStorage.type) || !isLocalStorage(destinationStorage.type)) {
    throw new Error("Diff only supports local-to-local jobs in current version");
  }

  const sourceRoot = resolvePathInStorage(sourceStorage, job.sourcePath);
  const destinationRoot = resolvePathInStorage(destinationStorage, job.destinationPath);

  const [sourceRows, destinationRows] = await Promise.all([
    collectIndexedMediaFiles(sourceRoot, options.forceRefresh),
    collectIndexedMediaFiles(destinationRoot, options.forceRefresh)
  ]);
  const assetSizeByStorageAndPath = new Map<string, number>();
  for (const asset of state.assets) {
    assetSizeByStorageAndPath.set(`${asset.storageTargetId}::${asset.name}`, asset.sizeBytes);
  }
  const resolveComparableSize = (storage: StorageTarget, relativePath: string, physicalSize: number): number => {
    if (!storage.encrypted) return physicalSize;
    const logicalSize = assetSizeByStorageAndPath.get(`${storage.id}::${relativePath}`);
    return typeof logicalSize === "number" && Number.isFinite(logicalSize) && logicalSize >= 0 ? logicalSize : physicalSize;
  };

  const summary = buildEmptyJobDiffSummary();
  const normalizedKeyword = options.keyword.trim().toLowerCase();
  const statusBuckets: Record<JobDiffStatus, JobDiffItem[]> = {
    source_only: [],
    changed: [],
    destination_only: [],
    same: []
  };

  const matchFilters = (item: { status: JobDiffStatus; kind: JobDiffKind; relativePath: string }) => {
    if (options.statusFilter !== "all" && item.status !== options.statusFilter) return false;
    if (options.kindFilter !== "all" && item.kind !== options.kindFilter) return false;
    if (normalizedKeyword && !item.relativePath.toLowerCase().includes(normalizedKeyword)) return false;
    return true;
  };

  let sourceIndex = 0;
  let destinationIndex = 0;
  let comparedCount = 0;

  while (sourceIndex < sourceRows.length || destinationIndex < destinationRows.length) {
    const sourceCandidate = sourceRows[sourceIndex];
    const destinationCandidate = destinationRows[destinationIndex];

    let sourceRow: IndexedMediaFile | undefined;
    let destinationRow: IndexedMediaFile | undefined;
    let relativePath = "";

    if (sourceCandidate && destinationCandidate) {
      const pathCompare = sourceCandidate.relativePath.localeCompare(destinationCandidate.relativePath, "zh-CN");
      if (pathCompare === 0) {
        sourceRow = sourceCandidate;
        destinationRow = destinationCandidate;
        relativePath = sourceCandidate.relativePath;
        sourceIndex += 1;
        destinationIndex += 1;
      } else if (pathCompare < 0) {
        sourceRow = sourceCandidate;
        relativePath = sourceCandidate.relativePath;
        sourceIndex += 1;
      } else {
        destinationRow = destinationCandidate;
        relativePath = destinationCandidate.relativePath;
        destinationIndex += 1;
      }
    } else if (sourceCandidate) {
      sourceRow = sourceCandidate;
      relativePath = sourceCandidate.relativePath;
      sourceIndex += 1;
    } else if (destinationCandidate) {
      destinationRow = destinationCandidate;
      relativePath = destinationCandidate.relativePath;
      destinationIndex += 1;
    } else {
      break;
    }

    let status: JobDiffStatus | null = null;
    let sizeDeltaBytes: number | null = null;
    let mtimeDeltaMs: number | null = null;
    let changeReason: JobDiffChangeReason = null;

    if (sourceRow && !destinationRow) {
      status = "source_only";
      summary.sourceOnlyCount += 1;
      summary.sourceOnlyBytes += sourceRow.sizeBytes;
    } else if (!sourceRow && destinationRow) {
      status = "destination_only";
      summary.destinationOnlyCount += 1;
      summary.destinationOnlyBytes += destinationRow.sizeBytes;
    } else if (sourceRow && destinationRow) {
      const sourceSize = resolveComparableSize(sourceStorage, relativePath, sourceRow.sizeBytes);
      const destinationSize = resolveComparableSize(destinationStorage, relativePath, destinationRow.sizeBytes);
      const sizeChanged = sourceSize !== destinationSize;
      const rawMtimeDelta = sourceRow.mtimeMs - destinationRow.mtimeMs;
      const mtimeChanged = Math.abs(rawMtimeDelta) > JOB_DIFF_MTIME_TOLERANCE_MS;

      if (sizeChanged || mtimeChanged) {
        status = "changed";
        sizeDeltaBytes = sourceSize - destinationSize;
        mtimeDeltaMs = Math.round(rawMtimeDelta);
        changeReason = sizeChanged && mtimeChanged ? "size_mtime" : sizeChanged ? "size" : "mtime";
        summary.changedCount += 1;
        summary.changedSourceBytes += sourceSize;
        summary.changedDestinationBytes += destinationSize;
      } else {
        status = "same";
        summary.sameCount += 1;
      }
    }

    if (!status) continue;
    comparedCount += 1;

    const kind = detectJobDiffKind(relativePath);
    if (kind === "video") {
      summary.videoCount += 1;
    } else {
      summary.imageCount += 1;
    }

    if (!matchFilters({ status, kind, relativePath })) {
      continue;
    }

    statusBuckets[status].push({
      id: `${status}:${relativePath}`,
      relativePath,
      kind,
      status,
      source: sourceRow ? toJobDiffFile(sourceRoot, sourceRow) : null,
      destination: destinationRow ? toJobDiffFile(destinationRoot, destinationRow) : null,
      sizeDeltaBytes,
      mtimeDeltaMs,
      changeReason
    });
  }

  summary.totalComparedCount = comparedCount;
  summary.totalDiffCount = summary.sourceOnlyCount + summary.destinationOnlyCount + summary.changedCount;
  const filteredItems = statusBuckets.source_only
    .concat(statusBuckets.changed)
    .concat(statusBuckets.destination_only)
    .concat(statusBuckets.same);

  const total = filteredItems.length;
  let pageSize = Math.max(1, Math.min(200, Math.round(options.pageSize)));
  let totalPages = Math.max(1, Math.ceil(total / pageSize));
  let page = total === 0 ? 1 : Math.min(Math.max(1, Math.round(options.page)), totalPages);
  let items = filteredItems.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);

  if (options.includeAll) {
    page = 1;
    totalPages = 1;
    pageSize = Math.max(1, total);
    items = filteredItems;
  }

  return {
    generatedAt: new Date().toISOString(),
    job: {
      id: job.id,
      name: job.name,
      sourceStorageId: sourceStorage.id,
      sourceStorageName: sourceStorage.name,
      sourcePath: sourceRoot,
      destinationStorageId: destinationStorage.id,
      destinationStorageName: destinationStorage.name,
      destinationPath: destinationRoot
    },
    scan: {
      sourceFileCount: sourceRows.length,
      destinationFileCount: destinationRows.length
    },
    summary,
    page,
    pageSize,
    total,
    totalPages,
    items
  };
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
const jobExecutionControls = new Map<string, { cancelRequested: boolean; requestedAt: string | null }>();
const JOB_EXECUTION_HISTORY_LIMIT = 200;

type JobExecutionStatus = "queued" | "running" | "success" | "failed" | "canceled";
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

type StorageMediaSummaryItem = {
  storageId: string;
  storageName: string;
  basePath: string;
  counts: {
    image: number;
    video: number;
    livePhoto: number;
  };
  bytes: {
    image: number;
    video: number;
    livePhoto: number;
  };
  totalCount: number;
  totalBytes: number;
};

type StorageRelationNodeItem = {
  storageId: string;
  storageName: string;
  basePath: string;
  type: StorageTarget["type"];
};

type StorageRelationEdgeStatus = "synced" | "attention";

type StorageRelationEdgeItem = {
  id: string;
  sourceStorageId: string;
  sourceStorageName: string;
  destinationStorageId: string;
  destinationStorageName: string;
  status: StorageRelationEdgeStatus;
  jobCount: number;
  syncedJobCount: number;
  laggingJobCount: number;
  unknownJobCount: number;
  jobIds: string[];
  pendingJobIds: string[];
  enabledJobIds: string[];
  summary: string;
};

type JobDiffStatus = "source_only" | "destination_only" | "changed" | "same";
type JobDiffKind = "image" | "video";
type JobDiffChangeReason = "size" | "mtime" | "size_mtime" | null;

type JobDiffFile = {
  absolutePath: string;
  sizeBytes: number;
  modifiedAt: string | null;
};

type JobDiffItem = {
  id: string;
  relativePath: string;
  kind: JobDiffKind;
  status: JobDiffStatus;
  source: JobDiffFile | null;
  destination: JobDiffFile | null;
  sizeDeltaBytes: number | null;
  mtimeDeltaMs: number | null;
  changeReason: JobDiffChangeReason;
};

type JobDiffSummary = {
  totalComparedCount: number;
  totalDiffCount: number;
  sameCount: number;
  sourceOnlyCount: number;
  destinationOnlyCount: number;
  changedCount: number;
  imageCount: number;
  videoCount: number;
  sourceOnlyBytes: number;
  destinationOnlyBytes: number;
  changedSourceBytes: number;
  changedDestinationBytes: number;
};

type JobDiffResponse = {
  generatedAt: string;
  job: {
    id: string;
    name: string;
    sourceStorageId: string;
    sourceStorageName: string;
    sourcePath: string;
    destinationStorageId: string;
    destinationStorageName: string;
    destinationPath: string;
  };
  scan: {
    sourceFileCount: number;
    destinationFileCount: number;
  };
  summary: JobDiffSummary;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  items: JobDiffItem[];
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

function normalizeMediaIndexRootPath(dirPath: string): string {
  return path.resolve(dirPath);
}

function toSystemPathFromPosixRelative(rootPath: string, relativePath: string): string {
  const normalizedRelative = relativePath.split(path.posix.sep).join(path.sep);
  return path.resolve(rootPath, normalizedRelative);
}

function normalizePosixRelativePath(input: string): string {
  const normalized = path.posix.normalize(input.replace(/\\/g, "/").trim()).replace(/^(\.\/)+/, "");
  const invalid = !normalized || normalized === "." || normalized.startsWith("../") || path.posix.isAbsolute(normalized);
  if (invalid) {
    throw new Error("Invalid relative path");
  }
  return normalized;
}

async function detectLivePhotoAssetIdForRelativePath(sourceRoot: string, relativePath: string): Promise<string | undefined> {
  const ext = path.extname(relativePath).toLowerCase();
  const basePath = relativePath.slice(0, relativePath.length - ext.length);
  const imageExts = [".jpg", ".jpeg", ".heic"];
  const videoExts = [".mov"];

  if (imageExts.includes(ext)) {
    for (const candidateExt of videoExts) {
      const candidate = `${basePath}${candidateExt}`;
      const candidatePath = toSystemPathFromPosixRelative(sourceRoot, candidate);
      const exists = await stat(candidatePath).then((row) => row.isFile()).catch(() => false);
      if (exists) return `lp_${basePath.toLowerCase()}`;
    }
    return undefined;
  }

  if (videoExts.includes(ext)) {
    for (const candidateExt of imageExts) {
      const candidate = `${basePath}${candidateExt}`;
      const candidatePath = toSystemPathFromPosixRelative(sourceRoot, candidate);
      const exists = await stat(candidatePath).then((row) => row.isFile()).catch(() => false);
      if (exists) return `lp_${basePath.toLowerCase()}`;
    }
  }

  return undefined;
}

async function ensureMediaIndexLoaded() {
  if (mediaIndexLoaded) return;
  if (!mediaIndexLoadPromise) {
    mediaIndexLoadPromise = (async () => {
      mediaIndexStore = await mediaIndexRepo.load();
      mediaIndexLoaded = true;
    })().finally(() => {
      mediaIndexLoadPromise = null;
    });
  }
  await mediaIndexLoadPromise;
}

function markMediaIndexDirty() {
  mediaIndexDirty = true;
  if (mediaIndexSaveTimer) return;
  mediaIndexSaveTimer = setTimeout(() => {
    mediaIndexSaveTimer = null;
    void persistMediaIndexStore();
  }, MEDIA_INDEX_SAVE_DEBOUNCE_MS);
  mediaIndexSaveTimer.unref();
}

async function persistMediaIndexStore() {
  if (!mediaIndexDirty) return;
  mediaIndexDirty = false;
  try {
    await mediaIndexRepo.save(mediaIndexStore);
  } catch (error) {
    mediaIndexDirty = true;
    app.log.warn({ err: (error as Error).message }, "Failed to persist media index cache");
  }
}

function getFreshMediaIndexEntry(rootPath: string, maxAgeMs = MEDIA_INDEX_MAX_AGE_MS): MediaIndexRootEntry | null {
  const root = mediaIndexStore.roots[rootPath];
  if (!root) return null;
  const generatedAtMs = Date.parse(root.generatedAt);
  if (!Number.isFinite(generatedAtMs)) return null;
  if (Date.now() - generatedAtMs > Math.max(1000, maxAgeMs)) return null;
  return root;
}

function buildMediaIndexEntry(rows: IndexedMediaFile[]): MediaIndexRootEntry {
  const files: MediaIndexRootEntry["files"] = {};
  for (const row of rows) {
    files[row.relativePath] = {
      sizeBytes: row.sizeBytes,
      mtimeMs: row.mtimeMs
    };
  }
  return {
    generatedAt: new Date().toISOString(),
    files
  };
}

function rowsFromMediaIndexEntry(rootPath: string, entry: MediaIndexRootEntry): IndexedMediaFile[] {
  const rows = Object.entries(entry.files).map(([relativePath, value]) => ({
    relativePath,
    fullPath: toSystemPathFromPosixRelative(rootPath, relativePath),
    sizeBytes: value.sizeBytes,
    mtimeMs: value.mtimeMs
  }));
  rows.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return rows;
}

async function scanMediaFilesWithStats(dirPath: string): Promise<IndexedMediaFile[]> {
  const rootPath = normalizeMediaIndexRootPath(dirPath);
  const out: IndexedMediaFile[] = [];
  const dirQueue: string[] = [rootPath];

  while (dirQueue.length > 0) {
    const currentPath = dirQueue.pop();
    if (!currentPath) continue;
    const entries = await readdir(currentPath, { withFileTypes: true });
    const mediaFilesInDir: string[] = [];

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        dirQueue.push(fullPath);
      } else if (entry.isFile() && isMediaFile(entry.name)) {
        mediaFilesInDir.push(fullPath);
      }
    }

    for (let idx = 0; idx < mediaFilesInDir.length; idx += MEDIA_INDEX_STAT_CONCURRENCY) {
      const batch = mediaFilesInDir.slice(idx, idx + MEDIA_INDEX_STAT_CONCURRENCY);
      const rows = await Promise.all(
        batch.map(async (fullPath) => {
          const fileStat = await stat(fullPath).catch(() => null);
          return {
            relativePath: toPosixPath(path.relative(rootPath, fullPath)),
            fullPath,
            sizeBytes: fileStat?.size ?? 0,
            mtimeMs: fileStat?.mtimeMs ?? 0
          };
        })
      );
      out.push(...rows);
    }
  }

  out.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return out;
}

async function collectIndexedMediaFiles(dirPath: string, forceRefresh = false): Promise<IndexedMediaFile[]> {
  const rootPath = normalizeMediaIndexRootPath(dirPath);
  await ensureMediaIndexLoaded();
  const cached = forceRefresh ? null : getFreshMediaIndexEntry(rootPath);
  if (cached) {
    return rowsFromMediaIndexEntry(rootPath, cached);
  }

  const pending = mediaIndexRebuildByRoot.get(rootPath);
  if (pending) {
    return rowsFromMediaIndexEntry(rootPath, await pending);
  }

  const refreshStartedMs = Date.now();
  const refreshPromise = (async () => {
    try {
      const rows = await scanMediaFilesWithStats(rootPath);
      const entry = buildMediaIndexEntry(rows);
      mediaIndexStore.roots[rootPath] = entry;
      markMediaIndexDirty();
      app.log.info(
        {
          event: "media.index.rebuild",
          rootPath,
          fileCount: rows.length,
          tookMs: Date.now() - refreshStartedMs
        },
        "Media index rebuilt"
      );
      return entry;
    } catch (error) {
      app.log.warn(
        {
          event: "media.index.rebuild.error",
          rootPath,
          tookMs: Date.now() - refreshStartedMs,
          message: (error as Error).message
        },
        "Failed to rebuild media index"
      );
      throw error;
    }
  })().finally(() => {
    mediaIndexRebuildByRoot.delete(rootPath);
  });

  mediaIndexRebuildByRoot.set(rootPath, refreshPromise);
  return rowsFromMediaIndexEntry(rootPath, await refreshPromise);
}

async function collectMediaFilesPreferIndex(dirPath: string): Promise<string[]> {
  const rootPath = normalizeMediaIndexRootPath(dirPath);
  await ensureMediaIndexLoaded();
  const cached = getFreshMediaIndexEntry(rootPath);
  if (cached) {
    return rowsFromMediaIndexEntry(rootPath, cached).map((row) => row.fullPath);
  }
  return collectMediaFiles(rootPath);
}

async function invalidateMediaIndexPath(dirPath: string) {
  const rootPath = normalizeMediaIndexRootPath(dirPath);
  await ensureMediaIndexLoaded();
  if (!mediaIndexStore.roots[rootPath]) return;
  delete mediaIndexStore.roots[rootPath];
  markMediaIndexDirty();
}

async function listMediaIndexStatusItems(): Promise<
  Array<{
    rootPath: string;
    fileCount: number;
    generatedAt: string;
    ageMs: number;
    fresh: boolean;
  }>
> {
  await ensureMediaIndexLoaded();
  return Object.entries(mediaIndexStore.roots)
    .map(([rootPath, entry]) => {
      const generatedAtMs = Date.parse(entry.generatedAt);
      const ageMs = Number.isFinite(generatedAtMs) ? Math.max(0, Date.now() - generatedAtMs) : Number.POSITIVE_INFINITY;
      return {
        rootPath,
        fileCount: Object.keys(entry.files).length,
        generatedAt: entry.generatedAt,
        ageMs,
        fresh: ageMs <= MEDIA_INDEX_MAX_AGE_MS
      };
    })
    .sort((a, b) => a.rootPath.localeCompare(b.rootPath));
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
type ExecuteJobOptions = {
  shouldCancel?: () => boolean;
};

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
    .filter((item) => item.status === "success" || item.status === "failed" || item.status === "canceled")
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, JOB_EXECUTION_HISTORY_LIMIT)
    .map((item) => item.id);
  const keepIds = new Set([...activeIds, ...finishedIds]);
  for (const id of jobExecutions.keys()) {
    if (!keepIds.has(id)) {
      jobExecutions.delete(id);
      jobExecutionControls.delete(id);
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
  jobExecutionControls.set(execution.id, { cancelRequested: false, requestedAt: null });
  trimJobExecutions();
  return execution;
}

function requestCancelExecution(executionId: string): JobExecution | null {
  const current = jobExecutions.get(executionId);
  if (!current) return null;
  if (current.status !== "queued" && current.status !== "running") return current;
  const control = jobExecutionControls.get(executionId);
  if (control) {
    control.cancelRequested = true;
    control.requestedAt = new Date().toISOString();
  } else {
    jobExecutionControls.set(executionId, { cancelRequested: true, requestedAt: new Date().toISOString() });
  }
  if (current.status === "queued") {
    updateJobExecution(executionId, (execution) => {
      execution.status = "canceled";
      execution.finishedAt = new Date().toISOString();
      execution.message = "任务已取消";
      execution.error = null;
      execution.progress.phase = "finished";
      execution.progress.percent = 100;
      execution.progress.currentPath = null;
    });
  }
  return jobExecutions.get(executionId) ?? null;
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
  onProgress?: ExecuteJobProgressHandler,
  options?: ExecuteJobOptions
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
  const scanStartedMs = Date.now();
  let canceled = false;
  const shouldCancel = options?.shouldCancel;
  const checkCancel = () => {
    if (shouldCancel && shouldCancel()) {
      canceled = true;
      return true;
    }
    return false;
  };
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

  app.log.info({ event: "job.exec.scan.start", jobId, trigger }, "Job scan started");
  // #region debug-point E:scan-start-mem
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "backup-500",
      runId: "pre-fix",
      hypothesisId: "E",
      location: "apps/api/src/index.ts:2122",
      msg: "[DEBUG] scan start memory",
      data: { jobId, trigger, memory: process.memoryUsage() }
    })
  }).catch(() => {});
  // #endregion

  const sourceFiles = await collectMediaFiles(sourceRoot);
  const relativePaths = sourceFiles.map((fullPath) => toPosixPath(path.relative(sourceRoot, fullPath)));
  const livePhotoMap = buildLivePhotoIdByRelativePath(relativePaths);
  const scanTookMs = Date.now() - scanStartedMs;
  app.log.info(
    { event: "job.exec.scan.done", jobId, trigger, scannedCount: sourceFiles.length, scanTookMs },
    "Job scan finished"
  );
  // #region debug-point E:scan-done-mem
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "backup-500",
      runId: "pre-fix",
      hypothesisId: "E",
      location: "apps/api/src/index.ts:2148",
      msg: "[DEBUG] scan done memory",
      data: { jobId, trigger, scannedCount: sourceFiles.length, scanTookMs, memory: process.memoryUsage() }
    })
  }).catch(() => {});
  // #endregion

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

  if (checkCancel()) {
    app.log.warn({ event: "job.exec.cancel.requested", jobId, trigger }, "Cancel requested before sync loop");
  }

  app.log.info(
    { event: "job.exec.sync.start", jobId, trigger, scannedCount },
    "Job sync started"
  );

  let lastHeartbeatAt = Date.now();
  let lastHeartbeatProcessed = 0;

  if (!canceled) {
    for (let i = 0; i < sourceFiles.length; i += 1) {
      if (checkCancel()) {
        break;
      }
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
      const now = Date.now();
      if (now - lastHeartbeatAt >= 5000 || processedCount - lastHeartbeatProcessed >= 500) {
        app.log.info(
          {
            event: "job.exec.progress",
            jobId,
            trigger,
            processedCount,
            copiedCount,
            skippedCount,
            failedCount,
            scannedCount,
            percent: clampProgressPercent(scannedCount > 0 ? (processedCount / scannedCount) * 100 : 0),
            currentPath: relativePath
          },
          "Job sync progress"
        );
        // #region debug-point E:sync-heartbeat-mem
        fetch("http://127.0.0.1:7777/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "backup-500",
            runId: "pre-fix",
            hypothesisId: "E",
            location: "apps/api/src/index.ts:2230",
            msg: "[DEBUG] sync heartbeat memory",
            data: { jobId, trigger, processedCount, scannedCount, memory: process.memoryUsage() }
          })
        }).catch(() => {});
        // #endregion
        lastHeartbeatAt = now;
        lastHeartbeatProcessed = processedCount;
      }
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
      const now = Date.now();
      if (now - lastHeartbeatAt >= 5000 || processedCount - lastHeartbeatProcessed >= 500) {
        app.log.info(
          {
            event: "job.exec.progress",
            jobId,
            trigger,
            processedCount,
            copiedCount,
            skippedCount,
            failedCount,
            scannedCount,
            percent: clampProgressPercent(scannedCount > 0 ? (processedCount / scannedCount) * 100 : 0),
            currentPath: relativePath
          },
          "Job sync progress"
        );
        // #region debug-point E:sync-heartbeat-mem
        fetch("http://127.0.0.1:7777/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: "backup-500",
            runId: "pre-fix",
            hypothesisId: "E",
            location: "apps/api/src/index.ts:2262",
            msg: "[DEBUG] sync heartbeat memory",
            data: { jobId, trigger, processedCount, scannedCount, memory: process.memoryUsage() }
          })
        }).catch(() => {});
        // #endregion
        lastHeartbeatAt = now;
        lastHeartbeatProcessed = processedCount;
      }
      if (copiedSamples.length < 20) {
        copiedSamples.push(relativePath);
      }
      } catch (error) {
        failedCount += 1;
        processedCount += 1;
        errors.push({ path: relativePath, error: (error as Error).message });
        if (errors.length <= 5) {
          app.log.warn(
            { event: "job.exec.error", jobId, trigger, path: relativePath, err: (error as Error).message },
            "Job sync error"
          );
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
          currentPath: relativePath
        });
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const run: JobRun = {
    id: `run_${randomUUID()}`,
    jobId: job.id,
    trigger,
    status: canceled ? "canceled" : failedCount === 0 ? "success" : "failed",
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
    message: canceled
      ? `任务已取消（扫描 ${scannedCount}，已处理 ${processedCount}）`
      : `扫描 ${scannedCount}，同步 ${copiedCount}，跳过 ${skippedCount}，失败 ${failedCount}；照片 ${photoCount}，视频 ${videoCount}，Live Photo ${copiedLivePhotoIds.size}`
  };
  state.jobRuns.unshift(run);
  state.jobRuns = state.jobRuns.slice(0, 200);
  await Promise.all([invalidateMediaIndexPath(sourceRoot), invalidateMediaIndexPath(destinationRoot)]).catch((error) => {
    app.log.warn({ err: (error as Error).message, jobId: job.id }, "Failed to invalidate media index cache");
  });
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
  if (canceled) {
    app.log.warn(
      { event: "job.exec.canceled", jobId, trigger, scannedCount, processedCount },
      "Job execution canceled"
    );
  } else {
    app.log.info(
      { event: "job.exec.finished", jobId, trigger, scannedCount, processedCount, copiedCount, failedCount },
      "Job execution finished"
    );
  }
  return run;
}

async function syncSingleFileForJob(
  state: BackupState,
  jobId: string,
  relativePathInput: string
): Promise<{
  relativePath: string;
  kind: BackupAsset["kind"];
  sizeBytes: number;
  capturedAt: string;
  destinationPath: string;
}> {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) {
    throw new Error("Job not found");
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

  const relativePath = normalizePosixRelativePath(relativePathInput);
  if (!isMediaFile(relativePath)) {
    throw new Error("Only media files can be synced");
  }

  const sourceFile = toSystemPathFromPosixRelative(sourceRoot, relativePath);
  const destinationFile = path.join(destinationRoot, relativePath.split(path.posix.sep).join(path.sep));
  const sourceStat = await stat(sourceFile).catch(() => null);
  if (!sourceStat?.isFile()) {
    throw new Error("Source file not found");
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

  const sourceCapturedAt = sourceStat.mtime.toISOString();
  const livePhotoAssetId = await detectLivePhotoAssetIdForRelativePath(sourceRoot, relativePath);
  const kind = detectAssetKind(relativePath, livePhotoAssetId);
  const existingIdx = state.assets.findIndex(
    (asset) => asset.storageTargetId === destinationStorage.id && asset.name === relativePath
  );
  const nextAsset: BackupAsset = {
    id: existingIdx >= 0 ? state.assets[existingIdx].id : `asset_${randomUUID()}`,
    name: relativePath,
    kind,
    storageTargetId: destinationStorage.id,
    encrypted: destinationStorage.encrypted,
    sizeBytes: sourceStat.size,
    capturedAt: sourceCapturedAt,
    livePhotoAssetId
  };
  if (existingIdx >= 0) {
    state.assets[existingIdx] = nextAsset;
  } else {
    state.assets.push(nextAsset);
  }

  await Promise.all([invalidateMediaIndexPath(sourceRoot), invalidateMediaIndexPath(destinationRoot)]).catch((error) => {
    app.log.warn({ err: (error as Error).message, jobId }, "Failed to invalidate media index cache after single-file sync");
  });

  return {
    relativePath,
    kind,
    sizeBytes: sourceStat.size,
    capturedAt: sourceCapturedAt,
    destinationPath: destinationFile
  };
}

async function deleteSingleFileForJob(
  state: BackupState,
  jobId: string,
  relativePathInput: string,
  side: "source" | "destination"
): Promise<{ deleted: true; relativePath: string; side: "source" | "destination"; deletedPath: string }> {
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) {
    throw new Error("Job not found");
  }

  const sourceStorage = state.storages.find((item) => item.id === job.sourceTargetId);
  const destinationStorage = state.storages.find((item) => item.id === job.destinationTargetId);
  if (!sourceStorage || !destinationStorage) {
    throw new Error("Storage target for this job is missing");
  }
  if (!isLocalStorage(sourceStorage.type) || !isLocalStorage(destinationStorage.type)) {
    throw new Error("Only local-to-local operations are supported in current version");
  }

  const sourceRoot = resolvePathInStorage(sourceStorage, job.sourcePath);
  const destinationRoot = resolvePathInStorage(destinationStorage, job.destinationPath);
  if (hasOverlappingPaths(sourceRoot, destinationRoot)) {
    throw new Error("Source path and destination path cannot overlap");
  }

  const relativePath = normalizePosixRelativePath(relativePathInput);
  if (!isMediaFile(relativePath)) {
    throw new Error("Only media files can be deleted");
  }

  const targetStorage = side === "source" ? sourceStorage : destinationStorage;
  const targetRoot = side === "source" ? sourceRoot : destinationRoot;
  const targetFile = toSystemPathFromPosixRelative(targetRoot, relativePath);
  const targetStat = await stat(targetFile).catch(() => null);
  if (!targetStat?.isFile()) {
    throw new Error("File not found");
  }

  await unlink(targetFile);
  state.assets = state.assets.filter((asset) => !(asset.storageTargetId === targetStorage.id && asset.name === relativePath));
  await invalidateMediaIndexPath(targetRoot).catch(() => undefined);

  return {
    deleted: true as const,
    relativePath,
    side,
    deletedPath: targetFile
  };
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
  const statusLabel = run.status === "success" ? "成功" : run.status === "canceled" ? "已取消" : "失败";
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
  app.log.info({ event: "job.exec.queued", executionId: execution.id, jobId, trigger }, "Job execution queued");
  void enqueueRunExecution(async () => {
    const control = jobExecutionControls.get(execution.id);
    if (control?.cancelRequested) {
      updateJobExecution(execution.id, (current) => {
        current.status = "canceled";
        current.startedAt = new Date().toISOString();
        current.finishedAt = new Date().toISOString();
        current.progress.phase = "finished";
        current.progress.percent = 100;
        current.message = "任务已取消";
        current.error = null;
      });
      app.log.warn({ event: "job.exec.canceled", executionId: execution.id, jobId, trigger }, "Job execution canceled before start");
      trimJobExecutions();
      return;
    }
    updateJobExecution(execution.id, (current) => {
      current.status = "running";
      current.startedAt = new Date().toISOString();
      current.progress.phase = "scanning";
      current.progress.percent = 0;
      current.progress.currentPath = null;
      current.error = null;
      current.message = null;
    });
    app.log.info(
      {
        event: "job.exec.started",
        executionId: execution.id,
        jobId,
        trigger,
        queueDelayMs: Date.now() - Date.parse(execution.createdAt)
      },
      "Job execution started"
    );

    try {
      const state = await stateRepo.loadState();
      const shouldCancel = () => jobExecutionControls.get(execution.id)?.cancelRequested ?? false;
      const run = await executeJob(state, jobId, trigger, (progress) => {
        updateJobExecution(execution.id, (current) => {
          current.progress = {
            ...current.progress,
            ...progress
          };
        });
      }, { shouldCancel });
      const saveStartedMs = Date.now();
      await stateRepo.saveState(state);
      app.log.info(
        {
          event: "state.save",
          tookMs: Date.now() - saveStartedMs,
          assets: state.assets.length,
          jobs: state.jobs.length,
          jobRuns: state.jobRuns.length
        },
        "Backup state saved"
      );
      const processedCount = run.copiedCount + run.skippedCount + run.failedCount;
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
          processedCount,
          copiedCount: run.copiedCount,
          skippedCount: run.skippedCount,
          failedCount: run.failedCount,
          photoCount: run.photoCount,
          videoCount: run.videoCount,
          livePhotoPairCount: run.livePhotoPairCount,
          percent: run.status === "canceled" ? clampProgressPercent(run.scannedCount ? (processedCount / run.scannedCount) * 100 : 0) : 100,
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
    void invalidateMediaIndexPath(sourceRoot).catch(() => undefined);
    scheduleWatchedJob(job.id, reason, watchPath);
  };

  watcher.on("add", (watchPath) => onMediaChange(watchPath, "add"));
  watcher.on("change", (watchPath) => onMediaChange(watchPath, "change"));
  watcher.on("unlink", (watchPath) => onMediaChange(watchPath, "unlink"));
  watcher.on("addDir", (watchPath) => {
    void invalidateMediaIndexPath(sourceRoot).catch(() => undefined);
    scheduleWatchedJob(job.id, "add_dir", watchPath);
  });
  watcher.on("unlinkDir", (watchPath) => {
    void invalidateMediaIndexPath(sourceRoot).catch(() => undefined);
    scheduleWatchedJob(job.id, "unlink_dir", watchPath);
  });
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

  req.appState = state;
  req.authUser = user;
  req.authTokenHash = tokenHash;
});

app.get("/healthz", async () => ({ ok: true }));

app.get("/api/metrics", async () => {
  const state = await stateRepo.loadState();
  return metricSummary(state);
});

app.get<{ Querystring: { year?: string } }>("/api/dashboard/source-activity", async (req) => {
  const query = sourceActivityQuerySchema.parse(req.query ?? {});
  const state = req.appState ?? (await stateRepo.loadState());
  const year = query.year ?? new Date().getFullYear();
  const startedMs = Date.now();
  const result = await buildSourceMediaActivity(state, year);
  app.log.info(
    {
      event: "dashboard.source_activity",
      year: result.year,
      sourceRootCount: result.sourceRootCount,
      totalAddedCount: result.totalAddedCount,
      maxDailyCount: result.maxDailyCount,
      tookMs: Date.now() - startedMs
    },
    "Built source activity heatmap data"
  );
  return result;
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
  try {
    const state = await stateRepo.loadState();
    const cleaned = pruneExpiredSessions(state);
    if (cleaned) {
      await stateRepo.saveState(state);
    }
    // #region debug-point C:auth-status-ok
    fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "backup-500",
        runId: "post-fix",
        hypothesisId: "C",
        location: "apps/api/src/index.ts:3142",
        msg: "[DEBUG] auth status ok",
        data: { hasUsers: state.users.length > 0 }
      })
    }).catch(() => {});
    // #endregion
    return {
      enabled: true,
      hasUsers: state.users.length > 0
    };
  } catch (error) {
    // #region debug-point C:auth-status-error
    fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "backup-500",
        runId: "post-fix",
        hypothesisId: "C",
        location: "apps/api/src/index.ts:3142",
        msg: "[DEBUG] auth status error",
        data: { message: (error as Error).message }
      })
    }).catch(() => {});
    // #endregion
    throw error;
  }
});

app.post<{ Body: { username: string; password: string } }>("/api/auth/bootstrap", async (req, reply) => {
  let state: BackupState | null = null;
  try {
    state = await stateRepo.loadState();
  } catch (error) {
    // #region debug-point D:auth-bootstrap-load-error
    fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "backup-500",
        runId: "pre-fix",
        hypothesisId: "D",
        location: "apps/api/src/index.ts:3154",
        msg: "[DEBUG] auth bootstrap load error",
        data: { message: (error as Error).message }
      })
    }).catch(() => {});
    // #endregion
    throw error;
  }
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

app.get("/api/storages/relations", async () => {
  const state = await stateRepo.loadState();
  return buildStorageRelationGraph(state);
});

app.get("/api/media-index", async () => {
  const items = await listMediaIndexStatusItems();
  return {
    maxAgeMs: MEDIA_INDEX_MAX_AGE_MS,
    items
  };
});

app.post<{ Body: { storageId?: string } }>("/api/media-index/rebuild", async (req, reply) => {
  const body = mediaIndexRebuildSchema.parse(req.body ?? {});
  const state = await stateRepo.loadState();
  const localStorages = state.storages.filter((storage) => isLocalStorage(storage.type));
  const targets = body.storageId ? localStorages.filter((storage) => storage.id === body.storageId) : localStorages;

  if (body.storageId && !targets.length) {
    return reply.code(404).send({ message: "Storage not found or not a local storage target" });
  }

  const items = await Promise.all(
    targets.map(async (storage) => {
      try {
        const rootPath = resolvePathInStorage(storage, storage.basePath);
        const rows = await collectIndexedMediaFiles(rootPath, true);
        return {
          storageId: storage.id,
          storageName: storage.name,
          rootPath,
          fileCount: rows.length,
          ok: true,
          error: null as string | null
        };
      } catch (error) {
        return {
          storageId: storage.id,
          storageName: storage.name,
          rootPath: storage.basePath,
          fileCount: 0,
          ok: false,
          error: (error as Error).message
        };
      }
    })
  );

  return {
    refreshedCount: items.filter((item) => item.ok).length,
    failedCount: items.filter((item) => !item.ok).length,
    items
  };
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

    let rows: IndexedMediaFile[] = [];
    try {
      rows = await collectIndexedMediaFiles(currentPath);
    } catch {
      return reply.code(404).send({ message: "Directory not found" });
    }

    const files = rows
      .map((row) => {
        const ext = path.extname(row.relativePath).toLowerCase();
        const kind = IMAGE_EXTENSIONS.has(ext) ? "image" : VIDEO_EXTENSIONS.has(ext) ? "video" : "other";
        if (kind === "other") return null;

        const modifiedAt = Number.isFinite(row.mtimeMs) && row.mtimeMs > 0 ? new Date(row.mtimeMs).toISOString() : null;
        return {
          name: path.basename(row.relativePath),
          path: row.fullPath,
          kind,
          sizeBytes: row.sizeBytes ?? null,
          modifiedAt,
          capturedAt: modifiedAt,
          latitude: null,
          longitude: null
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));

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
  if (isLocalStorage(item.type)) {
    await invalidateMediaIndexPath(item.basePath).catch(() => undefined);
  }
  await reconcileJobWatchers(state);
  return item;
});

app.delete<{ Params: { storageId: string } }>("/api/storages/:storageId", async (req, reply) => {
  const state = await stateRepo.loadState();
  const removed = state.storages.find((s) => s.id === req.params.storageId);
  const before = state.storages.length;
  state.storages = state.storages.filter((s) => s.id !== req.params.storageId);
  if (state.storages.length === before) {
    return reply.code(404).send({ message: "Storage not found" });
  }
  const relatedJobIds = new Set(
    state.jobs
      .filter((job) => job.sourceTargetId === req.params.storageId || job.destinationTargetId === req.params.storageId)
      .map((job) => job.id)
  );
  if (relatedJobIds.size > 0) {
    state.jobs = state.jobs.filter((job) => !relatedJobIds.has(job.id));
    state.jobRuns = state.jobRuns.filter((run) => !relatedJobIds.has(run.jobId));
    for (const [executionId, execution] of jobExecutions.entries()) {
      if (relatedJobIds.has(execution.jobId)) {
        jobExecutions.delete(executionId);
      }
    }
  }
  await stateRepo.saveState(state);
  if (removed && isLocalStorage(removed.type)) {
    await invalidateMediaIndexPath(removed.basePath).catch(() => undefined);
  }
  await reconcileJobWatchers(state);
  return { ok: true };
});

app.get("/api/jobs", async () => {
  const state = await stateRepo.loadState();
  return { items: state.jobs };
});

app.get<{
  Params: { jobId: string };
  Querystring: {
    status?: "all" | "source_only" | "destination_only" | "changed" | "same";
    kind?: "all" | "image" | "video";
    keyword?: string;
    page?: string;
    pageSize?: string;
    refresh?: string;
    all?: string;
  };
}>("/api/jobs/:jobId/diff", async (req, reply) => {
  const query = jobDiffQuerySchema.parse(req.query ?? {});
  const state = req.appState ?? (await stateRepo.loadState());
  const startedMs = Date.now();
  try {
    app.log.info(
      {
        event: "job.diff.request",
        jobId: req.params.jobId,
        status: query.status ?? "all",
        kind: query.kind ?? "all",
        keyword: (query.keyword ?? "").trim(),
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 60,
        refresh: parseBooleanQueryValue(query.refresh),
        all: parseBooleanQueryValue(query.all)
      },
      "Job diff requested"
    );
    const result = await buildJobDiff(state, req.params.jobId, {
      statusFilter: query.status ?? "all",
      kindFilter: query.kind ?? "all",
      keyword: (query.keyword ?? "").trim(),
      page: query.page ?? 1,
      pageSize: query.pageSize ?? 60,
      forceRefresh: parseBooleanQueryValue(query.refresh),
      includeAll: parseBooleanQueryValue(query.all)
    });
    app.log.info(
      {
        event: "job.diff.result",
        jobId: req.params.jobId,
        total: result.total,
        page: result.page,
        totalPages: result.totalPages,
        changedCount: result.summary.changedCount,
        sourceOnlyCount: result.summary.sourceOnlyCount,
        destinationOnlyCount: result.summary.destinationOnlyCount,
        sameCount: result.summary.sameCount,
        tookMs: Date.now() - startedMs
      },
      "Job diff built"
    );
    return result;
  } catch (error) {
    const message = (error as Error).message;
    app.log.warn({ event: "job.diff.error", jobId: req.params.jobId, message, tookMs: Date.now() - startedMs }, "Failed to build job diff");
    if (message === "Job not found") {
      return reply.code(404).send({ message });
    }
    return reply.code(400).send({ message });
  }
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

app.post<{ Params: { executionId: string } }>("/api/job-executions/:executionId/cancel", async (req, reply) => {
  const execution = requestCancelExecution(req.params.executionId);
  if (!execution) {
    return reply.code(404).send({ message: "Execution not found" });
  }
  // #region debug-point B:cancel-exec
  fetch("http://127.0.0.1:7777/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "backup-500",
      runId: "post-fix",
      hypothesisId: "B",
      location: "apps/api/src/index.ts:3586",
      msg: "[DEBUG] cancel execution requested",
      data: { executionId: execution.id, jobId: execution.jobId, status: execution.status }
    })
  }).catch(() => {});
  // #endregion
  app.log.warn({ event: "job.exec.cancel.requested", executionId: execution.id, jobId: execution.jobId }, "Cancel requested");
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

app.post<{ Params: { jobId: string }; Body: { relativePath: string } }>(
  "/api/jobs/:jobId/sync-file",
  async (req, reply) => {
    const body = jobSyncFileSchema.parse(req.body ?? {});
    app.log.info(
      { event: "job.sync_file.request", jobId: req.params.jobId, relativePath: body.relativePath },
      "Single-file sync requested"
    );
    try {
      const state = req.appState ?? (await stateRepo.loadState());
      const result = await syncSingleFileForJob(state, req.params.jobId, body.relativePath);
      await stateRepo.saveState(state);
       app.log.info(
        {
          event: "job.sync_file.success",
          jobId: req.params.jobId,
          relativePath: result.relativePath,
          kind: result.kind,
          sizeBytes: result.sizeBytes,
          destinationPath: result.destinationPath
        },
        "Single-file sync completed"
      );
      return { synced: true as const, ...result };
    } catch (error) {
      const message = (error as Error).message;
      app.log.warn(
        { event: "job.sync_file.error", jobId: req.params.jobId, relativePath: body.relativePath, message },
        "Single-file sync failed"
      );
      if (message === "Job not found") {
        return reply.code(404).send({ message });
      }
      if (message === "Source file not found") {
        return reply.code(404).send({ message });
      }
      return reply.code(400).send({ message });
    }
  }
);

app.post<{ Params: { jobId: string }; Body: { relativePath: string; side: "source" | "destination" } }>(
  "/api/jobs/:jobId/delete-file",
  async (req, reply) => {
    const body = jobDeleteFileSchema.parse(req.body ?? {});
    app.log.info(
      { event: "job.delete_file.request", jobId: req.params.jobId, relativePath: body.relativePath, side: body.side },
      "Single-file delete requested"
    );
    try {
      const state = req.appState ?? (await stateRepo.loadState());
      const result = await deleteSingleFileForJob(state, req.params.jobId, body.relativePath, body.side);
      await stateRepo.saveState(state);
      app.log.info(
        { event: "job.delete_file.success", jobId: req.params.jobId, relativePath: result.relativePath, side: result.side },
        "Single-file delete completed"
      );
      return result;
    } catch (error) {
      const message = (error as Error).message;
      app.log.warn(
        { event: "job.delete_file.error", jobId: req.params.jobId, relativePath: body.relativePath, side: body.side, message },
        "Single-file delete failed"
      );
      if (message === "Job not found" || message === "File not found") {
        return reply.code(404).send({ message });
      }
      return reply.code(400).send({ message });
    }
  }
);

app.get("/api/backups", async () => {
  const state = await stateRepo.loadState();
  const livePhotoPairs = livePhoto.detectPairs(state.assets.map((a) => a.name));

  return {
    items: state.assets,
    livePhotoPairs
  };
});

app.get("/api/backups/storage-media-summary", async () => {
  const state = await stateRepo.loadState();
  const items = await buildStorageMediaSummary(state);
  return {
    items
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
  if (mediaIndexSaveTimer) {
    clearTimeout(mediaIndexSaveTimer);
    mediaIndexSaveTimer = null;
  }
  await persistMediaIndexStore();
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
