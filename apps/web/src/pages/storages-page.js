import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { getStorages } from "../lib/api";
export function StoragesPage() {
    const [items, setItems] = useState([]);
    const [error, setError] = useState("");
    useEffect(() => {
        getStorages()
            .then((res) => setItems(res.items))
            .catch((err) => setError(err.message));
    }, []);
    return (_jsxs("section", { className: "mt-6 rounded-3xl border border-white/40 bg-white/72 p-5 shadow-[0_8px_24px_rgba(11,41,33,0.09)] backdrop-blur", children: [_jsx("h2", { className: "text-lg font-semibold text-[var(--ark-deep)]", children: "\u76EE\u6807\u5B58\u50A8" }), error ? _jsx("p", { className: "mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800", children: error }) : null, _jsx("div", { className: "mt-3 grid gap-3 sm:grid-cols-2", children: items.map((s) => (_jsxs("article", { className: "rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-paper)] px-4 py-3", children: [_jsxs("div", { className: "flex items-center justify-between", children: [_jsx("h3", { className: "font-medium text-[var(--ark-deep)]", children: s.name }), _jsx("span", { className: "text-xs text-[var(--ark-ink)]/70", children: s.type })] }), _jsx("p", { className: "mt-1 text-xs text-[var(--ark-ink)]/70", children: s.basePath }), _jsx("p", { className: "mt-1 text-xs text-[var(--ark-ink)]/70", children: s.encrypted ? "加密存储" : "明文存储" })] }, s.id))) })] }));
}
