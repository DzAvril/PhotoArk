import { useEffect, useState, type FormEvent } from "react";
import { createJob, getJobs } from "../lib/api";
import type { BackupJob } from "../types/api";

const initialForm: Omit<BackupJob, "id"> = {
  name: "",
  sourceTargetId: "",
  destinationTargetId: "",
  schedule: "0 2 * * *",
  watchMode: false,
  enabled: true
};

export function JobsPage() {
  const [items, setItems] = useState<BackupJob[]>([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await getJobs();
      setItems(res.items);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await createJob(form);
      setForm(initialForm);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-white/40 bg-white/72 p-5 shadow-[0_8px_24px_rgba(11,41,33,0.09)] backdrop-blur">
      <h2 className="text-lg font-semibold text-[var(--ark-deep)]">备份任务</h2>
      {error ? <p className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-paper)] p-3 sm:grid-cols-2">
        <input
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          placeholder="任务名称"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
        />
        <input
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          placeholder="sourceTargetId"
          value={form.sourceTargetId}
          onChange={(e) => setForm((p) => ({ ...p, sourceTargetId: e.target.value }))}
          required
        />
        <input
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          placeholder="destinationTargetId"
          value={form.destinationTargetId}
          onChange={(e) => setForm((p) => ({ ...p, destinationTargetId: e.target.value }))}
          required
        />
        <input
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          placeholder="cron（监听模式可留默认）"
          value={form.schedule ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, schedule: e.target.value }))}
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.watchMode} onChange={(e) => setForm((p) => ({ ...p, watchMode: e.target.checked }))} />
          实时监听
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((p) => ({ ...p, enabled: e.target.checked }))} />
          启用
        </label>
        <button type="submit" className="rounded-full bg-[var(--ark-deep)] px-4 py-2 text-sm text-[var(--ark-paper)] sm:col-span-2">
          新增任务
        </button>
      </form>

      <div className="mt-3 space-y-3">
        {items.map((j) => (
          <article key={j.id} className="rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-paper)] px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-[var(--ark-deep)]">{j.name}</h3>
              <span className="text-xs text-emerald-700">{j.enabled ? "启用" : "停用"}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--ark-ink)]/70">源: {j.sourceTargetId}</p>
            <p className="mt-1 text-xs text-[var(--ark-ink)]/70">目标: {j.destinationTargetId}</p>
            <p className="mt-1 text-xs text-[var(--ark-ink)]/70">模式: {j.watchMode ? "实时监听" : `定时(${j.schedule})`}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
