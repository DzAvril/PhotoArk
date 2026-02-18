import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { motion } from "framer-motion";
export function MetricCard({ title, value, meta, icon }) {
    return (_jsxs(motion.article, { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.45 }, className: "rounded-2xl border border-white/40 bg-white/70 p-4 shadow-[0_8px_30px_rgba(11,41,33,0.09)] backdrop-blur", children: [_jsx("div", { className: "mb-4 inline-flex rounded-xl bg-[var(--ark-deep)]/90 p-2 text-[var(--ark-mint)]", children: icon }), _jsx("p", { className: "text-sm text-[var(--ark-ink)]/70", children: title }), _jsx("p", { className: "mt-1 text-2xl font-semibold tracking-tight text-[var(--ark-deep)]", children: value }), _jsx("p", { className: "mt-1 text-xs text-[var(--ark-ink)]/60", children: meta })] }));
}
