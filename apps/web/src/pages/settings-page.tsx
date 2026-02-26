import { useEffect, useState, type FormEvent } from "react";
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
    <div className="mp-panel mp-panel-soft p-4 md:flex md:h-full md:flex-col">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Telegram 通知</h3>
        </div>
        <span className={`mp-chip ${form.telegram.enabled ? "mp-chip-success" : ""}`}>
          {form.telegram.enabled ? "已启用" : "未启用"}
        </span>
      </div>

      {loading ? <p className="mt-3 text-sm mp-muted">加载中...</p> : null}
      {error ? <p className="mp-error mt-3">{error}</p> : null}
      {message ? <p className="mt-3 text-sm mp-status-success">{message}</p> : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-3 space-y-3 md:min-h-0 md:flex-1 md:overflow-auto">
        <fieldset className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.telegram.enabled}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  telegram: { ...prev.telegram, enabled: e.target.checked }
                }))
              }
            />
            启用 Telegram 备份摘要通知
          </label>
        </fieldset>

        <fieldset className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-3">
          <legend className="px-1 text-sm font-semibold">连接凭据</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="telegram-bot-token" className="text-sm font-medium">
                Bot Token
              </label>
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
                  className="mp-btn shrink-0"
                  onClick={() => setShowBotToken((prev) => !prev)}
                  disabled={!form.telegram.enabled}
                >
                  {showBotToken ? "隐藏" : "显示"}
                </button>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="telegram-chat-id" className="text-sm font-medium">
                Chat ID
              </label>
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
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-3">
          <legend className="px-1 text-sm font-semibold">网络设置</legend>
          <div className="space-y-1">
            <label htmlFor="telegram-proxy-url" className="text-sm font-medium">
              代理地址（可选）
            </label>
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
            <p className="text-sm mp-muted">
              当 NAS 无法直连 Telegram 时填写 HTTP/HTTPS 代理地址；留空则直接连接 Telegram API。
            </p>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="mp-btn mp-btn-primary" disabled={saving || loading}>
            {saving ? "保存中..." : "保存配置"}
          </button>
          <button type="button" className="mp-btn" disabled={testing || loading} onClick={() => void handleTelegramTest()}>
            {testing ? "发送中..." : "发送测试通知"}
          </button>
        </div>
      </form>
    </div>
  );
}
