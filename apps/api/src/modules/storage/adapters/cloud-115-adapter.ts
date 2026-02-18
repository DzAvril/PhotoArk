import type { FileEntry } from "../../../core/types.js";
import type { StorageAdapter } from "../storage-adapter.js";

export class Cloud115Adapter implements StorageAdapter {
  async listFiles(_prefix: string): Promise<FileEntry[]> {
    throw new Error("Cloud115Adapter not implemented yet; integrate via 115 SDK or rclone backend.");
  }

  async readFile(_filePath: string): Promise<Buffer> {
    throw new Error("Cloud115Adapter read is not implemented yet.");
  }

  async writeFile(_filePath: string, _content: Buffer): Promise<void> {
    throw new Error("Cloud115Adapter write is not implemented yet.");
  }

  async ensureDir(_dirPath: string): Promise<void> {
    // no-op placeholder
  }
}
