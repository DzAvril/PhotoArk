import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { createPreviewToken, getBackups, getPreview } from "../lib/api";
export function BackupsPage() {
    const [items, setItems] = useState([]);
    const [error, setError] = useState("");
    const [preview, setPreview] = useState(null);
    useEffect(() => {
        getBackups()
            .then((res) => setItems(res.items))
            .catch((err) => setError(err.message));
    }, []);
    async function handlePreview(assetId) {
        setError("");
        try {
            const tokenResult = await createPreviewToken(assetId);
            const previewResult = await getPreview(assetId, tokenResult.token);
            setPreview(previewResult);
        }
        catch (err) {
            setError(err.message);
        }
    }
    return (_jsxs("section", { className: "mt-6 rounded-3xl border border-white/40 bg-white/72 p-5 shadow-[0_8px_24px_rgba(11,41,33,0.09)] backdrop-blur", children: [_jsx("h2", { className: "text-lg font-semibold text-[var(--ark-deep)]", children: "\u5907\u4EFD\u6D4F\u89C8" }), _jsx("p", { className: "mt-1 text-xs text-amber-800", children: "115 \u52A0\u5BC6\u5BF9\u8C61\u9884\u89C8\u91C7\u7528\u4E00\u6B21\u6027 token + \u5185\u5B58\u89E3\u5BC6\u6D41\u3002" }), error ? _jsx("p", { className: "mt-3 rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800", children: error }) : null, preview ? (_jsxs("article", { className: "mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800", children: [_jsxs("p", { children: ["\u9884\u89C8\u8D44\u4EA7: ", preview.assetId] }), _jsxs("p", { children: ["\u6A21\u5F0F: ", preview.mode] }), _jsxs("p", { children: ["\u6D41\u5730\u5740: ", preview.streamUrl] })] })) : null, _jsx("div", { className: "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3", children: items.map((a) => (_jsxs("article", { className: "rounded-2xl border border-[var(--ark-line)] bg-[var(--ark-paper)] px-4 py-3", children: [_jsx("h3", { className: "font-medium text-[var(--ark-deep)]", children: a.name }), _jsxs("p", { className: "mt-1 text-xs text-[var(--ark-ink)]/70", children: ["\u7C7B\u578B: ", a.kind] }), _jsx("p", { className: "mt-1 text-xs text-[var(--ark-ink)]/70", children: a.encrypted ? "加密" : "明文" }), _jsx("button", { type: "button", onClick: () => void handlePreview(a.id), className: "mt-3 rounded-full bg-[var(--ark-deep)] px-3 py-1 text-xs text-[var(--ark-paper)]", children: "\u8BF7\u6C42\u9884\u89C8" })] }, a.id))) })] }));
}
