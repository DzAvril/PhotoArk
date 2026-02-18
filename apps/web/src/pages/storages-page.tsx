import { useEffect, useState, type FormEvent } from "react";
import { createStorage, getStorages } from "../lib/api";
import type { StorageTarget } from "../types/api";

const initialForm: Omit<StorageTarget, "id"> = {
  name: "",
  type: "local_fs",
  basePath: "",
  encrypted: false
};

export function StoragesPage() {
  const [items, setItems] = useState<StorageTarget[]>([]);
  const [form, setForm] = useState(initialForm);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await getStorages();
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
      await createStorage(form);
      setForm(initialForm);
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="mt-6 rounded-3xl border border-white/40 bg-white/72 p-5 shadow-[0_8px_24px_rgba(11,41,33,0.09)] backdrop-blur">
      <h2 className="text-lg font-semibold text-[var(--ark-deep)]">目标存储</h2>
      {error ? <p className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <form onSubmit={(e) => void onSubmit(e)} className="mt-3 grid gap-2 rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-paper)] p-3 sm:grid-cols-2">
        <input
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          placeholder="名称"
          value={form.name}
          onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
          required
        />
        <input
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          placeholder="路径或 URI"
          value={form.basePath}
          onChange={(e) => setForm((p) => ({ ...p, basePath: e.target.value }))}
          required
        />
        <select
          className="rounded-lg border border-[var(--ark-line)] px-3 py-2 text-sm"
          value={form.type}
          onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as StorageTarget["type"] }))}
        >
          <option value="local_fs">local_fs</option>
          <option value="external_ssd">external_ssd</option>
          <option value="cloud_115">cloud_115</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.encrypted}
            onChange={(e) => setForm((p) => ({ ...p, encrypted: e.target.checked }))}
          />
          加密存储
        </label>
        <button type="submit" className="rounded-full bg-[var(--ark-deep)] px-4 py-2 text-sm text-[var(--ark-paper)] sm:col-span-2">
          新增存储
        </button>
      </form>

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
