import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
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
import type { BackupAsset, BackupState } from "./modules/backup/repository/types.js";

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
  return reply.code(500).send({ message: "Internal server error" });
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

function isInBrowseRoot(targetPath: string): boolean {
  const root = path.resolve(env.FS_BROWSE_ROOT);
  const target = path.resolve(targetPath);
  return target === root || target.startsWith(`${root}${path.sep}`);
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
  if (!isInBrowseRoot(targetPath)) {
    throw new Error("Path is outside browse root");
  }

  return targetPath;
}

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp", ".gif"]);
const VIDEO_EXTENSIONS = new Set([".mov", ".mp4", ".m4v", ".avi", ".mkv", ".webm"]);

app.get("/healthz", async () => ({ ok: true }));

app.get("/api/metrics", async () => {
  const state = await stateRepo.loadState();
  return metricSummary(state);
});

app.get("/api/storages", async () => {
  const state = await stateRepo.loadState();
  return { items: state.storages };
});

app.get<{ Querystring: { path?: string } }>("/api/fs/directories", async (req, reply) => {
  const inputPath = req.query.path ?? env.FS_BROWSE_ROOT;
  const currentPath = path.resolve(inputPath);
  const rootPath = path.resolve(env.FS_BROWSE_ROOT);

  if (!isInBrowseRoot(currentPath)) {
    return reply.code(403).send({ message: "Path is outside browse root" });
  }

  const dirEntries = await readdir(currentPath, { withFileTypes: true });
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
    const dirEntries = await readdir(currentPath, { withFileTypes: true });
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

    const entries = await readdir(currentPath, { withFileTypes: true });
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

app.delete<{ Params: { jobId: string } }>("/api/jobs/:jobId", async (req, reply) => {
  const state = await stateRepo.loadState();
  const before = state.jobs.length;
  state.jobs = state.jobs.filter((j) => j.id !== req.params.jobId);
  if (state.jobs.length === before) {
    return reply.code(404).send({ message: "Job not found" });
  }
  await stateRepo.saveState(state);
  return { ok: true };
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
