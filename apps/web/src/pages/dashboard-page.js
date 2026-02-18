import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { MetricCard } from "../components/metric-card";
import { getMetrics } from "../lib/api";
const emptyMetrics = {
    storageTargets: 0,
    backupJobs: 0,
    encryptedAssets: 0,
    livePhotoPairs: 0
};
export function DashboardPage() {
    const [metrics, setMetrics] = useState(emptyMetrics);
    const [error, setError] = useState("");
    useEffect(() => {
        getMetrics()
            .then(setMetrics)
            .catch((err) => setError(err.message));
    }, []);
    return (_jsxs("section", { className: "mt-6", children: [error ? _jsx("p", { className: "rounded-xl bg-red-100 px-3 py-2 text-sm text-red-800", children: error }) : null, _jsxs("div", { className: "grid gap-3 sm:grid-cols-2 lg:grid-cols-4", children: [_jsx(MetricCard, { title: "\u76EE\u6807\u5B58\u50A8", value: String(metrics.storageTargets), meta: "NAS / SSD / 115", icon: _jsx("span", { children: "\u2B22" }) }), _jsx(MetricCard, { title: "\u5907\u4EFD\u4EFB\u52A1", value: String(metrics.backupJobs), meta: "\u5B9A\u65F6 + \u6587\u4EF6\u76D1\u542C", icon: _jsx("span", { children: "\u25C8" }) }), _jsx(MetricCard, { title: "\u52A0\u5BC6\u5BF9\u8C61", value: String(metrics.encryptedAssets), meta: "AES-256-GCM", icon: _jsx("span", { children: "\u25CD" }) }), _jsx(MetricCard, { title: "Live Photo \u5BF9", value: String(metrics.livePhotoPairs), meta: "HEIC/JPG + MOV", icon: _jsx("span", { children: "\u25CE" }) })] })] }));
}
