import { motion, useAnimation } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { MoonStar, SunMedium, UserRound } from "lucide-react";
import { getVersionInfo } from "../lib/api";
import { getPageMeta, normalizePathname, primaryNavItems } from "../navigation/navigation-model";
import type { AuthUser, VersionInfo } from "../types/api";

type ThemeMode = "light" | "dark";
const themeColorByMode: Record<ThemeMode, string> = {
  light: "#f5f1ec",
  dark: "#0c1117"
};

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
    <div className="min-h-screen bg-[var(--ark-bg)] text-[var(--ark-ink)]">
      <div className="mx-auto flex min-h-screen w-full max-w-[1480px] px-3 pb-24 pt-3 md:h-screen md:px-4 md:pb-4 md:pt-4">
        <div className="grid w-full gap-3 md:grid-cols-[232px_minmax(0,1fr)] md:overflow-hidden">
          <motion.aside
            className="mp-sidebar hidden md:flex md:min-h-0 md:flex-col md:overflow-auto"
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
              {primaryNavItems.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors ${
                        isActive
                          ? "bg-[var(--ark-primary)] text-white"
                          : "text-[var(--ark-ink-soft)] hover:bg-[var(--ark-surface-soft)] hover:text-[var(--ark-ink)]"
                      }`
                    }
                  >
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-md">
                      <Icon className="h-4 w-4" aria-hidden={true} />
                    </span>
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
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

          <section className="min-w-0 md:flex md:min-h-0 md:flex-col md:overflow-hidden">
            <motion.header
              key={`page-header:${pathname}`}
              className="mp-topbar p-4"
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

            <motion.div className="mt-3 min-h-0 flex-1 md:overflow-auto" animate={pageTransitionControls} initial={false}>
              <Outlet />
            </motion.div>
          </section>
        </div>
      </div>

      <nav className="fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-50 md:hidden">
        <div className="mp-mobile-nav px-2 py-2">
          <ul className="grid grid-cols-5 gap-1.5">
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) =>
                      `flex min-h-12 flex-col items-center justify-center rounded-md px-1.5 py-1 text-[11px] font-semibold leading-tight transition-colors ${
                        isActive ? "bg-[var(--ark-primary)] text-white" : "text-[var(--ark-ink-soft)]"
                      }`
                    }
                  >
                    <Icon className="h-4 w-4" aria-hidden={true} />
                    <span className="mt-0.5">{item.label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>
    </div>
  );
}
