import { NavLink, Outlet } from "react-router-dom";
import { settingsNavItems } from "../navigation/navigation-model";

export function SettingsLayoutPage() {
  return (
    <section className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="mp-panel mp-panel-soft p-4">
        <div className="mb-4 hidden lg:block">
          <h3 className="text-base font-semibold">设置导航</h3>
          <p className="mt-1 text-sm mp-muted">统一管理通知、存储与诊断配置。</p>
        </div>
        <nav className="hidden space-y-2 lg:block">
          {settingsNavItems.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `flex items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all ${
                    isActive
                      ? "border-transparent bg-[var(--ark-primary)] text-white shadow-[0_12px_24px_color-mix(in_oklab,var(--ark-primary)_30%,transparent)]"
                      : "border-[var(--ark-line)] bg-[var(--ark-surface)] hover:border-[var(--ark-line-strong)] hover:bg-[var(--ark-surface-soft)]"
                  }`
                }
              >
                {({ isActive }) => (
                  <span className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-current/10 bg-white/10">
                      <Icon className="h-4 w-4" aria-hidden={true} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{tab.label}</span>
                      <span className={`mt-1 block text-xs leading-5 ${isActive ? "text-white/80" : "mp-muted"}`}>{tab.description}</span>
                    </span>
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="lg:hidden">
          <div className="mb-3">
            <h3 className="text-base font-semibold">设置</h3>
            <p className="mt-1 text-xs mp-muted">左右滑动快速切换配置模块。</p>
          </div>
          <nav className="flex items-center gap-2 overflow-x-auto pb-1">
            {settingsNavItems.map((tab) => {
              const Icon = tab.icon;
              return (
                <NavLink
                  key={`mobile:${tab.to}`}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    `inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-all ${
                      isActive
                        ? "border-transparent bg-[var(--ark-primary)] text-white shadow-[0_10px_20px_color-mix(in_oklab,var(--ark-primary)_30%,transparent)]"
                        : "border-[var(--ark-line)] bg-[var(--ark-surface)] text-[var(--ark-ink)]"
                    }`
                  }
                >
                  <Icon className="h-4 w-4" aria-hidden={true} />
                  <span>{tab.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="min-h-0">
        <Outlet />
      </div>
    </section>
  );
}
