import { useEffect, useState, type FormEvent } from "react";
import { InlineAlert } from "../components/inline-alert";
import { Field } from "../components/ui/field";
import { PageHeader } from "../components/ui/page-header";
import { getSettings, sendTelegramTest, updateSettings } from "../lib/api";
import type { AppSettings } from "../types/api";

const defaultSettings: AppSettings = {
  telegram: {
    enabled: false,
    botToken: "",
    chatId: "",
    proxyUrl: ""
  }
};

export function SettingsPage() {
  const [form, setForm] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setError("");
    try {
      const res = await getSettings();
      setForm(res.settings);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const res = await updateSettings(form);
      setForm(res.settings);
      setMessage("配置已保存");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function handleTelegramTest() {
    setTesting(true);
    setError("");
    setMessage("");
    try {
      await updateSettings(form);
      await sendTelegramTest();
      setMessage("测试通知已发送");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="space-y-4">
      <PageHeader
        title="通知"
        description="配置 Telegram 备份摘要、异常提醒与测试消息。"
        chips={
          <span className={`mp-chip ${form.telegram.enabled ? "mp-chip-success" : ""}`}>
            {form.telegram.enabled ? "已启用" : "未启用"}
          </span>
        }
      />

      <div className="mp-panel p-4">
        {loading ? <p className="text-sm mp-muted">加载中...</p> : null}
        {error ? (
          <InlineAlert tone="error" className="mt-3" onClose={() => setError("")}>
            {error}
          </InlineAlert>
        ) : null}
        {message ? (
          <InlineAlert tone="success" className="mt-3" autoCloseMs={5200} onClose={() => setMessage("")}>
            {message}
          </InlineAlert>
        ) : null}

        <form onSubmit={(e) => void onSubmit(e)} className="mt-4 space-y-5">
          <Field
            id="telegram-enabled"
            label="启用 Telegram"
            help="关闭后将不会发送成功摘要、失败告警和测试通知。"
          >
            <input
              id="telegram-enabled"
              type="checkbox"
              checked={form.telegram.enabled}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  telegram: { ...prev.telegram, enabled: e.target.checked }
                }))
              }
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="telegram-bot-token" label="Bot Token">
              <div className="flex gap-2">
                <input
                  id="telegram-bot-token"
                  className="mp-input"
                  type={showBotToken ? "text" : "password"}
                  autoComplete="off"
                  placeholder="输入 Telegram Bot Token"
                  value={form.telegram.botToken}
                  disabled={!form.telegram.enabled}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      telegram: { ...prev.telegram, botToken: e.target.value }
                    }))
                  }
                />
                <button
                  type="button"
                  className="mp-btn mp-btn-md shrink-0"
                  onClick={() => setShowBotToken((prev) => !prev)}
                  disabled={!form.telegram.enabled}
                >
                  {showBotToken ? "隐藏" : "显示"}
                </button>
              </div>
            </Field>

            <Field id="telegram-chat-id" label="Chat ID">
              <input
                id="telegram-chat-id"
                className="mp-input"
                autoComplete="off"
                placeholder="输入接收消息的 Chat ID"
                value={form.telegram.chatId}
                disabled={!form.telegram.enabled}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    telegram: { ...prev.telegram, chatId: e.target.value }
                  }))
                }
              />
            </Field>
          </div>

          <Field
            id="telegram-proxy-url"
            label="代理地址（可选）"
            help="当 NAS 无法直连 Telegram 时填写 HTTP/HTTPS 代理地址；留空则直接连接 Telegram API。"
          >
            <input
              id="telegram-proxy-url"
              className="mp-input"
              autoComplete="off"
              placeholder="例如 http://127.0.0.1:7890"
              value={form.telegram.proxyUrl}
              disabled={!form.telegram.enabled}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  telegram: { ...prev.telegram, proxyUrl: e.target.value }
                }))
              }
            />
          </Field>

          <div className="flex flex-col gap-2 border-t border-[var(--ark-line)] pt-4 sm:flex-row">
            <button type="submit" className="mp-btn mp-btn-primary mp-btn-md sm:min-w-[132px]" disabled={saving || loading}>
              {saving ? "保存中..." : "保存配置"}
            </button>
            <button
              type="button"
              className="mp-btn mp-btn-md sm:min-w-[132px]"
              disabled={testing || loading}
              onClick={() => void handleTelegramTest()}
            >
              {testing ? "发送中..." : "发送测试通知"}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
