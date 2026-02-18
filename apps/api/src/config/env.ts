import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

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
  MASTER_KEY_BASE64: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHAT_ID: z.string().optional()
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment variables: ${message}`);
}

export const env = parsed.data;
