import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { getCurrentUser, getStoredAuthToken, logout, onAuthRequired, setStoredAuthToken } from "./lib/api";
import type { AuthUser } from "./types/api";

import { AppShell } from "./layout/app-shell";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60000,
      gcTime: 300000,
    },
  },
});
import { AdvancedSettingsPage } from "./pages/advanced-settings-page";
import { BackupsPage } from "./pages/backups-page";
import { LoginPage } from "./pages/login-page";
import { PerformancePage } from "./pages/performance-page";
import { SettingsLayoutPage } from "./pages/settings-layout-page";
import { SettingsPage } from "./pages/settings-page";
import { StoragesPage } from "./pages/storages-page";

const DashboardPage = lazy(() =>
  import("./pages/dashboard-page").then((m) => ({ default: m.DashboardPage }))
);
const MediaPage = lazy(() =>
  import("./pages/media-page").then((m) => ({ default: m.MediaPage }))
);
const SyncPage = lazy(() =>
  import("./pages/sync-page").then((m) => ({ default: m.SyncPage }))
);

import { ViewCacheProvider } from "./context/view-cache-context";

function PageLoading() {
  return (
    <div className="flex min-h-[400px] items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--ark-primary)] border-t-transparent" />
        <p className="text-sm text-[var(--ark-ink-soft)]">加载中...</p>
      </div>
    </div>
  );
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
      <QueryClientProvider client={queryClient}>
        <div className="min-h-screen bg-[var(--ark-bg)] px-3 py-10 text-[var(--ark-ink)] md:px-6">
          <div className="mx-auto max-w-md">
            <section className="mp-panel p-6">
              <p className="mp-kicker mp-kicker-primary">PhotoArk</p>
              <h1 className="mt-2 text-2xl font-bold">正在检查登录状态...</h1>
            </section>
          </div>
        </div>
      </QueryClientProvider>
    );
  }

  if (!authUser) {
    return (
      <QueryClientProvider client={queryClient}>
        <LoginPage onAuthenticated={setAuthUser} />
      </QueryClientProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ViewCacheProvider>
        <Routes>
          <Route path="/" element={<AppShell authUser={authUser} onLogout={handleLogout} />}>
            <Route
              index
              element={
                <Suspense fallback={<PageLoading />}>
                  <DashboardPage />
                </Suspense>
              }
            />
            <Route
              path="media"
              element={
                <Suspense fallback={<PageLoading />}>
                  <MediaPage />
                </Suspense>
              }
            />
            <Route
              path="sync"
              element={
                <Suspense fallback={<PageLoading />}>
                  <SyncPage />
                </Suspense>
              }
            />
            <Route path="records" element={<BackupsPage />} />
            {import.meta.env.DEV && <Route path="performance" element={<PerformancePage />} />}
            <Route path="diff" element={<Navigate to="/sync" replace />} />
            <Route path="jobs" element={<Navigate to="/sync?tab=jobs" replace />} />
            <Route path="settings/jobs" element={<Navigate to="/sync?tab=jobs" replace />} />
            <Route path="backups" element={<Navigate to="/records" replace />} />
            <Route path="storages" element={<Navigate to="/settings/storages" replace />} />
            <Route path="settings" element={<SettingsLayoutPage />}>
              <Route index element={<SettingsPage />} />
              <Route path="notifications" element={<SettingsPage />} />
              <Route path="storages" element={<StoragesPage />} />
              <Route path="diff" element={<Navigate to="/diff" replace />} />
              <Route path="advanced" element={<AdvancedSettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ViewCacheProvider>
    </QueryClientProvider>
  );
}
