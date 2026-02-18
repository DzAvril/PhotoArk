import type { BackupItem } from "../../core/types.js";
import { EncryptionService } from "../crypto/encryption-service.js";
import type { StorageAdapter } from "../storage/storage-adapter.js";

export class BackupService {
  constructor(
    private readonly source: StorageAdapter,
    private readonly destination: StorageAdapter,
    private readonly encryption: EncryptionService
  ) {}

  async sync(items: BackupItem[]): Promise<{ uploaded: number }> {
    let uploaded = 0;

    for (const item of items) {
      const content = await this.source.readFile(item.sourcePath);
      const output = item.encrypted ? this.encryption.encrypt(content) : content;
      await this.destination.writeFile(item.destinationPath, output);
      uploaded += 1;
    }

    return { uploaded };
  }
}
