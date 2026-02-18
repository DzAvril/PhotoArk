import { useEffect, useState } from "react";
import { getJobs } from "../lib/api";
import type { BackupJob } from "../types/api";

export function JobsPage() {
  const [items, setItems] = useState<BackupJob[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getJobs()
      .then((res) => setItems(res.items))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <section className="mt-6 rounded-3xl border border-white/40 bg-white/72 p-5 shadow-[0_8px_24px_rgba(11,41,33,0.09)] backdrop-blur">
      <h2 className="text-lg font-semibold text-[var(--ark-deep)]">备份任务</h2>
      {error ? <p className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p> : null}
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
