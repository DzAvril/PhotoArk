import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/settings", label: "通知" },
  { to: "/settings/storages", label: "存储" },
  { to: "/settings/jobs", label: "任务" }
];

export function SettingsLayoutPage() {
  return (
    <section className="space-y-3">
      <div className="mp-panel mp-panel-soft p-3">
        <nav className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.to === "/settings"}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive ? "bg-[var(--ark-primary)] text-white" : "bg-[var(--ark-surface-soft)] text-[var(--ark-ink)]"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </section>
  );
}
