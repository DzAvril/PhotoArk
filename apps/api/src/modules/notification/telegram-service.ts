interface TelegramConfig {
  botToken?: string;
  chatId?: string;
}

export class TelegramService {
  constructor(private readonly config: TelegramConfig) {}

  async send(message: string): Promise<void> {
    if (!this.config.botToken || !this.config.chatId) {
      return;
    }

    const res = await fetch(`https://api.telegram.org/bot${this.config.botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: this.config.chatId,
        text: message,
        disable_web_page_preview: true
      })
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Telegram API error (${res.status}): ${text || "unknown error"}`);
    }
  }
}
