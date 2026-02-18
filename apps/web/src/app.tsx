import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/app-shell";
import { BackupsPage } from "./pages/backups-page";
import { DashboardPage } from "./pages/dashboard-page";
import { JobsPage } from "./pages/jobs-page";
import { MediaPage } from "./pages/media-page";
import { StoragesPage } from "./pages/storages-page";

export function App() {
  return (
    <Routes>
      <Route path="/" element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="storages" element={<StoragesPage />} />
        <Route path="jobs" element={<JobsPage />} />
        <Route path="media" element={<MediaPage />} />
        <Route path="backups" element={<BackupsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
