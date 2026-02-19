import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { getVersionInfo } from "../lib/api";
import type { VersionInfo } from "../types/api";

const tabs = [
  { to: "/", label: "总览", short: "总" },
  { to: "/media", label: "媒体", short: "媒" },
  { to: "/records", label: "记录", short: "记" },
  { to: "/settings", label: "配置", short: "配" }
];

type ThemeMode = "light" | "dark";

export function AppShell() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [version, setVersion] = useState<VersionInfo | null>(null);

  useEffect(() => {
    const saved = (localStorage.getItem("ark-theme") as ThemeMode | null) ?? "light";
    setTheme(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  useEffect(() => {
    void getVersionInfo().then(setVersion).catch(() => undefined);
  }, []);

  function toggleTheme() {
    const next: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("ark-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <div className="min-h-screen bg-[var(--ark-bg)] text-[var(--ark-ink)]">
      <div className="mx-auto max-w-[1440px] px-3 pb-24 pt-3 md:px-5 md:pb-5 md:pt-4">
        <div className="grid gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="mp-panel hidden self-start p-4 md:sticky md:top-4 md:block">
            <div className="mb-5">
              <h1 className="text-xl font-bold">PhotoArk</h1>
              <p className="mt-1 text-xs mp-muted">Backup Control Center</p>
            </div>
            <nav className="space-y-1.5">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    `block rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      isActive ? "bg-[var(--ark-primary)] text-white" : "text-[var(--ark-ink)] hover:bg-[var(--ark-surface-soft)]"
                    }`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </aside>

          <section className="min-w-0">
            <header className="mp-panel mb-4 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-[0.22em] text-[var(--ark-primary)]">PhotoArk</p>
                  <h2 className="mt-1 text-lg font-bold tracking-tight sm:text-2xl">NAS 多目标照片备份平台</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="mp-chip mp-muted">版本 {version?.currentVersion ?? "..."}</span>
                    {version?.hasUpdate ? (
                      <a
                        className="mp-chip border-amber-300 bg-amber-50 text-amber-700"
                        href={version.latestUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        有新版本 {version.latestVersion}
                      </a>
                    ) : version?.upToDate ? (
                      <span className="mp-chip border-emerald-400 bg-emerald-50 text-emerald-700">已是最新</span>
                    ) : version ? (
                      <span className="mp-chip">无法检查更新</span>
                    ) : null}
                  </div>
                </div>
                <button type="button" onClick={toggleTheme} className="mp-btn shrink-0">
                  {theme === "light" ? "暗色" : "亮色"}
                </button>
              </div>

            </header>

            <Outlet />
          </section>
        </div>
      </div>

      <nav className="fixed inset-x-3 bottom-3 z-50 md:hidden">
        <div className="mp-panel px-2 py-1.5">
          <ul className="grid grid-cols-4 gap-1">
            {tabs.map((tab) => (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  className={({ isActive }) =>
                    `flex flex-col items-center rounded-lg px-1 py-1.5 text-[10px] transition-colors ${
                      isActive ? "bg-[var(--ark-primary)] text-white" : "text-[var(--ark-ink-soft)]"
                    }`
                  }
                >
                  <span className="text-xs font-semibold">{tab.short}</span>
                  <span className="mt-0.5">{tab.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
}
