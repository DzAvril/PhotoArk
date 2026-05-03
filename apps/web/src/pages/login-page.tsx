import React, { FormEvent, useEffect, useState } from "react";
import { InlineAlert } from "../components/inline-alert";
import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Field } from "../components/ui/field";
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
    <div className="min-h-screen bg-[var(--ark-bg)] px-4 py-8 text-[var(--ark-ink)]">
      <main className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[960px] items-center gap-4 md:grid-cols-[minmax(0,0.9fr)_420px]">
        <section className="hidden md:block">
          <div className="flex items-center gap-3">
            <img
              src="/logo.svg"
              alt="PhotoArk logo"
              className="h-11 w-11 rounded-md border border-[var(--ark-line)] bg-[var(--ark-surface)] p-1.5 shadow-sm"
            />
            <div>
              <h1 className="text-2xl font-semibold leading-tight">PhotoArk</h1>
              <p className="mt-1 text-sm mp-muted">照片备份与同步控制台</p>
            </div>
          </div>

          <div className="mt-8 max-w-[420px] border-l border-[var(--ark-line)] pl-4">
            <p className="text-sm leading-6 mp-muted">面向 NAS 与多目标存储的私有照片工作台。</p>
            <dl className="mt-5 grid gap-4 text-sm">
              <div>
                <dt className="font-semibold">同步工作流</dt>
                <dd className="mt-1 mp-muted">差异检查、任务执行和审计记录集中处理。</dd>
              </div>
              <div>
                <dt className="font-semibold">媒体库</dt>
                <dd className="mt-1 mp-muted">按存储浏览图片、视频与 Live Photo。</dd>
              </div>
              <div>
                <dt className="font-semibold">系统配置</dt>
                <dd className="mt-1 mp-muted">通知、存储和维护入口保持在同一控制台。</dd>
              </div>
            </dl>
          </div>
        </section>

        <Card variant="panel" className="p-5 sm:p-6">
          <div className="flex items-center gap-3 md:hidden">
            <img
              src="/logo.svg"
              alt="PhotoArk logo"
              className="h-10 w-10 rounded-md border border-[var(--ark-line)] bg-[var(--ark-surface-soft)] p-1.5 shadow-sm"
            />
            <div>
              <p className="mp-kicker mp-kicker-primary">PhotoArk</p>
              <p className="text-xs mp-muted">安全备份与同步</p>
            </div>
          </div>

          <h2 className="mt-4 mp-h2 md:mt-0">{checking ? "加载中..." : hasUsers ? "欢迎回来" : "初始化管理员账号"}</h2>
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
            <Field id="auth-username" label="用户名">
              <input
                id="auth-username"
                className="mp-input min-h-12 px-4 text-base"
                placeholder="admin"
                value={username}
                autoComplete="username"
                onChange={(e) => setUsername(e.target.value)}
                disabled={checking || loading}
              />
            </Field>

            <Field id="auth-password" label="密码">
              <input
                id="auth-password"
                className="mp-input min-h-12 px-4 text-base"
                type="password"
                placeholder="至少 8 位"
                value={password}
                autoComplete={hasUsers ? "current-password" : "new-password"}
                onChange={(e) => setPassword(e.target.value)}
                disabled={checking || loading}
              />
            </Field>

            {!hasUsers ? (
              <Field id="auth-confirm-password" label="确认密码">
                <input
                  id="auth-confirm-password"
                  className="mp-input min-h-12 px-4 text-base"
                  type="password"
                  placeholder="再次输入密码"
                  value={confirmPassword}
                  autoComplete="new-password"
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={checking || loading}
                />
              </Field>
            ) : null}

            <Button type="submit" variant="primary" busy={loading} disabled={checking} className="min-h-12 w-full text-base">
              {loading ? "提交中..." : hasUsers ? "登录" : "创建管理员并登录"}
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
