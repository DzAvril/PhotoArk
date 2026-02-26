import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface MediaIndexFileEntry {
  sizeBytes: number;
  mtimeMs: number;
}

export interface MediaIndexRootEntry {
  generatedAt: string;
  files: Record<string, MediaIndexFileEntry>;
}

export interface MediaIndexStore {
  version: 1;
  roots: Record<string, MediaIndexRootEntry>;
}

const defaultMediaIndexStore: MediaIndexStore = {
  version: 1,
  roots: {}
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toMediaIndexFileEntry(value: unknown): MediaIndexFileEntry | null {
  if (!isRecord(value)) return null;
  const sizeBytes = value.sizeBytes;
  const mtimeMs = value.mtimeMs;
  if (typeof sizeBytes !== "number" || !Number.isFinite(sizeBytes) || sizeBytes < 0) return null;
  if (typeof mtimeMs !== "number" || !Number.isFinite(mtimeMs) || mtimeMs < 0) return null;
  return {
    sizeBytes,
    mtimeMs
  };
}

function toMediaIndexRootEntry(value: unknown): MediaIndexRootEntry | null {
  if (!isRecord(value)) return null;
  const generatedAt = value.generatedAt;
  const files = value.files;
  if (typeof generatedAt !== "string") return null;
  if (Number.isNaN(Date.parse(generatedAt))) return null;
  if (!isRecord(files)) return null;

  const parsedFiles: Record<string, MediaIndexFileEntry> = {};
  for (const [relativePath, row] of Object.entries(files)) {
    if (!relativePath) continue;
    const parsedRow = toMediaIndexFileEntry(row);
    if (!parsedRow) continue;
    parsedFiles[relativePath] = parsedRow;
  }

  return {
    generatedAt,
    files: parsedFiles
  };
}

function toMediaIndexStore(input: unknown): MediaIndexStore {
  if (!isRecord(input)) return structuredClone(defaultMediaIndexStore);
  if (input.version !== 1) return structuredClone(defaultMediaIndexStore);
  if (!isRecord(input.roots)) return structuredClone(defaultMediaIndexStore);

  const parsedRoots: Record<string, MediaIndexRootEntry> = {};
  for (const [rootPath, row] of Object.entries(input.roots)) {
    if (!rootPath) continue;
    const parsedRow = toMediaIndexRootEntry(row);
    if (!parsedRow) continue;
    parsedRoots[rootPath] = parsedRow;
  }

  return {
    version: 1,
    roots: parsedRoots
  };
}

export class MediaIndexRepository {
  constructor(private readonly indexFilePath: string) {}

  async load(): Promise<MediaIndexStore> {
    try {
      const raw = await readFile(this.indexFilePath, "utf8");
      return toMediaIndexStore(JSON.parse(raw));
    } catch {
      return structuredClone(defaultMediaIndexStore);
    }
  }

  async save(store: MediaIndexStore): Promise<void> {
    await mkdir(path.dirname(this.indexFilePath), { recursive: true });
    await writeFile(this.indexFilePath, JSON.stringify(store, null, 2), "utf8");
  }
}
