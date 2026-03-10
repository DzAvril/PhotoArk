import { FormEvent, useEffect, useState } from "react";
import { InlineAlert } from "../components/inline-alert";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { bootstrapAdmin, getAuthStatus, login, setStoredAuthToken } from "../lib/api";
import type { AuthUser } from "../types/api";

type LoginPageProps = {
  onAuthenticated: (user: AuthUser) => void;
};

export function LoginPage({ onAuthenticated }: LoginPageProps) {
  const [checking, setChecking] = useState(true);
  const [hasUsers, setHasUsers] = useState(false);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getAuthStatus()
      .then((result) => {
        setHasUsers(result.hasUsers);
      })
      .catch((err) => {
        setError((err as Error).message);
      })
      .finally(() => setChecking(false));
  }, []);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setError("");
    const normalizedUsername = username.trim();
    if (!normalizedUsername) {
      setError("请输入用户名");
      return;
    }
    if (!password) {
      setError("请输入密码");
      return;
    }
    if (!hasUsers && password.length < 8) {
      setError("管理员密码至少需要 8 位");
      return;
    }
    if (!hasUsers && password !== confirmPassword) {
      setError("两次密码输入不一致");
      return;
    }

    setLoading(true);
    try {
      const result = hasUsers
        ? await login({ username: normalizedUsername, password })
        : await bootstrapAdmin({ username: normalizedUsername, password });
      setStoredAuthToken(result.token);
      onAuthenticated(result.user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[var(--ark-bg)] text-[var(--ark-ink)]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_10%_8%,color-mix(in_oklab,var(--ark-primary)_22%,transparent)_0%,transparent_36%),radial-gradient(circle_at_88%_84%,color-mix(in_oklab,var(--ark-accent)_14%,transparent)_0%,transparent_42%),linear-gradient(180deg,var(--ark-bg-soft),var(--ark-bg))]"
      />
      <div className="mx-auto flex min-h-screen w-full max-w-[1140px] items-center px-4 py-8 md:px-8 md:py-10">
        <div className="grid w-full gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card variant="panelHero" className="relative hidden overflow-hidden p-8 lg:flex lg:flex-col lg:justify-between">
            <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--ark-primary)]/12 blur-2xl" />
            <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-20 h-64 w-64 rounded-full bg-[var(--ark-accent)]/14 blur-3xl" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-[var(--ark-line)] bg-[color-mix(in_oklab,var(--ark-surface)_78%,transparent)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ark-ink)]">
                <img src="/logo.svg" alt="PhotoArk logo" className="h-4 w-4 rounded-sm" />
                PhotoArk
              </div>
              <h1 className="mt-5 text-[44px] font-semibold leading-[1.1] tracking-[-0.02em]">
                照片备份
                <br />
                管理控制台
              </h1>
              <p className="mt-4 max-w-[560px] text-base leading-7 mp-muted">
                面向 NAS 与多目标存储的统一入口，聚焦安全备份、差异校验和稳定同步。
              </p>
            </div>

            <div className="relative grid gap-3 text-sm">
              <div className="mp-subtle-card px-4 py-3">多存储目标统一管理</div>
              <div className="mp-subtle-card px-4 py-3">定时任务与目录监听并行</div>
              <div className="mp-subtle-card px-4 py-3">可追踪执行历史与差异状态</div>
            </div>
          </Card>

          <Card variant="panel" className="p-6 sm:p-7">
            <div className="flex items-center gap-2">
              <img src="/logo.svg" alt="PhotoArk logo" className="h-9 w-9 rounded-xl border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-1.5 shadow-sm" />
              <p className="text-[13px] font-semibold uppercase tracking-[0.22em] text-[var(--ark-primary)]">PhotoArk</p>
            </div>

            <h2 className="mt-4 mp-h2">{checking ? "加载中..." : hasUsers ? "登录" : "初始化管理员账号"}</h2>
            <p className="mt-2 text-sm leading-6 mp-muted">
              {hasUsers ? "输入账号与密码以继续。" : "首次使用请先创建管理员账号，创建后将自动登录。"}
            </p>

            {!checking && !hasUsers ? (
              <div className="mt-4">
                <InlineAlert tone="info">建议使用仅管理员知晓的高强度密码，长度至少 8 位。</InlineAlert>
              </div>
            ) : null}

            {error ? (
              <div className="mt-4">
                <InlineAlert tone="error" onClose={() => setError("")}> 
                  {error}
                </InlineAlert>
              </div>
            ) : null}

            <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label htmlFor="auth-username" className="mp-caption font-semibold uppercase tracking-[0.08em] mp-muted">
                  用户名
                </label>
                <input
                  id="auth-username"
                  className="mp-input mt-1.5 min-h-12 px-4 text-base"
                  placeholder="admin"
                  value={username}
                  autoComplete="username"
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={checking || loading}
                />
              </div>

              <div>
                <label htmlFor="auth-password" className="mp-caption font-semibold uppercase tracking-[0.08em] mp-muted">
                  密码
                </label>
                <input
                  id="auth-password"
                  className="mp-input mt-1.5 min-h-12 px-4 text-base"
                  type="password"
                  placeholder="至少 8 位"
                  value={password}
                  autoComplete={hasUsers ? "current-password" : "new-password"}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={checking || loading}
                />
              </div>

              {!hasUsers ? (
                <div>
                  <label htmlFor="auth-confirm-password" className="mp-caption font-semibold uppercase tracking-[0.08em] mp-muted">
                    确认密码
                  </label>
                  <input
                    id="auth-confirm-password"
                    className="mp-input mt-1.5 min-h-12 px-4 text-base"
                    type="password"
                    placeholder="再次输入密码"
                    value={confirmPassword}
                    autoComplete="new-password"
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={checking || loading}
                  />
                </div>
              ) : null}

              <div>
                <Button
                  type="submit"
                  variant="primary"
                  busy={loading}
                  disabled={checking}
                  className="min-h-12 w-full text-base"
                >
                  {loading ? "提交中..." : hasUsers ? "登录" : "创建管理员并登录"}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
