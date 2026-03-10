import { NavLink, Outlet } from "react-router-dom";
import { Bell, Database, FileText, SlidersHorizontal } from "lucide-react";

const tabs = [
  { to: "/settings", label: "通知", description: "Telegram 消息与连接参数", icon: "bell" },
  { to: "/settings/storages", label: "存储", description: "源目录、目标目录与挂载配置", icon: "storage" },
  { to: "/settings/jobs", label: "任务", description: "备份计划、监听模式与执行策略", icon: "job" },
  { to: "/settings/advanced", label: "高级", description: "诊断、索引与排障工具", icon: "advanced" }
];

function TabIcon({ kind }: { kind: (typeof tabs)[number]["icon"] }) {
  if (kind === "bell") {
    return <Bell className="h-4 w-4" aria-hidden="true" />;
  }
  if (kind === "storage") {
    return <Database className="h-4 w-4" aria-hidden="true" />;
  }
  if (kind === "job") {
    return <FileText className="h-4 w-4" aria-hidden="true" />;
  }
  if (kind === "advanced") {
    return <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />;
  }
  return <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />;
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
              className={({ isActive }) => `mp-nav-tile px-3 py-3 text-left ${isActive ? "mp-nav-tile-active" : ""}`}
            >
              {({ isActive }) => (
                <span className="flex items-start gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/10 bg-[color-mix(in_oklab,var(--ark-surface)_14%,transparent)]">
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
