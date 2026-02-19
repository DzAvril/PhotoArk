import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { getVersionInfo } from "../lib/api";
import type { VersionInfo } from "../types/api";

const tabs = [
  { to: "/", label: "总览", short: "总" },
  { to: "/media", label: "媒体", short: "媒" },
  { to: "/records", label: "记录", short: "记" },
  { to: "/settings", label: "配置", short: "配" }
];

type ThemeMode = "light" | "dark";
const themeColorByMode: Record<ThemeMode, string> = {
  light: "#2563eb",
  dark: "#0f172a"
};

export function AppShell() {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const location = useLocation();

  function applyTheme(nextTheme: ThemeMode) {
    document.documentElement.setAttribute("data-theme", nextTheme);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) {
      themeMeta.setAttribute("content", themeColorByMode[nextTheme]);
    }
  }

  useEffect(() => {
    const saved = (localStorage.getItem("ark-theme") as ThemeMode | null) ?? "light";
    setTheme(saved);
    applyTheme(saved);
  }, []);

  useEffect(() => {
    void getVersionInfo().then(setVersion).catch(() => undefined);
  }, []);

  function toggleTheme() {
    const next: ThemeMode = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("ark-theme", next);
    applyTheme(next);
  }

  return (
    <div className="min-h-screen bg-[var(--ark-bg)] text-[var(--ark-ink)]">
      <div className="mx-auto max-w-[1440px] px-3 pb-24 pt-3 md:px-5 md:pb-5 md:pt-4">
        <div className="grid gap-4 md:grid-cols-[230px_minmax(0,1fr)]">
          <motion.aside
            className="mp-panel mp-panel-soft hidden self-start p-4 md:sticky md:top-4 md:block"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="mb-5">
              <h1 className="text-xl font-bold">PhotoArk</h1>
              <p className="mt-1 text-sm mp-muted">Backup Control Center</p>
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
          </motion.aside>

          <section className="min-w-0">
            <motion.header
              className="mp-panel mp-panel-hero mb-4 p-4"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm uppercase tracking-[0.22em] text-[var(--ark-primary)]">PhotoArk</p>
                  <h2 className="mt-1 text-lg font-bold tracking-tight sm:text-2xl">NAS 多目标照片备份平台</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    <span className="mp-chip mp-muted">版本 {version?.currentVersion ?? "..."}</span>
                    {version?.hasUpdate ? (
                      <a
                        className="mp-chip mp-chip-warning"
                        href={version.latestUrl ?? undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        有新版本 {version.latestVersion}
                      </a>
                    ) : version?.upToDate ? (
                      <span className="mp-chip mp-chip-success">已是最新</span>
                    ) : version ? (
                      <span className="mp-chip">无法检查更新</span>
                    ) : null}
                  </div>
                </div>
                <button type="button" onClick={toggleTheme} className="mp-btn shrink-0">
                  {theme === "light" ? "暗色" : "亮色"}
                </button>
              </div>

            </motion.header>

            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </section>
        </div>
      </div>

      <nav className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-50 md:hidden">
        <div className="mp-panel px-2 py-2">
          <ul className="grid grid-cols-4 gap-1.5">
            {tabs.map((tab) => (
              <li key={tab.to}>
                <NavLink
                  to={tab.to}
                  className={({ isActive }) =>
                    `flex min-h-12 flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-medium leading-tight transition-colors ${
                      isActive ? "bg-[var(--ark-primary)] text-white" : "text-[var(--ark-ink-soft)]"
                    }`
                  }
                >
                  <span className="text-sm font-semibold">{tab.short}</span>
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
