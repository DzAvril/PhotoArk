import type { FileEntry } from "../../core/types.js";

export interface StorageAdapter {
  listFiles(prefix: string): Promise<FileEntry[]>;
  readFile(filePath: string): Promise<Buffer>;
  writeFile(filePath: string, content: Buffer): Promise<void>;
  ensureDir(dirPath: string): Promise<void>;
}
