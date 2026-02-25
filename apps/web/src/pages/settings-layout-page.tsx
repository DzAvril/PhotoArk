import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/settings", label: "通知" },
  { to: "/settings/storages", label: "存储" },
  { to: "/settings/jobs", label: "任务" }
];

export function SettingsLayoutPage() {
  return (
    <section className="space-y-4">
      <div className="mp-panel mp-panel-soft p-3">
        <nav className="grid grid-cols-3 gap-2">
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
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </section>
  );
}
