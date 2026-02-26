import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { getVersionInfo } from "../lib/api";
import type { AuthUser, VersionInfo } from "../types/api";

const tabs = [
  { to: "/", label: "总览" },
  { to: "/media", label: "媒体" },
  { to: "/records", label: "记录" },
  { to: "/settings", label: "配置" }
] as const;

type TabPath = (typeof tabs)[number]["to"];

function NavTabIcon({ to, className }: { to: TabPath; className?: string }) {
  if (to === "/") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <path d="M3.5 10.2 10 4.5l6.5 5.7v5.3a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1v-5.3Z" stroke="currentColor" strokeWidth="1.7" />
        <path d="M8.2 16.5V11h3.6v5.5" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    );
  }
  if (to === "/media") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <rect x="2.8" y="3.2" width="14.4" height="13.6" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="7" cy="7" r="1.4" fill="currentColor" />
        <path d="M4.8 14.6 8.1 11.3 10.6 13.8 13.1 11.2 15.2 13.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  if (to === "/records") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
        <rect x="3.2" y="2.8" width="13.6" height="14.4" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
        <path d="M6.5 7h7M6.5 10h7M6.5 13h5.1" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path
        d="M10 4.4a1.2 1.2 0 0 1 2.1-.8l.4.7c.2.3.6.5 1 .5l.8-.1a1.2 1.2 0 0 1 1.3 1.8l-.4.7c-.2.3-.2.7 0 1l.4.7a1.2 1.2 0 0 1-1.3 1.8l-.8-.1a1 1 0 0 0-1 .5l-.4.7a1.2 1.2 0 0 1-2.1 0l-.4-.7a1 1 0 0 0-1-.5l-.8.1a1.2 1.2 0 0 1-1.3-1.8l.4-.7a1 1 0 0 0 0-1l-.4-.7a1.2 1.2 0 0 1 1.3-1.8l.8.1c.4.1.8-.1 1-.5l.4-.7A1.2 1.2 0 0 1 10 4.4Z"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <circle cx="10" cy="10" r="1.8" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

type ThemeMode = "light" | "dark";
const themeColorByMode: Record<ThemeMode, string> = {
  light: "#2056dd",
  dark: "#070f1e"
};

function normalizePathname(pathname: string) {
  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function getPageMeta(pathname: string) {
  if (pathname === "/") return { title: "总览", subtitle: "多存储目标备份、浏览与任务调度" };
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
    <div className="relative min-h-screen overflow-hidden bg-[var(--ark-bg)] text-[var(--ark-ink)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_8%_2%,color-mix(in_oklab,var(--ark-primary)_16%,transparent)_0%,transparent_32%),radial-gradient(circle_at_94%_18%,color-mix(in_oklab,var(--ark-primary)_10%,transparent)_0%,transparent_28%)]"
      />

      <div className="w-full min-h-screen px-3 pb-24 pt-3 md:px-5 md:pb-5 md:pt-4">
        <div className="grid min-h-[calc(100vh-7rem)] gap-4 md:min-h-[calc(100vh-2.25rem)] md:grid-cols-[244px_minmax(0,1fr)]">
          <motion.aside
            className="mp-panel mp-panel-soft hidden p-4 md:sticky md:top-4 md:block md:h-[calc(100vh-2.25rem)] md:overflow-auto"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="mb-5">
              <div className="flex items-center gap-3">
                <img
                  src="/logo.svg"
                  alt="PhotoArk logo"
                  className="h-11 w-11 rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-1.5 shadow-sm"
                />
                <div>
                  <h1 className="text-xl font-bold">PhotoArk</h1>
                  <p className="mt-0.5 text-xs uppercase tracking-[0.08em] mp-muted">Backup Control Center</p>
                </div>
              </div>
            </div>
            <nav className="space-y-1.5">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    `group block rounded-xl px-3 py-2.5 text-sm font-medium transition-all ${
                      isActive
                        ? "border border-[var(--ark-primary)]/20 bg-[var(--ark-primary)] text-white shadow-[0_8px_20px_color-mix(in_oklab,var(--ark-primary)_28%,transparent)]"
                        : "border border-transparent text-[var(--ark-ink)] hover:border-[var(--ark-line)] hover:bg-[var(--ark-surface-soft)]"
                    }`
                  }
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-2">
                      <NavTabIcon to={tab.to} className="h-4 w-4" />
                      <span>{tab.label}</span>
                    </span>
                  </span>
                </NavLink>
              ))}
            </nav>
          </motion.aside>

          <section className="min-w-0 flex min-h-0 flex-col">
            <motion.header
              key={isDashboard ? "hero-header" : `page-header:${pathname}`}
              className={`mb-4 p-4 backdrop-blur-[2px] ${isDashboard ? "mp-panel mp-panel-hero" : "mp-panel mp-panel-soft py-3.5"}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <img
                    src="/logo.svg"
                    alt="PhotoArk logo"
                    className={`rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-1 shadow-sm ${isDashboard ? "h-11 w-11" : "h-9 w-9"}`}
                  />
                  <div className="min-w-0">
                    {isDashboard ? <p className="text-sm uppercase tracking-[0.22em] text-[var(--ark-primary)]">PhotoArk</p> : null}
                    <h2 className={`break-keep font-bold tracking-tight ${isDashboard ? "mt-1 text-lg sm:text-2xl" : "text-lg sm:text-xl"}`}>
                      {isDashboard ? "NAS 多目标照片备份平台" : pageMeta.title}
                    </h2>
                    <p className={`break-keep text-sm mp-muted ${isDashboard ? "mt-1.5" : "mt-1"}`}>{pageMeta.subtitle}</p>
                  </div>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:shrink-0 md:justify-end">
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
                className="min-h-0 flex-1"
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
                    `flex min-h-12 flex-col items-center justify-center rounded-xl px-2 py-1 text-[11px] font-medium leading-tight transition-all ${
                      isActive
                        ? "bg-[var(--ark-primary)] text-white shadow-[0_8px_20px_color-mix(in_oklab,var(--ark-primary)_32%,transparent)]"
                        : "text-[var(--ark-ink-soft)]"
                    }`
                  }
                >
                  <NavTabIcon to={tab.to} className="h-4 w-4" />
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
