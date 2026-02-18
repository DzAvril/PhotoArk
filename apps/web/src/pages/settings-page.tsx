import { useEffect, useState, type FormEvent } from "react";
import { getSettings, sendTelegramTest, updateSettings } from "../lib/api";
import type { AppSettings } from "../types/api";

const defaultSettings: AppSettings = {
  telegram: {
    enabled: false,
    botToken: "",
    chatId: ""
  }
};

export function SettingsPage() {
  const [form, setForm] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
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
    <section className="space-y-3">
      <div className="mp-panel p-4">
        <h2 className="mp-section-title">配置中心</h2>
        <p className="mt-1 text-xs mp-muted">管理通知配置。启用后每次备份执行都会发送摘要到 Telegram。</p>
      </div>

      <div className="mp-panel p-4">
        {loading ? <p className="text-xs mp-muted">加载中...</p> : null}
        {error ? <p className="mp-error mb-3">{error}</p> : null}
        {message ? <p className="mb-3 text-xs text-emerald-600">{message}</p> : null}

        <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
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

          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="mp-input"
              placeholder="Bot Token"
              value={form.telegram.botToken}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  telegram: { ...prev.telegram, botToken: e.target.value }
                }))
              }
            />
            <input
              className="mp-input"
              placeholder="Chat ID"
              value={form.telegram.chatId}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  telegram: { ...prev.telegram, chatId: e.target.value }
                }))
              }
            />
          </div>

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
    </section>
  );
}
