import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import cors from "@fastify/cors";
import type { BackupJob, StorageTarget } from "@photoark/shared";
import { env } from "./config/env.js";
import { EncryptionService } from "./modules/crypto/encryption-service.js";
import { LivePhotoService } from "./modules/livephoto/live-photo-service.js";
import { FileStateRepository } from "./modules/backup/repository/file-state-repository.js";
import type { BackupAsset, BackupState } from "./modules/backup/repository/types.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true });

const encryption = new EncryptionService(Buffer.from(env.MASTER_KEY_BASE64, "base64"));
const livePhoto = new LivePhotoService();
const stateRepo = new FileStateRepository(env.BACKUP_STATE_FILE);

const previewTokens = new Map<string, { assetId: string; expiresAt: number }>();
const PREVIEW_TOKEN_TTL_MS = 60_000;

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

app.get("/healthz", async () => ({ ok: true }));

app.get("/api/metrics", async () => {
  const state = await stateRepo.loadState();
  return metricSummary(state);
});

app.get("/api/storages", async () => {
  const state = await stateRepo.loadState();
  return { items: state.storages };
});

app.post<{ Body: Omit<StorageTarget, "id"> }>("/api/storages", async (req) => {
  const state = await stateRepo.loadState();
  const item: StorageTarget = { id: `st_${randomUUID()}`, ...req.body };
  state.storages.push(item);
  await stateRepo.saveState(state);
  return item;
});

app.get("/api/jobs", async () => {
  const state = await stateRepo.loadState();
  return { items: state.jobs };
});

app.post<{ Body: Omit<BackupJob, "id"> }>("/api/jobs", async (req) => {
  const state = await stateRepo.loadState();
  const item: BackupJob = { id: `job_${randomUUID()}`, ...req.body };
  state.jobs.push(item);
  await stateRepo.saveState(state);
  return item;
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
  const item: BackupAsset = { id: `asset_${randomUUID()}`, ...req.body };
  state.assets.push(item);
  await stateRepo.saveState(state);
  return item;
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

    return {
      assetId: asset.id,
      mode: asset.encrypted ? "decrypted_memory_stream" : "direct_stream",
      streamUrl: `/api/backups/${asset.id}/stream?ticket=${randomUUID()}`,
      message: asset.encrypted
        ? "Encrypted asset will be decrypted in-memory for one-time preview."
        : "Asset can be previewed directly."
    };
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

app.listen({ port: env.API_PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
