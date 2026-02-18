import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileEntry } from "../../../core/types.js";
import type { StorageAdapter } from "../storage-adapter.js";

export class LocalFsAdapter implements StorageAdapter {
  constructor(private readonly basePath: string) {}

  async listFiles(prefix: string): Promise<FileEntry[]> {
    const fullPrefix = path.join(this.basePath, prefix);
    const names = await readdir(fullPrefix);
    const out: FileEntry[] = [];

    for (const name of names) {
      const absolute = path.join(fullPrefix, name);
      const st = await stat(absolute);
      if (st.isFile()) {
        out.push({
          path: path.join(prefix, name),
          size: st.size,
          modifiedAt: st.mtime
        });
      }
    }

    return out;
  }

  async readFile(filePath: string): Promise<Buffer> {
    return readFile(path.join(this.basePath, filePath));
  }

  async writeFile(filePath: string, content: Buffer): Promise<void> {
    const absolute = path.join(this.basePath, filePath);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content);
  }

  async ensureDir(dirPath: string): Promise<void> {
    await mkdir(path.join(this.basePath, dirPath), { recursive: true });
  }
}
