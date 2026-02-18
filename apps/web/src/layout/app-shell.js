import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from "framer-motion";
import { NavLink, Outlet } from "react-router-dom";
const tabs = [
    { to: "/", label: "总览" },
    { to: "/storages", label: "存储" },
    { to: "/jobs", label: "任务" },
    { to: "/backups", label: "备份" }
];
export function AppShell() {
    return (_jsxs("div", { className: "min-h-screen bg-[var(--ark-bg)] text-[var(--ark-ink)]", children: [_jsxs("div", { className: "pointer-events-none fixed inset-0 -z-10 overflow-hidden", children: [_jsx("div", { className: "absolute left-[-10%] top-[-12%] h-[320px] w-[320px] rounded-full bg-[var(--ark-mint)]/70 blur-3xl" }), _jsx("div", { className: "absolute right-[-8%] top-[18%] h-[340px] w-[340px] rounded-full bg-[var(--ark-warm)]/60 blur-3xl" }), _jsx("div", { className: "absolute left-[22%] bottom-[-14%] h-[400px] w-[400px] rounded-full bg-[var(--ark-ocean)]/40 blur-3xl" })] }), _jsxs("main", { className: "mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6 lg:px-8", children: [_jsxs(motion.header, { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4 }, className: "rounded-3xl border border-white/40 bg-gradient-to-r from-[var(--ark-deep)] to-[var(--ark-ocean)] px-6 py-7 text-[var(--ark-paper)] shadow-[0_10px_50px_rgba(12,59,49,0.35)]", children: [_jsx("p", { className: "text-xs uppercase tracking-[0.22em] text-[var(--ark-mint)]/90", children: "PhotoArk Dashboard" }), _jsx("h1", { className: "mt-2 text-3xl font-semibold tracking-tight sm:text-4xl", children: "\u9762\u5411 NAS \u7684\u7167\u7247\u65B9\u821F" }), _jsx("p", { className: "mt-3 max-w-2xl text-sm text-[var(--ark-paper)]/85", children: "\u591A\u76EE\u6807\u540C\u6B65\u3001\u7AEF\u5230\u7AEF\u52A0\u5BC6\u3001Live Photo \u65E0\u635F\u6062\u590D\uFF0C\u652F\u6301\u684C\u9762\u4E0E\u79FB\u52A8\u7AEF\u7BA1\u7406\u3002" }), _jsx("nav", { className: "mt-5 flex flex-wrap gap-2", children: tabs.map((tab) => (_jsx(NavLink, { to: tab.to, className: ({ isActive }) => `rounded-full px-4 py-2 text-sm transition ${isActive ? "bg-[var(--ark-mint)] text-[var(--ark-deep)]" : "bg-white/15 text-[var(--ark-paper)]"}`, children: tab.label }, tab.to))) })] }), _jsx(Outlet, {})] })] }));
}
