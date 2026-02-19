import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { getVersionInfo } from "../lib/api";
import type { AuthUser, VersionInfo } from "../types/api";

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

function normalizePathname(pathname: string) {
  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function getPageMeta(pathname: string) {
  if (pathname === "/") return { title: "总览", subtitle: "NAS 多目标照片备份平台" };
  if (pathname === "/media") return { title: "媒体预览", subtitle: "按存储浏览图片和视频" };
  if (pathname === "/records") return { title: "执行记录", subtitle: "查看任务历史执行结果" };
  if (pathname.startsWith("/settings/jobs")) return { title: "任务配置", subtitle: "管理备份任务与执行策略" };
  if (pathname.startsWith("/settings/storages")) return { title: "存储配置", subtitle: "管理源存储和目标存储" };
  if (pathname.startsWith("/settings/notifications")) return { title: "通知配置", subtitle: "配置 Telegram 通知" };
  if (pathname.startsWith("/settings")) return { title: "配置中心", subtitle: "通知、存储、任务统一管理" };
  return { title: "PhotoArk", subtitle: "管理照片备份与多目标同步" };
}

type AppShellProps = {
  authUser: AuthUser;
  onLogout: () => Promise<void> | void;
};

export function AppShell({ authUser, onLogout }: AppShellProps) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const location = useLocation();
  const pathname = normalizePathname(location.pathname);
  const pageMeta = getPageMeta(pathname);
  const isDashboard = pathname === "/";

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

  async function handleLogoutClick() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
    }
  }

  function renderCompactVersionBadge() {
    if (!version) {
      return <span className="mp-chip text-sm mp-muted">版本加载中...</span>;
    }
    if (version.hasUpdate) {
      return (
        <a className="mp-chip mp-chip-warning text-sm" href={version.latestUrl ?? undefined} target="_blank" rel="noreferrer">
          更新 {version.latestVersion}
        </a>
      );
    }
    if (version.upToDate) {
      return <span className="mp-chip mp-chip-success text-sm">v{version.currentVersion}</span>;
    }
    return <span className="mp-chip text-sm mp-muted">v{version.currentVersion}</span>;
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
              key={isDashboard ? "hero-header" : `page-header:${pathname}`}
              className={`mb-4 p-4 ${isDashboard ? "mp-panel mp-panel-hero" : "mp-panel mp-panel-soft py-3.5"}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {isDashboard ? <p className="text-sm uppercase tracking-[0.22em] text-[var(--ark-primary)]">PhotoArk</p> : null}
                  <h2 className={`font-bold tracking-tight ${isDashboard ? "mt-1 text-lg sm:text-2xl" : "text-lg sm:text-xl"}`}>
                    {isDashboard ? "NAS 多目标照片备份平台" : pageMeta.title}
                  </h2>
                  <p className={`text-sm mp-muted ${isDashboard ? "mt-2" : "mt-1"}`}>{pageMeta.subtitle}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  <span className="mp-chip text-sm">{authUser.username}</span>
                  {renderCompactVersionBadge()}
                  <button type="button" onClick={toggleTheme} className="mp-btn">
                    {theme === "light" ? "暗色" : "亮色"}
                  </button>
                  <button type="button" onClick={handleLogoutClick} className="mp-btn" disabled={loggingOut}>
                    {loggingOut ? "退出中..." : "退出"}
                  </button>
                </div>
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
