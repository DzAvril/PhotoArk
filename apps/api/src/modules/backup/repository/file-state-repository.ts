import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppSettings, BackupState } from "./types.js";

function createDefaultSettings(): AppSettings {
  return {
    telegram: {
      enabled: false,
      botToken: "",
      chatId: "",
      proxyUrl: ""
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
  private cachedState: BackupState | null = null;
  private cachedMtimeMs = -1;

  constructor(private readonly stateFilePath: string) {}

  async loadState(): Promise<BackupState> {
    try {
      const fileStat = await stat(this.stateFilePath);
      if (
        this.cachedState &&
        Number.isFinite(fileStat.mtimeMs) &&
        Math.abs(fileStat.mtimeMs - this.cachedMtimeMs) < 0.001
      ) {
        return structuredClone(this.cachedState);
      }

      const raw = await readFile(this.stateFilePath, "utf8");
      // #region debug-point D:state-load-raw
      fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "backup-oom-001",
          runId: "pre-fix",
          hypothesisId: "D",
          location: "apps/api/src/modules/backup/repository/file-state-repository.ts:43",
          msg: "[DEBUG] state file raw loaded",
          data: { stateFilePath: this.stateFilePath, fileBytes: fileStat.size, rawLength: raw.length, memory: process.memoryUsage() }
        })
      }).catch(() => {});
      // #endregion
      const parsed = JSON.parse(raw) as Partial<BackupState>;
      const parsedTelegram = parsed.settings?.telegram;
      const nextState: BackupState = {
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
            chatId: parsedTelegram?.chatId ?? defaultState.settings.telegram.chatId,
            proxyUrl: parsedTelegram?.proxyUrl ?? defaultState.settings.telegram.proxyUrl
          }
        }
      };
      this.cachedState = structuredClone(nextState);
      this.cachedMtimeMs = fileStat.mtimeMs;
      // #region debug-point B:state-load-parsed
      fetch("http://127.0.0.1:7777/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: "backup-oom-001",
          runId: "pre-fix",
          hypothesisId: "B",
          location: "apps/api/src/modules/backup/repository/file-state-repository.ts:60",
          msg: "[DEBUG] state file parsed",
          data: {
            stateFilePath: this.stateFilePath,
            assetsCount: nextState.assets.length,
            jobsCount: nextState.jobs.length,
            usersCount: nextState.users.length,
            sessionsCount: nextState.sessions.length,
            memory: process.memoryUsage()
          }
        })
      }).catch(() => {});
      // #endregion
      return nextState;
    } catch {
      this.cachedState = structuredClone(defaultState);
      this.cachedMtimeMs = -1;
      return structuredClone(defaultState);
    }
  }

  async saveState(state: BackupState): Promise<void> {
    const serialized = JSON.stringify(state, null, 2);
    // #region debug-point B:state-save-serialized
    fetch("http://127.0.0.1:7777/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "backup-oom-001",
        runId: "pre-fix",
        hypothesisId: "B",
        location: "apps/api/src/modules/backup/repository/file-state-repository.ts:72",
        msg: "[DEBUG] state file serialized",
        data: {
          stateFilePath: this.stateFilePath,
          serializedBytes: Buffer.byteLength(serialized, "utf8"),
          assetsCount: state.assets.length,
          jobsCount: state.jobs.length,
          memory: process.memoryUsage()
        }
      })
    }).catch(() => {});
    // #endregion
    await mkdir(path.dirname(this.stateFilePath), { recursive: true });
    await writeFile(this.stateFilePath, serialized, "utf8");
    this.cachedState = structuredClone(state);
    const fileStat = await stat(this.stateFilePath).catch(() => null);
    this.cachedMtimeMs = fileStat?.mtimeMs ?? Date.now();
  }
}
