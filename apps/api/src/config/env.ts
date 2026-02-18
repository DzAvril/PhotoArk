import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const truthyTokens = new Set(["1", "true", "yes", "on"]);
const booleanLike = z
  .string()
  .optional()
  .transform((value) => truthyTokens.has((value ?? "").trim().toLowerCase()));

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const rootEnvPath = path.resolve(currentDir, "../../../../.env");
const apiEnvPath = path.resolve(currentDir, "../../.env");
const cwdEnvPath = path.resolve(process.cwd(), ".env");

dotenv.config({ path: rootEnvPath });
dotenv.config({ path: apiEnvPath, override: true });
dotenv.config({ path: cwdEnvPath, override: true });

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().default(8080),
  BACKUP_STATE_FILE: z.string().default("./apps/api/data/backup-state.json"),
  FS_BROWSE_ROOT: z.string().default("/"),
  WATCH_USE_POLLING: booleanLike,
  WATCH_POLLING_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  WATCH_RECONCILE_INTERVAL_MS: z.coerce.number().int().positive().default(30000),
  APP_VERSION: z.string().default("0.1.1"),
  VERSION_CHECK_REPO: z.string().default("DzAvril/PhotoArk"),
  VERSION_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(3500),
  GITHUB_TOKEN: z.string().optional(),
  MASTER_KEY_BASE64: z.string().min(1),
  LEGACY_MASTER_KEYS_BASE64: z.string().optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional()
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment variables: ${message}`);
}

export const env = parsed.data;
