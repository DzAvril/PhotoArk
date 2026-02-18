import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/", label: "总览" },
  { to: "/storages", label: "存储" },
  { to: "/jobs", label: "任务" },
  { to: "/backups", label: "备份" }
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-[var(--ark-bg)] text-[var(--ark-ink)]">
      <div className="mx-auto grid max-w-[1400px] grid-cols-1 gap-4 px-3 py-4 md:grid-cols-[220px_1fr] md:px-5">
        <aside className="mp-panel hidden p-4 md:block">
          <div className="mb-6">
            <h1 className="text-xl font-bold">PhotoArk</h1>
            <p className="mt-1 text-xs mp-muted">Backup Control Center</p>
          </div>
          <nav className="space-y-2">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm ${
                    isActive ? "bg-[var(--ark-primary)] text-white" : "text-[var(--ark-ink)] hover:bg-[var(--ark-surface-soft)]"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        <section>
          <header className="mp-panel mb-4 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-widest text-[var(--ark-primary)]">PhotoArk</p>
                <h2 className="text-lg font-semibold">NAS 多目标照片备份平台</h2>
              </div>
              <nav className="flex flex-wrap gap-2 md:hidden">
                {tabs.map((tab) => (
                  <NavLink
                    key={tab.to}
                    to={tab.to}
                    className={({ isActive }) =>
                      `rounded-md border px-3 py-1.5 text-xs ${
                        isActive
                          ? "border-[var(--ark-primary)] bg-[var(--ark-primary)] text-white"
                          : "border-[var(--ark-line)] bg-white text-[var(--ark-ink)]"
                      }`
                    }
                  >
                    {tab.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </header>

          <Outlet />
        </section>
      </div>
    </div>
  );
}
