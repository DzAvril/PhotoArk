import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BackupState } from "./types.js";

const defaultState: BackupState = {
  storages: [],
  jobs: [],
  assets: []
};

export class FileStateRepository {
  constructor(private readonly stateFilePath: string) {}

  async loadState(): Promise<BackupState> {
    try {
      const raw = await readFile(this.stateFilePath, "utf8");
      return JSON.parse(raw) as BackupState;
    } catch {
      return structuredClone(defaultState);
    }
  }

  async saveState(state: BackupState): Promise<void> {
    await mkdir(path.dirname(this.stateFilePath), { recursive: true });
    await writeFile(this.stateFilePath, JSON.stringify(state, null, 2), "utf8");
  }
}
