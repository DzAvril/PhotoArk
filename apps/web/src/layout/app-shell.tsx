import { motion, useAnimation } from "framer-motion";
import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { GitCompareArrows, Images, LayoutDashboard, ListChecks, MoonStar, Settings, SunMedium, UserRound } from "lucide-react";
import { getVersionInfo } from "../lib/api";
import type { AuthUser, VersionInfo } from "../types/api";

const tabs = [
  { to: "/", label: "总览" },
  { to: "/media", label: "媒体" },
  { to: "/diff", label: "差异" },
  { to: "/records", label: "记录" },
  { to: "/settings", label: "设置" }
] as const;

type TabPath = (typeof tabs)[number]["to"];

const tabIconByPath: Record<TabPath, ComponentType<{ className?: string; "aria-hidden"?: boolean }>> = {
  "/": LayoutDashboard,
  "/media": Images,
  "/diff": GitCompareArrows,
  "/records": ListChecks,
  "/settings": Settings
};

function NavTabIcon({ to, className }: { to: TabPath; className?: string }) {
  const Icon = tabIconByPath[to];
  return <Icon className={className} aria-hidden={true} />;
}

type ThemeMode = "light" | "dark";
const themeColorByMode: Record<ThemeMode, string> = {
  light: "#f5f1ec",
  dark: "#0c1117"
};

function normalizePathname(pathname: string) {
  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

function getPageMeta(pathname: string) {
  if (pathname === "/") return { title: "备份总览", subtitle: "任务状态、存储健康度与实时同步进度" };
  if (pathname === "/media") return { title: "媒体浏览", subtitle: "按存储查看图片、视频与 Live Photo" };
  if (pathname === "/diff") return { title: "差异检查", subtitle: "查看源目录与目标目录的媒体差异并预览" };
  if (pathname === "/records") return { title: "执行记录", subtitle: "查看任务历史执行结果与统计" };
  if (pathname.startsWith("/settings/jobs")) return { title: "任务配置", subtitle: "管理备份任务与执行策略" };
  if (pathname.startsWith("/settings/advanced")) return { title: "高级配置", subtitle: "索引与诊断工具，仅在排障时使用" };
  if (pathname.startsWith("/settings/storages")) return { title: "存储配置", subtitle: "管理源存储和目标存储" };
  if (pathname.startsWith("/settings/notifications")) return { title: "通知配置", subtitle: "配置 Telegram 通知" };
  if (pathname.startsWith("/settings")) return { title: "设置中心", subtitle: "通知、存储、任务统一管理" };
  return { title: "PhotoArk", subtitle: "照片备份与多目标同步控制台" };
}

type AppShellProps = {
  authUser: AuthUser;
  onLogout: () => Promise<void> | void;
};

export function AppShell({ authUser, onLogout }: AppShellProps) {
  const [theme, setTheme] = useState<ThemeMode>("light");
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pageTransitionControls = useAnimation();
  const location = useLocation();
  const pathname = normalizePathname(location.pathname);
  const pageMeta = getPageMeta(pathname);

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

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(event: MouseEvent) {
      if (!menuRef.current || menuRef.current.contains(event.target as Node)) return;
      setMenuOpen(false);
    }
    function handleKeydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeydown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [menuOpen]);

  useEffect(() => {
    pageTransitionControls.set({ opacity: 0, y: 8 });
    void pageTransitionControls.start({
      opacity: 1,
      y: 0,
      transition: { duration: 0.22, ease: "easeOut" },
    });
  }, [pageTransitionControls, pathname]);

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
      return <span className="mp-chip mp-muted">版本加载中...</span>;
    }
    if (version.hasUpdate) {
      return (
        <a className="mp-chip mp-chip-warning" href={version.latestUrl ?? undefined} target="_blank" rel="noreferrer">
          更新 {version.latestVersion}
        </a>
      );
    }
    if (version.upToDate) {
      return <span className="mp-chip mp-chip-success">v{version.currentVersion}</span>;
    }
    return <span className="mp-chip mp-muted">v{version.currentVersion}</span>;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--ark-bg)] text-[var(--ark-ink)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_8%_2%,color-mix(in_oklab,var(--ark-primary)_18%,transparent)_0%,transparent_38%),radial-gradient(circle_at_94%_18%,color-mix(in_oklab,var(--ark-accent)_14%,transparent)_0%,transparent_32%)]"
      />

      <div className="mx-auto min-h-screen w-full max-w-[1400px] px-3 pb-24 pt-4 md:h-[calc(100vh-2rem)] md:px-6 md:pb-6 md:overflow-hidden">
        <div className="mp-shell md:h-full md:overflow-hidden">
          <motion.aside
            className="mp-sidebar hidden md:flex md:h-full md:flex-col md:overflow-auto"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <div className="flex items-start gap-3 border-b border-[var(--ark-line)]/70 p-4">
              <img
                src="/logo.svg"
                alt="PhotoArk logo"
                className="h-11 w-11 rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-surface)] p-1.5 shadow-sm"
              />
              <div className="min-w-0">
                <p className="mp-kicker mp-kicker-primary">PhotoArk</p>
                <h1 className="text-base font-semibold tracking-tight">照片备份控制台</h1>
                <p className="mt-1 text-xs mp-muted">多目标同步与差异校验</p>
              </div>
            </div>

            <nav className="flex-1 space-y-1.5 p-3">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${
                      isActive
                        ? "bg-[var(--ark-primary)] text-white shadow-[0_12px_24px_color-mix(in_oklab,var(--ark-primary)_32%,transparent)]"
                        : "border border-transparent text-[var(--ark-ink)] hover:border-[var(--ark-line)] hover:bg-[var(--ark-surface-soft)]"
                    }`
                  }
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-current/10 bg-white/10">
                    <NavTabIcon to={tab.to} className="h-4 w-4" />
                  </span>
                  <span>{tab.label}</span>
                </NavLink>
              ))}
            </nav>

            <div className="border-t border-[var(--ark-line)]/70 p-4">
              <div className="flex items-center justify-between">
                {renderCompactVersionBadge()}
                <button type="button" className="mp-btn mp-btn-sm" onClick={toggleTheme}>
                  {theme === "light" ? <MoonStar className="h-4 w-4" aria-hidden="true" /> : <SunMedium className="h-4 w-4" aria-hidden="true" />}
                  <span>{theme === "light" ? "深色" : "浅色"}</span>
                </button>
              </div>
              <div className="mt-3 text-xs mp-muted">登录账号: {authUser.username}</div>
            </div>
          </motion.aside>

          <section className="mp-shell-main min-w-0 md:h-full md:overflow-hidden">
            <motion.header
              key={`page-header:${pathname}`}
              className="mp-topbar sticky top-3 z-30 p-4 md:static md:top-auto md:z-auto md:p-5"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24, ease: "easeOut" }}
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="mp-kicker mp-kicker-primary">PhotoArk Console</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight md:text-[26px]">{pageMeta.title}</h2>
                  <p className="mt-2 text-sm leading-6 mp-muted">{pageMeta.subtitle}</p>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:justify-end">
                  <div className="flex items-center gap-2 md:hidden">
                    {renderCompactVersionBadge()}
                    <button type="button" className="mp-btn" onClick={toggleTheme}>
                      {theme === "light" ? <MoonStar className="h-4 w-4" aria-hidden="true" /> : <SunMedium className="h-4 w-4" aria-hidden="true" />}
                      <span>{theme === "light" ? "深色" : "浅色"}</span>
                    </button>
                  </div>
                  <div className="relative" ref={menuRef}>
                    <button
                      type="button"
                      className="mp-btn"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      onClick={() => setMenuOpen((prev) => !prev)}
                    >
                      <UserRound className="h-4 w-4" aria-hidden="true" />
                      <span className="text-sm">账户</span>
                    </button>
                    {menuOpen ? (
                      <div className="absolute right-0 z-20 mt-2 w-64 overflow-hidden rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface)] shadow-lg">
                        <div className="px-4 pt-3">
                          <p className="text-sm font-semibold">{authUser.username}</p>
                          <p className="mt-0.5 text-xs mp-muted">已登录</p>
                        </div>
                        <div className="px-4 py-2 sm:hidden">{renderCompactVersionBadge()}</div>
                        <div className="border-t border-[var(--ark-line)]" />
                        <div className="p-3">
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpen(false);
                              void handleLogoutClick();
                            }}
                            className="mp-btn mp-btn-primary w-full"
                            disabled={loggingOut}
                          >
                            {loggingOut ? "退出中..." : "退出"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            </motion.header>

            <motion.div className="mt-4 min-h-0 flex-1 md:overflow-auto" animate={pageTransitionControls} initial={false}>
              <Outlet />
            </motion.div>
          </section>
        </div>
      </div>

      <nav className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-50 md:hidden">
        <div className="mp-panel px-2 py-2">
          <ul className="grid grid-cols-5 gap-1.5">
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
