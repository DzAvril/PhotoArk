import { useEffect, useState } from "react";
import { getStorages } from "../lib/api";
import type { StorageTarget } from "../types/api";

export function StoragesPage() {
  const [items, setItems] = useState<StorageTarget[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    getStorages()
      .then((res) => setItems(res.items))
      .catch((err: Error) => setError(err.message));
  }, []);

  return (
    <section className="mt-6 rounded-3xl border border-white/40 bg-white/72 p-5 shadow-[0_8px_24px_rgba(11,41,33,0.09)] backdrop-blur">
      <h2 className="text-lg font-semibold text-[var(--ark-deep)]">目标存储</h2>
      {error ? <p className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((s) => (
          <article key={s.id} className="rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-paper)] px-4 py-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-[var(--ark-deep)]">{s.name}</h3>
              <span className="text-xs text-[var(--ark-ink)]/70">{s.type}</span>
            </div>
            <p className="mt-1 text-xs text-[var(--ark-ink)]/70">{s.basePath}</p>
            <p className="mt-1 text-xs text-[var(--ark-ink)]/70">{s.encrypted ? "加密存储" : "明文存储"}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
