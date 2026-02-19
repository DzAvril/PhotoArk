import { useMemo, useState } from "react";
import type { DirectoryBrowseResult } from "../types/api";

interface PathPickerProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  browse: (path?: string) => Promise<DirectoryBrowseResult>;
  disabled?: boolean;
  required?: boolean;
}

export function PathPicker({ value, onChange, placeholder, browse, disabled, required }: PathPickerProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [browser, setBrowser] = useState<DirectoryBrowseResult | null>(null);

  const hasDirs = useMemo(() => (browser?.directories.length ?? 0) > 0, [browser?.directories.length]);

  async function load(path?: string) {
    setLoading(true);
    setError("");
    try {
      const res = await browse(path);
      setBrowser(res);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function toggleOpen() {
    const next = !open;
    setOpen(next);
    if (next) {
      await load(value || undefined);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          className="mp-input"
          placeholder={placeholder}
          value={value}
          disabled={disabled}
          required={required}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" className="mp-btn shrink-0" onClick={() => void toggleOpen()} disabled={disabled}>
          {open ? "收起" : "选择路径"}
        </button>
      </div>

      {open ? (
        <div className="rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-2">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="min-w-0">
              <div className="mp-muted">当前目录</div>
              <div className="truncate font-medium">{(browser?.currentPath ?? value) || "-"}</div>
            </div>
            <div className="flex gap-1">
              <button
                type="button"
                className="mp-btn"
                onClick={() => void load(browser?.parentPath ?? undefined)}
                disabled={loading || !browser?.parentPath}
              >
                返回上级
              </button>
              <button
                type="button"
                className="mp-btn"
                onClick={() => void load(value || browser?.currentPath || undefined)}
                disabled={loading}
              >
                刷新
              </button>
              <button
                type="button"
                className="mp-btn mp-btn-primary"
                onClick={() => {
                  if (browser?.currentPath) onChange(browser.currentPath);
                  setOpen(false);
                }}
                disabled={loading || !browser?.currentPath}
              >
                选中当前目录
              </button>
            </div>
          </div>

          {error ? <p className="mp-error mb-2">{error}</p> : null}

          <div className="max-h-56 overflow-auto rounded-lg border border-[var(--ark-line)] bg-[var(--ark-surface)] p-1">
            {!hasDirs && !loading ? <p className="px-2 py-3 text-sm mp-muted">当前目录下没有子目录</p> : null}
            {browser?.directories.map((d) => (
              <button
                key={d.path}
                type="button"
                className="block w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-[var(--ark-surface-soft)]"
                onClick={() => {
                  void load(d.path);
                }}
              >
                {d.path}
              </button>
            ))}
            {loading ? <p className="px-2 py-3 text-sm mp-muted">读取中...</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
