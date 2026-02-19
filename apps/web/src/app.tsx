import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/app-shell";
import { BackupsPage } from "./pages/backups-page";
import { DashboardPage } from "./pages/dashboard-page";
import { JobsPage } from "./pages/jobs-page";
import { MediaPage } from "./pages/media-page";
import { SettingsPage } from "./pages/settings-page";
import { SettingsLayoutPage } from "./pages/settings-layout-page";
import { StoragesPage } from "./pages/storages-page";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="records" element={<BackupsPage />} />
        <Route path="backups" element={<Navigate to="/records" replace />} />
        <Route path="storages" element={<Navigate to="/settings/storages" replace />} />
        <Route path="jobs" element={<Navigate to="/settings/jobs" replace />} />
        <Route path="settings" element={<SettingsLayoutPage />}>
          <Route index element={<SettingsPage />} />
          <Route path="notifications" element={<SettingsPage />} />
          <Route path="storages" element={<StoragesPage />} />
          <Route path="jobs" element={<JobsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
