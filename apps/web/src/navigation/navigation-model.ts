import type { ComponentType } from "react";
import {
  Activity,
  Archive,
  BarChart3,
  Database,
  GitCompareArrows,
  Images,
  ListChecks,
  Settings,
  SlidersHorizontal
} from "lucide-react";

export type NavIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export type PrimaryNavItem = {
  to: "/" | "/media" | "/sync" | "/records" | "/settings";
  label: string;
  description: string;
  icon: NavIcon;
};

export type SecondaryNavItem = {
  to: string;
  label: string;
  description: string;
  icon: NavIcon;
  end?: boolean;
};

export type SyncTabValue = "diff" | "jobs" | "running";

export const primaryNavItems: PrimaryNavItem[] = [
  { to: "/", label: "概览", description: "容量、媒体分布、趋势与风险", icon: BarChart3 },
  { to: "/media", label: "媒体库", description: "浏览图片、视频与 Live Photo", icon: Images },
  { to: "/sync", label: "同步", description: "差异检查、任务与执行中队列", icon: GitCompareArrows },
  { to: "/records", label: "记录", description: "执行历史、失败与审计", icon: ListChecks },
  { to: "/settings", label: "配置", description: "通知、存储与维护", icon: Settings }
];

export const syncTabs: Array<{ value: SyncTabValue; label: string; description: string; icon: NavIcon }> = [
  { value: "diff", label: "差异检查", description: "对比源目录和目标目录", icon: GitCompareArrows },
  { value: "jobs", label: "同步任务", description: "管理计划、监听与路径", icon: Archive },
  { value: "running", label: "执行中", description: "查看队列、进度与取消", icon: Activity }
];

export const settingsNavItems: SecondaryNavItem[] = [
  { to: "/settings", label: "通知", description: "Telegram 消息与连接参数", icon: Settings, end: true },
  { to: "/settings/storages", label: "存储", description: "源目录、目标目录与挂载配置", icon: Database },
  { to: "/settings/advanced", label: "高级", description: "索引、诊断与维护工具", icon: SlidersHorizontal }
];

export function normalizePathname(pathname: string): string {
  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function getLegacyRedirectTarget(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  if (normalized === "/diff") return "/sync";
  if (normalized === "/jobs") return "/sync?tab=jobs";
  if (normalized === "/settings/jobs") return "/sync?tab=jobs";
  if (normalized === "/storages") return "/settings/storages";
  if (normalized === "/backups") return "/records";
  return null;
}

export function getPageMeta(pathname: string): { title: string; subtitle: string } {
  const normalized = normalizePathname(pathname);
  if (normalized === "/") return { title: "概览", subtitle: "容量、媒体分布、趋势、风险与最近活动" };
  if (normalized === "/media") return { title: "媒体库", subtitle: "按存储浏览图片、视频与 Live Photo" };
  if (normalized.startsWith("/sync")) return { title: "同步", subtitle: "差异检查、同步任务与执行中队列" };
  if (normalized === "/records") return { title: "记录", subtitle: "查看执行历史、失败明细与审计记录" };
  if (normalized === "/settings/storages") return { title: "存储配置", subtitle: "管理源存储、目标存储、容量与路径" };
  if (normalized === "/settings/advanced") return { title: "高级配置", subtitle: "索引、诊断与维护工具" };
  if (normalized.startsWith("/settings")) return { title: "配置", subtitle: "通知、存储与维护设置" };
  return { title: "PhotoArk", subtitle: "照片备份与多目标同步控制台" };
}
