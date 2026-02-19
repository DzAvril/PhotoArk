import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppSettings, BackupState } from "./types.js";

function createDefaultSettings(): AppSettings {
  return {
    telegram: {
      enabled: false,
      botToken: "",
      chatId: ""
    }
  };
}

const defaultState: BackupState = {
  storages: [],
  jobs: [],
  assets: [],
  jobRuns: [],
  settings: createDefaultSettings(),
  users: [],
  sessions: []
};

export class FileStateRepository {
  constructor(private readonly stateFilePath: string) {}

  async loadState(): Promise<BackupState> {
    try {
      const raw = await readFile(this.stateFilePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<BackupState>;
      const parsedTelegram = parsed.settings?.telegram;
      return {
        storages: parsed.storages ?? [],
        jobs: parsed.jobs ?? [],
        assets: parsed.assets ?? [],
        jobRuns: parsed.jobRuns ?? [],
        users: parsed.users ?? [],
        sessions: parsed.sessions ?? [],
        settings: {
          telegram: {
            enabled: parsedTelegram?.enabled ?? defaultState.settings.telegram.enabled,
            botToken: parsedTelegram?.botToken ?? defaultState.settings.telegram.botToken,
            chatId: parsedTelegram?.chatId ?? defaultState.settings.telegram.chatId
          }
        }
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  async saveState(state: BackupState): Promise<void> {
    await mkdir(path.dirname(this.stateFilePath), { recursive: true });
    await writeFile(this.stateFilePath, JSON.stringify(state, null, 2), "utf8");
  }
}
