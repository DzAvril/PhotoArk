import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/settings", label: "通知", description: "Telegram 消息与连接参数", icon: "bell" },
  { to: "/settings/storages", label: "存储", description: "源目录、目标目录与挂载配置", icon: "storage" },
  { to: "/settings/jobs", label: "任务", description: "备份计划、监听模式与执行策略", icon: "job" },
  { to: "/settings/advanced", label: "高级", description: "诊断、索引与排障工具", icon: "advanced" }
];

function TabIcon({ kind }: { kind: (typeof tabs)[number]["icon"] }) {
  if (kind === "bell") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path d="M10 3.5a3.3 3.3 0 0 0-3.3 3.3v1.5c0 .8-.3 1.6-.8 2.2L4.3 12a1 1 0 0 0 .7 1.7h10a1 1 0 0 0 .7-1.7l-1.6-1.5a3.2 3.2 0 0 1-.8-2.2V6.8A3.3 3.3 0 0 0 10 3.5Z" stroke="currentColor" strokeWidth="1.6" />
        <path d="M8.3 14.2a1.8 1.8 0 0 0 3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "storage") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <ellipse cx="10" cy="5.2" rx="5.8" ry="2.3" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4.2 5.2v6.4c0 1.3 2.6 2.3 5.8 2.3s5.8-1 5.8-2.3V5.2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M4.2 8.4c0 1.3 2.6 2.3 5.8 2.3s5.8-1 5.8-2.3" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (kind === "job") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <rect x="3.1" y="4" width="13.8" height="11.8" rx="2" stroke="currentColor" strokeWidth="1.6" />
        <path d="M6.5 8.2h7M6.5 11h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "advanced") {
    return (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
        <path
          d="M10 3.7a1 1 0 0 1 1.8-.6l.4.6c.2.3.5.4.8.4l.8-.1a1 1 0 0 1 1.1 1.5l-.4.7a.9.9 0 0 0 0 .8l.4.7a1 1 0 0 1-1.1 1.5l-.8-.1a.9.9 0 0 0-.8.4l-.4.6a1 1 0 0 1-1.8 0l-.4-.6a.9.9 0 0 0-.8-.4l-.8.1a1 1 0 0 1-1.1-1.5l.4-.7a.9.9 0 0 0 0-.8l-.4-.7A1 1 0 0 1 7 4l.8.1c.3.1.6-.1.8-.4l.4-.6A1 1 0 0 1 10 3.7Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="10" cy="7" r="1.5" fill="currentColor" />
        <path d="M10 10.5v4.3M8.1 13.1h3.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" aria-hidden="true">
      <path d="M3.5 5h12.8M3.5 10h12.8M3.5 15h12.8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="6.2" cy="5" r="1.4" fill="currentColor" />
      <circle cx="13.8" cy="10" r="1.4" fill="currentColor" />
      <circle cx="8.8" cy="15" r="1.4" fill="currentColor" />
    </svg>
  );
}

export function SettingsLayoutPage() {
  return (
    <section className="space-y-4 md:flex md:h-full md:flex-col">
      <div className="mp-panel mp-panel-soft p-3.5">
        <div className="mb-3">
          <h3 className="text-base font-semibold">设置导航</h3>
          <p className="mt-1 text-sm mp-muted">统一管理通知、存储、任务与诊断配置。</p>
        </div>
        <nav className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/settings"}
              className={({ isActive }) =>
                `rounded-2xl border px-3 py-3 text-left transition-all ${
                  isActive
                    ? "border-[var(--ark-primary)] bg-[var(--ark-primary)] text-white shadow-[0_10px_24px_color-mix(in_oklab,var(--ark-primary)_28%,transparent)]"
                    : "border-[var(--ark-line)] bg-[var(--ark-surface)] text-[var(--ark-ink)] hover:border-[var(--ark-line-strong)] hover:bg-[var(--ark-surface-soft)]"
                }`
              }
            >
              {({ isActive }) => (
                <span className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/10 bg-white/10">
                    <TabIcon kind={tab.icon} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{tab.label}</span>
                    <span className={`mt-1 block text-xs leading-5 ${isActive ? "text-white/80" : "mp-muted"}`}>{tab.description}</span>
                  </span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="md:min-h-0 md:flex-1">
        <Outlet />
      </div>
    </section>
  );
}
