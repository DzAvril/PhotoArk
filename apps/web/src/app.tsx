import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { getCurrentUser, getStoredAuthToken, logout, onAuthRequired, setStoredAuthToken } from "./lib/api";
import type { AuthUser } from "./types/api";

const AppShell = lazy(() => import("./layout/app-shell").then((module) => ({ default: module.AppShell })));
const DashboardPage = lazy(() => import("./pages/dashboard-page").then((module) => ({ default: module.DashboardPage })));
const MediaPage = lazy(() => import("./pages/media-page").then((module) => ({ default: module.MediaPage })));
const JobDiffPage = lazy(() => import("./pages/job-diff-page").then((module) => ({ default: module.JobDiffPage })));
const BackupsPage = lazy(() => import("./pages/backups-page").then((module) => ({ default: module.BackupsPage })));
const LoginPage = lazy(() => import("./pages/login-page").then((module) => ({ default: module.LoginPage })));
const SettingsLayoutPage = lazy(() =>
  import("./pages/settings-layout-page").then((module) => ({ default: module.SettingsLayoutPage }))
);
const SettingsPage = lazy(() => import("./pages/settings-page").then((module) => ({ default: module.SettingsPage })));
const StoragesPage = lazy(() => import("./pages/storages-page").then((module) => ({ default: module.StoragesPage })));
const JobsPage = lazy(() => import("./pages/jobs-page").then((module) => ({ default: module.JobsPage })));
const AdvancedSettingsPage = lazy(() =>
  import("./pages/advanced-settings-page").then((module) => ({ default: module.AdvancedSettingsPage }))
);

function RouteFallback() {
  return (
    <div className="min-h-[40vh] px-1 py-2 text-[var(--ark-ink)]">
      <section className="mp-panel p-5">
        <p className="text-sm uppercase tracking-[0.18em] text-[var(--ark-primary)]">PhotoArk</p>
        <p className="mt-2 text-base font-semibold">页面加载中...</p>
      </section>
    </div>
  );
}

function withSuspense(element: ReactNode) {
  return <Suspense fallback={<RouteFallback />}>{element}</Suspense>;
}

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
    return withSuspense(<LoginPage onAuthenticated={setAuthUser} />);
  }

  return (
    <Routes>
      <Route path="/" element={withSuspense(<AppShell authUser={authUser} onLogout={handleLogout} />)}>
        <Route index element={withSuspense(<DashboardPage />)} />
        <Route path="media" element={withSuspense(<MediaPage />)} />
        <Route path="diff" element={withSuspense(<JobDiffPage />)} />
        <Route path="records" element={withSuspense(<BackupsPage />)} />
        <Route path="backups" element={<Navigate to="/records" replace />} />
        <Route path="storages" element={<Navigate to="/settings/storages" replace />} />
        <Route path="jobs" element={<Navigate to="/settings/jobs" replace />} />
        <Route path="settings" element={withSuspense(<SettingsLayoutPage />)}>
          <Route index element={withSuspense(<SettingsPage />)} />
          <Route path="notifications" element={withSuspense(<SettingsPage />)} />
          <Route path="storages" element={withSuspense(<StoragesPage />)} />
          <Route path="jobs" element={withSuspense(<JobsPage />)} />
          <Route path="diff" element={<Navigate to="/diff" replace />} />
          <Route path="advanced" element={withSuspense(<AdvancedSettingsPage />)} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
