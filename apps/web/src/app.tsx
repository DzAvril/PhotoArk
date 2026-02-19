import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getCurrentUser, getStoredAuthToken, logout, onAuthRequired, setStoredAuthToken } from "./lib/api";
import { AppShell } from "./layout/app-shell";
import { BackupsPage } from "./pages/backups-page";
import { DashboardPage } from "./pages/dashboard-page";
import { JobsPage } from "./pages/jobs-page";
import { LoginPage } from "./pages/login-page";
import { MediaPage } from "./pages/media-page";
import { SettingsPage } from "./pages/settings-page";
import { SettingsLayoutPage } from "./pages/settings-layout-page";
import { StoragesPage } from "./pages/storages-page";
import type { AuthUser } from "./types/api";

export function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    let canceled = false;

    async function bootstrapAuth() {
      const token = getStoredAuthToken();
      if (!token) {
        if (!canceled) {
          setAuthUser(null);
          setAuthChecked(true);
        }
        return;
      }

      try {
        const result = await getCurrentUser();
        if (!canceled) {
          setAuthUser(result.user);
        }
      } catch {
        setStoredAuthToken(null);
        if (!canceled) {
          setAuthUser(null);
        }
      } finally {
        if (!canceled) {
          setAuthChecked(true);
        }
      }
    }

    void bootstrapAuth();
    const unsubscribe = onAuthRequired(() => {
      setAuthUser(null);
      setAuthChecked(true);
    });

    return () => {
      canceled = true;
      unsubscribe();
    };
  }, []);

  async function handleLogout() {
    try {
      await logout();
    } catch {
      // noop: logout should always clear local token even if API returns error
    } finally {
      setStoredAuthToken(null);
      setAuthUser(null);
      setAuthChecked(true);
    }
  }

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[var(--ark-bg)] px-3 py-10 text-[var(--ark-ink)] md:px-6">
        <div className="mx-auto max-w-md">
          <section className="mp-panel p-6">
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--ark-primary)]">PhotoArk</p>
            <h1 className="mt-2 text-2xl font-bold">正在检查登录状态...</h1>
          </section>
        </div>
      </div>
    );
  }

  if (!authUser) {
    return <LoginPage onAuthenticated={setAuthUser} />;
  }

  return (
    <Routes>
      <Route path="/" element={<AppShell authUser={authUser} onLogout={handleLogout} />}>
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
