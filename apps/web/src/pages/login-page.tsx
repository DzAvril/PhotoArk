import { FormEvent, useEffect, useState } from "react";
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
    <div className="min-h-screen bg-[var(--ark-bg)] px-3 py-10 text-[var(--ark-ink)] md:px-6">
      <div className="mx-auto max-w-md">
        <section className="mp-panel p-6">
          <p className="text-sm uppercase tracking-[0.2em] text-[var(--ark-primary)]">PhotoArk</p>
          <h1 className="mt-2 text-2xl font-bold">{checking ? "加载中..." : hasUsers ? "登录" : "初始化管理员账号"}</h1>
          <p className="mt-2 text-sm mp-muted">
            {hasUsers ? "请输入账号密码进入系统。" : "首次使用请先创建管理员账号，创建后将自动登录。"}
          </p>

          {error ? <p className="mp-error mt-3">{error}</p> : null}

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="auth-username" className="text-sm font-medium">
                用户名
              </label>
              <input
                id="auth-username"
                className="mp-input mt-1"
                placeholder="admin"
                value={username}
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
                disabled={checking || loading}
              />
            </div>

            <div>
              <label htmlFor="auth-password" className="text-sm font-medium">
                密码
              </label>
              <input
                id="auth-password"
                className="mp-input mt-1"
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
                <label htmlFor="auth-confirm-password" className="text-sm font-medium">
                  确认密码
                </label>
                <input
                  id="auth-confirm-password"
                  className="mp-input mt-1"
                  type="password"
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={checking || loading}
                />
              </div>
            ) : null}

            <button type="submit" className="mp-btn mp-btn-primary w-full" disabled={checking || loading}>
              {loading ? "提交中..." : hasUsers ? "登录" : "创建管理员并登录"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
