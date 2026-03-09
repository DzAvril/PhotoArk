import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/settings", label: "通知", icon: "bell" },
  { to: "/settings/storages", label: "存储", icon: "storage" },
  { to: "/settings/jobs", label: "任务", icon: "job" },
  { to: "/settings/advanced", label: "高级", icon: "advanced" }
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
      <div className="mp-panel mp-panel-soft p-3">
        <nav className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/settings"}
              className={({ isActive }) =>
                `rounded-xl border px-3 py-2 text-center text-sm font-medium transition-all ${
                  isActive
                    ? "border-[var(--ark-primary)] bg-[var(--ark-primary)] text-white shadow-[0_8px_20px_color-mix(in_oklab,var(--ark-primary)_28%,transparent)]"
                    : "border-[var(--ark-line)] bg-[var(--ark-surface)] text-[var(--ark-ink)] hover:border-[var(--ark-line-strong)] hover:bg-[var(--ark-surface-soft)]"
                }`
              }
            >
              <span className="inline-flex items-center gap-1.5">
                <TabIcon kind={tab.icon} />
                <span>{tab.label}</span>
              </span>
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
