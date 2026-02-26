import { useEffect, useState, type FormEvent } from "react";
import { InlineAlert } from "../components/inline-alert";
import { getMediaIndexStatus, getSettings, rebuildMediaIndex, sendTelegramTest, updateSettings } from "../lib/api";
import type { AppSettings, MediaIndexStatusItem } from "../types/api";

const defaultSettings: AppSettings = {
  telegram: {
    enabled: false,
    botToken: "",
    chatId: "",
    proxyUrl: ""
  }
};

function formatDurationMs(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "-";
  if (value < 1000) return `${Math.round(value)} ms`;
  const totalSeconds = Math.round(value / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes} 分 ${seconds} 秒`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours} 小时 ${mins} 分`;
}

export function SettingsPage() {
  const [form, setForm] = useState<AppSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [indexLoading, setIndexLoading] = useState(false);
  const [indexRebuilding, setIndexRebuilding] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);
  const [mediaIndexItems, setMediaIndexItems] = useState<MediaIndexStatusItem[]>([]);
  const [mediaIndexMaxAgeMs, setMediaIndexMaxAgeMs] = useState(0);
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

  async function loadMediaIndexStatus(showError = false) {
    setIndexLoading(true);
    try {
      const res = await getMediaIndexStatus();
      setMediaIndexItems(res.items);
      setMediaIndexMaxAgeMs(res.maxAgeMs);
    } catch (err) {
      if (showError) {
        setError((err as Error).message);
      }
    } finally {
      setIndexLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void loadMediaIndexStatus();
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

  async function handleRebuildMediaIndex() {
    setIndexRebuilding(true);
    setError("");
    setMessage("");
    try {
      const res = await rebuildMediaIndex();
      await loadMediaIndexStatus();
      if (res.failedCount > 0) {
        setError(`索引重建完成：成功 ${res.refreshedCount}，失败 ${res.failedCount}`);
      } else {
        setMessage(`索引重建完成：共刷新 ${res.refreshedCount} 个本地存储`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIndexRebuilding(false);
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

        <fieldset className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-3">
          <legend className="px-1 text-sm font-semibold">媒体索引</legend>
          <div className="flex flex-wrap items-center gap-2">
            <span className="mp-chip">缓存根目录 {mediaIndexItems.length}</span>
            <span className="mp-chip">新鲜阈值 {formatDurationMs(mediaIndexMaxAgeMs)}</span>
            {indexLoading ? <span className="mp-chip">读取中...</span> : null}
            <button type="button" className="mp-btn" disabled={indexLoading || indexRebuilding} onClick={() => void loadMediaIndexStatus(true)}>
              刷新状态
            </button>
            <button type="button" className="mp-btn" disabled={indexRebuilding} onClick={() => void handleRebuildMediaIndex()}>
              {indexRebuilding ? "重建中..." : "重建索引"}
            </button>
          </div>
          <div className="mt-3 max-h-52 space-y-2 overflow-auto">
            {mediaIndexItems.length ? (
              mediaIndexItems.map((item) => (
                <div key={item.rootPath} className="rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{item.rootPath}</p>
                    <span className={`mp-chip ${item.fresh ? "mp-chip-success" : "mp-chip-warning"}`}>
                      {item.fresh ? "新鲜" : "过期"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs mp-muted">
                    文件 {item.fileCount} · 更新于 {new Date(item.generatedAt).toLocaleString("zh-CN", { hour12: false })} · 距今{" "}
                    {formatDurationMs(item.ageMs)}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm mp-muted">暂无可用索引缓存，首次统计时会自动建立。</p>
            )}
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
