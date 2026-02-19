import { fetch as undiciFetch, ProxyAgent } from "undici";

interface TelegramConfig {
  botToken?: string;
  chatId?: string;
  proxyUrl?: string;
}

const proxyAgentCache = new Map<string, ProxyAgent>();

function getProxyAgent(proxyUrl: string): ProxyAgent {
  const cached = proxyAgentCache.get(proxyUrl);
  if (cached) {
    return cached;
  }
  const next = new ProxyAgent(proxyUrl);
  proxyAgentCache.set(proxyUrl, next);
  return next;
}

function normalizeProxyUrl(input?: string): string | null {
  const trimmed = input?.trim();
  if (!trimmed) return null;
  const parsed = new URL(trimmed);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Telegram proxy URL must use http:// or https://");
  }
  return parsed.toString();
}

export class TelegramService {
  constructor(private readonly config: TelegramConfig) {}

  async send(message: string): Promise<void> {
    if (!this.config.botToken || !this.config.chatId) {
      return;
    }

    const requestInit: NonNullable<Parameters<typeof undiciFetch>[1]> = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.config.chatId,
        text: message,
        disable_web_page_preview: true
      })
    };
    const proxyUrl = normalizeProxyUrl(this.config.proxyUrl);
    if (proxyUrl) {
      requestInit.dispatcher = getProxyAgent(proxyUrl);
    }

    const res = await undiciFetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, requestInit);

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Telegram API error (${res.status}): ${text || "unknown error"}`);
    }
  }
}
