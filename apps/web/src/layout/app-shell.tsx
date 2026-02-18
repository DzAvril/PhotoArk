import { motion } from "framer-motion";
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
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-[-10%] top-[-12%] h-[320px] w-[320px] rounded-full bg-[var(--ark-mint)]/70 blur-3xl" />
        <div className="absolute right-[-8%] top-[18%] h-[340px] w-[340px] rounded-full bg-[var(--ark-warm)]/60 blur-3xl" />
        <div className="absolute left-[22%] bottom-[-14%] h-[400px] w-[400px] rounded-full bg-[var(--ark-ocean)]/40 blur-3xl" />
      </div>

      <main className="mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6 lg:px-8">
        <motion.header
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-3xl border border-white/40 bg-gradient-to-r from-[var(--ark-deep)] to-[var(--ark-ocean)] px-6 py-7 text-[var(--ark-paper)] shadow-[0_10px_50px_rgba(12,59,49,0.35)]"
        >
          <p className="text-xs uppercase tracking-[0.22em] text-[var(--ark-mint)]/90">PhotoArk Dashboard</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">面向 NAS 的照片方舟</h1>
          <p className="mt-3 max-w-2xl text-sm text-[var(--ark-paper)]/85">
            多目标同步、端到端加密、Live Photo 无损恢复，支持桌面与移动端管理。
          </p>

          <nav className="mt-5 flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className={({ isActive }) =>
                  `rounded-full px-4 py-2 text-sm transition ${
                    isActive ? "bg-[var(--ark-mint)] text-[var(--ark-deep)]" : "bg-white/15 text-[var(--ark-paper)]"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        </motion.header>

        <Outlet />
      </main>
    </div>
  );
}
