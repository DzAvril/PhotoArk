import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/app-shell";
import { BackupsPage } from "./pages/backups-page";
import { DashboardPage } from "./pages/dashboard-page";
import { JobsPage } from "./pages/jobs-page";
import { StoragesPage } from "./pages/storages-page";
export function App() {
    return (_jsxs(Routes, { children: [_jsxs(Route, { path: "/", element: _jsx(AppShell, {}), children: [_jsx(Route, { index: true, element: _jsx(DashboardPage, {}) }), _jsx(Route, { path: "storages", element: _jsx(StoragesPage, {}) }), _jsx(Route, { path: "jobs", element: _jsx(JobsPage, {}) }), _jsx(Route, { path: "backups", element: _jsx(BackupsPage, {}) })] }), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/", replace: true }) })] }));
}
