# PhotoArk UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the PhotoArk web UI into a polished operational console with full desktop and mobile coverage.

**Architecture:** Establish shared navigation, tokens, primitives, layout, data display, and state components first, then migrate pages one workflow at a time. Keep existing API calls and business behavior stable while moving job management into the new Sync workflow and preserving legacy route redirects.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4 CSS utilities, lucide-react icons, framer-motion, React Router, React Query, Node `tsx --test`.

---

## Reference Inputs

- Design spec: `docs/superpowers/specs/2026-05-03-ui-redesign-design.md`
- Current app shell: `apps/web/src/layout/app-shell.tsx`
- Current router: `apps/web/src/app.tsx`
- Current global styles: `apps/web/src/styles.css`
- Current complex pages:
  - `apps/web/src/pages/dashboard-page.tsx`
  - `apps/web/src/pages/media-page.tsx`
  - `apps/web/src/pages/job-diff-page.tsx`
  - `apps/web/src/pages/jobs-page.tsx`
  - `apps/web/src/pages/backups-page.tsx`
  - `apps/web/src/pages/settings-layout-page.tsx`
  - `apps/web/src/pages/storages-page.tsx`
  - `apps/web/src/pages/settings-page.tsx`
  - `apps/web/src/pages/advanced-settings-page.tsx`
  - `apps/web/src/pages/login-page.tsx`

## File Structure

Create and modify these files.

Navigation and routing:

- Create: `apps/web/src/navigation/navigation-model.ts`
- Create: `apps/web/src/navigation/navigation-model.test.ts`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/layout/app-shell.tsx`
- Create: `apps/web/src/pages/sync-page.tsx`
- Create: `apps/web/src/pages/sync-page-model.ts`
- Create: `apps/web/src/pages/sync-page-model.test.ts`

Design system:

- Create: `apps/web/src/components/ui/design-tokens.ts`
- Create: `apps/web/src/components/ui/design-tokens.test.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/icon-button.tsx`
- Modify: `apps/web/src/components/ui/card.tsx`
- Modify: `apps/web/src/components/ui/section-card.tsx`
- Create: `apps/web/src/components/ui/page-header.tsx`
- Create: `apps/web/src/components/ui/segmented-control.tsx`
- Create: `apps/web/src/components/ui/field.tsx`
- Create: `apps/web/src/components/ui/state-block.tsx`
- Create: `apps/web/src/components/ui/drawer.tsx`
- Create: `apps/web/src/components/ui/modal.tsx`

Data display and layout helpers:

- Create: `apps/web/src/components/data/data-table.tsx`
- Create: `apps/web/src/components/data/mobile-list.tsx`
- Create: `apps/web/src/components/data/metric-tile.tsx`
- Create: `apps/web/src/components/data/status-badge.tsx`
- Create: `apps/web/src/components/data/progress-bar.tsx`
- Modify: `apps/web/src/components/table/use-table-pagination.ts`
- Modify: `apps/web/src/components/table/table-toolbar.tsx`
- Modify: `apps/web/src/components/table/table-pagination.tsx`

Page models and page migrations:

- Create: `apps/web/src/pages/dashboard-page-model.ts`
- Create: `apps/web/src/pages/dashboard-page-model.test.ts`
- Modify: `apps/web/src/pages/dashboard-page.tsx`
- Create: `apps/web/src/pages/media-page-model.ts`
- Create: `apps/web/src/pages/media-page-model.test.ts`
- Modify: `apps/web/src/pages/media-page.tsx`
- Modify: `apps/web/src/pages/media/media-sidebar.tsx`
- Modify: `apps/web/src/pages/media/media-grid.tsx`
- Modify: `apps/web/src/pages/media/media-preview-dialog.tsx`
- Modify: `apps/web/src/pages/job-diff-page.tsx`
- Modify: `apps/web/src/pages/jobs-page.tsx`
- Create: `apps/web/src/pages/records-page-model.ts`
- Create: `apps/web/src/pages/records-page-model.test.ts`
- Modify: `apps/web/src/pages/backups-page.tsx`
- Modify: `apps/web/src/pages/settings-layout-page.tsx`
- Modify: `apps/web/src/pages/storages-page.tsx`
- Modify: `apps/web/src/pages/settings-page.tsx`
- Modify: `apps/web/src/pages/advanced-settings-page.tsx`
- Modify: `apps/web/src/pages/login-page.tsx`

Test configuration:

- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Modify if needed: `pnpm-lock.yaml`

## Task 1: Navigation Model and Route Contract

**Files:**
- Create: `apps/web/src/navigation/navigation-model.ts`
- Create: `apps/web/src/navigation/navigation-model.test.ts`
- Modify: `apps/web/src/app.tsx`
- Modify later in this task: `apps/web/src/layout/app-shell.tsx`

- [ ] **Step 1: Write the failing navigation model test**

Create `apps/web/src/navigation/navigation-model.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  getLegacyRedirectTarget,
  getPageMeta,
  primaryNavItems,
  settingsNavItems,
  syncTabs
} from "./navigation-model";

test("primary navigation uses the approved workflow IA", () => {
  assert.deepEqual(
    primaryNavItems.map((item) => [item.to, item.label]),
    [
      ["/", "概览"],
      ["/media", "媒体库"],
      ["/sync", "同步"],
      ["/records", "记录"],
      ["/settings", "配置"]
    ]
  );
});

test("sync owns diff, jobs, and running subviews", () => {
  assert.deepEqual(
    syncTabs.map((item) => [item.value, item.label]),
    [
      ["diff", "差异检查"],
      ["jobs", "同步任务"],
      ["running", "执行中"]
    ]
  );
});

test("settings no longer contains jobs", () => {
  assert.deepEqual(
    settingsNavItems.map((item) => item.to),
    ["/settings", "/settings/storages", "/settings/advanced"]
  );
});

test("legacy paths redirect to current workflows", () => {
  assert.equal(getLegacyRedirectTarget("/diff"), "/sync");
  assert.equal(getLegacyRedirectTarget("/jobs"), "/sync?tab=jobs");
  assert.equal(getLegacyRedirectTarget("/settings/jobs"), "/sync?tab=jobs");
  assert.equal(getLegacyRedirectTarget("/storages"), "/settings/storages");
  assert.equal(getLegacyRedirectTarget("/unknown"), null);
});

test("page metadata reflects renamed sections", () => {
  assert.equal(getPageMeta("/").title, "概览");
  assert.equal(getPageMeta("/media").title, "媒体库");
  assert.equal(getPageMeta("/sync").title, "同步");
  assert.equal(getPageMeta("/settings/storages").title, "存储配置");
});
```

- [ ] **Step 2: Run the navigation test and verify it fails**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/navigation/navigation-model.test.ts
```

Expected: FAIL with module not found for `apps/web/src/navigation/navigation-model.ts`.

- [ ] **Step 3: Implement the navigation model**

Create `apps/web/src/navigation/navigation-model.ts`:

```ts
import type { ComponentType } from "react";
import {
  Activity,
  Archive,
  BarChart3,
  Database,
  GitCompareArrows,
  Images,
  ListChecks,
  Settings,
  SlidersHorizontal
} from "lucide-react";

export type NavIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>;

export type PrimaryNavItem = {
  to: "/" | "/media" | "/sync" | "/records" | "/settings";
  label: string;
  description: string;
  icon: NavIcon;
};

export type SecondaryNavItem = {
  to: string;
  label: string;
  description: string;
  icon: NavIcon;
  end?: boolean;
};

export type SyncTabValue = "diff" | "jobs" | "running";

export const primaryNavItems: PrimaryNavItem[] = [
  { to: "/", label: "概览", description: "容量、媒体分布、趋势与风险", icon: BarChart3 },
  { to: "/media", label: "媒体库", description: "浏览图片、视频与 Live Photo", icon: Images },
  { to: "/sync", label: "同步", description: "差异检查、任务与执行中队列", icon: GitCompareArrows },
  { to: "/records", label: "记录", description: "执行历史、失败与审计", icon: ListChecks },
  { to: "/settings", label: "配置", description: "通知、存储与维护", icon: Settings }
];

export const syncTabs: Array<{ value: SyncTabValue; label: string; description: string; icon: NavIcon }> = [
  { value: "diff", label: "差异检查", description: "对比源目录和目标目录", icon: GitCompareArrows },
  { value: "jobs", label: "同步任务", description: "管理计划、监听与路径", icon: Archive },
  { value: "running", label: "执行中", description: "查看队列、进度与取消", icon: Activity }
];

export const settingsNavItems: SecondaryNavItem[] = [
  { to: "/settings", label: "通知", description: "Telegram 消息与连接参数", icon: Settings, end: true },
  { to: "/settings/storages", label: "存储", description: "源目录、目标目录与挂载配置", icon: Database },
  { to: "/settings/advanced", label: "高级", description: "索引、诊断与维护工具", icon: SlidersHorizontal }
];

export function normalizePathname(pathname: string): string {
  if (pathname !== "/" && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }
  return pathname;
}

export function getLegacyRedirectTarget(pathname: string): string | null {
  const normalized = normalizePathname(pathname);
  if (normalized === "/diff") return "/sync";
  if (normalized === "/jobs") return "/sync?tab=jobs";
  if (normalized === "/settings/jobs") return "/sync?tab=jobs";
  if (normalized === "/storages") return "/settings/storages";
  if (normalized === "/backups") return "/records";
  return null;
}

export function getPageMeta(pathname: string): { title: string; subtitle: string } {
  const normalized = normalizePathname(pathname);
  if (normalized === "/") return { title: "概览", subtitle: "容量、媒体分布、趋势、风险与最近活动" };
  if (normalized === "/media") return { title: "媒体库", subtitle: "按存储浏览图片、视频与 Live Photo" };
  if (normalized.startsWith("/sync")) return { title: "同步", subtitle: "差异检查、同步任务与执行中队列" };
  if (normalized === "/records") return { title: "记录", subtitle: "查看执行历史、失败明细与审计记录" };
  if (normalized === "/settings/storages") return { title: "存储配置", subtitle: "管理源存储、目标存储、容量与路径" };
  if (normalized === "/settings/advanced") return { title: "高级配置", subtitle: "索引、诊断与维护工具" };
  if (normalized.startsWith("/settings")) return { title: "配置", subtitle: "通知、存储与维护设置" };
  return { title: "PhotoArk", subtitle: "照片备份与多目标同步控制台" };
}
```

- [ ] **Step 4: Run the navigation test and verify it passes**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/navigation/navigation-model.test.ts
```

Expected: PASS for 5 tests.

- [ ] **Step 5: Wire redirects in `apps/web/src/app.tsx`**

Update the router so legacy paths redirect through the new IA:

```tsx
const SyncPage = lazy(() =>
  import("./pages/sync-page").then((m) => ({ default: m.SyncPage }))
);
```

Add routes:

```tsx
<Route
  path="sync"
  element={
    <Suspense fallback={<PageLoading />}>
      <SyncPage />
    </Suspense>
  }
/>
<Route path="diff" element={<Navigate to="/sync" replace />} />
<Route path="jobs" element={<Navigate to="/sync?tab=jobs" replace />} />
<Route path="settings/jobs" element={<Navigate to="/sync?tab=jobs" replace />} />
<Route path="storages" element={<Navigate to="/settings/storages" replace />} />
<Route path="backups" element={<Navigate to="/records" replace />} />
```

Temporarily create `apps/web/src/pages/sync-page.tsx` with:

```tsx
import { JobDiffPage } from "./job-diff-page";

export function SyncPage() {
  return <JobDiffPage />;
}
```

- [ ] **Step 6: Update `AppShell` to read navigation from the model**

In `apps/web/src/layout/app-shell.tsx`, remove the local `tabs`, `tabIconByPath`, `NavTabIcon`, `normalizePathname`, and `getPageMeta` declarations. Import these instead:

```tsx
import { getPageMeta, normalizePathname, primaryNavItems } from "../navigation/navigation-model";
```

Render `primaryNavItems` in both desktop and mobile navigation. For each item:

```tsx
const Icon = item.icon;
<Icon className="h-4 w-4" aria-hidden={true} />
```

- [ ] **Step 7: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/navigation/navigation-model.ts apps/web/src/navigation/navigation-model.test.ts apps/web/src/app.tsx apps/web/src/layout/app-shell.tsx apps/web/src/pages/sync-page.tsx
git commit -m "feat(web): add workflow navigation model"
```

## Task 2: Design Tokens and Global CSS Reset

**Files:**
- Create: `apps/web/src/components/ui/design-tokens.ts`
- Create: `apps/web/src/components/ui/design-tokens.test.ts`
- Modify: `apps/web/src/styles.css`

- [ ] **Step 1: Write the failing token test**

Create `apps/web/src/components/ui/design-tokens.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { semanticColorNames, surfaceRadiusPx, workspacePalette } from "./design-tokens";

test("workspace palette avoids the old beige-heavy theme", () => {
  assert.equal(workspacePalette.background, "#f6f8fb");
  assert.equal(workspacePalette.surface, "#ffffff");
  assert.equal(workspacePalette.primary, "#0f766e");
});

test("surface radius follows the approved operational console scale", () => {
  assert.equal(surfaceRadiusPx.panel, 8);
  assert.equal(surfaceRadiusPx.control, 7);
  assert.equal(surfaceRadiusPx.badge, 999);
});

test("semantic statuses include text-friendly color names", () => {
  assert.deepEqual(semanticColorNames, ["success", "warning", "danger", "info"]);
});
```

- [ ] **Step 2: Run the token test and verify it fails**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/components/ui/design-tokens.test.ts
```

Expected: FAIL with module not found for `design-tokens.ts`.

- [ ] **Step 3: Implement token exports**

Create `apps/web/src/components/ui/design-tokens.ts`:

```ts
export const workspacePalette = {
  background: "#f6f8fb",
  backgroundSoft: "#eef3f8",
  surface: "#ffffff",
  surfaceSoft: "#f1f5f9",
  surfaceRaised: "#ffffff",
  ink: "#172033",
  inkSoft: "#64748b",
  line: "#d8dee8",
  lineStrong: "#b8c2d1",
  primary: "#0f766e",
  primaryStrong: "#0b5d56",
  primarySoft: "#d9f2ef",
  info: "#2563eb",
  success: "#168a4a",
  warning: "#b76500",
  danger: "#b4233f"
} as const;

export const darkWorkspacePalette = {
  background: "#0d1117",
  backgroundSoft: "#111827",
  surface: "#171f2b",
  surfaceSoft: "#1d2735",
  surfaceRaised: "#202b39",
  ink: "#edf2f7",
  inkSoft: "#a8b3c2",
  line: "#2d3a4c",
  lineStrong: "#40516a",
  primary: "#4fc4b8",
  primaryStrong: "#2aa99c",
  primarySoft: "#123b38",
  info: "#7aa7ff",
  success: "#58d68d",
  warning: "#f2b45f",
  danger: "#f19aaa"
} as const;

export const surfaceRadiusPx = {
  panel: 8,
  control: 7,
  badge: 999
} as const;

export const semanticColorNames = ["success", "warning", "danger", "info"] as const;
```

- [ ] **Step 4: Run the token test and verify it passes**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/components/ui/design-tokens.test.ts
```

Expected: PASS for 3 tests.

- [ ] **Step 5: Replace the top of `styles.css` with neutral tokens**

In `apps/web/src/styles.css`, replace the existing `:root` and `:root[data-theme="dark"]` token blocks with CSS variables matching the token values:

```css
:root {
  color-scheme: light;
  --ark-bg: #f6f8fb;
  --ark-bg-soft: #eef3f8;
  --ark-surface: #ffffff;
  --ark-surface-soft: #f1f5f9;
  --ark-surface-deep: #e4eaf2;
  --ark-ink: #172033;
  --ark-ink-soft: #64748b;
  --ark-line: #d8dee8;
  --ark-line-strong: #b8c2d1;
  --ark-primary: #0f766e;
  --ark-primary-strong: #0b5d56;
  --ark-primary-soft: #d9f2ef;
  --ark-info: #2563eb;
  --ark-success: #168a4a;
  --ark-success-bg: #e8f7ee;
  --ark-success-line: #afd8c4;
  --ark-warning: #b76500;
  --ark-warning-bg: #fff6e8;
  --ark-warning-line: #efc68f;
  --ark-danger-bg: #fff0f3;
  --ark-danger-line: #f1b8c5;
  --ark-danger-text: #b4233f;
  --ark-shadow-lg: 0 20px 46px rgba(23, 32, 51, 0.13);
  --ark-shadow-md: 0 10px 24px rgba(23, 32, 51, 0.1);
  --ark-overlay: rgba(15, 23, 42, 0.52);
  --ark-radius-card: 8px;
  --ark-radius-control: 7px;
  --ark-radius-chip: 999px;
  --ark-focus: color-mix(in oklab, var(--ark-primary) 22%, transparent);
  --ark-focus-strong: color-mix(in oklab, var(--ark-primary) 34%, transparent);
  --ark-focus-ring: 0 0 0 3px var(--ark-focus);
  --ark-focus-ring-strong: 0 0 0 4px var(--ark-focus-strong);
}
```

Use the same variable names for dark mode with graphite values from `darkWorkspacePalette`.

- [ ] **Step 6: Remove decorative body gradients**

In `styles.css`, replace the `body` background with:

```css
body {
  margin: 0;
  font-family: "IBM Plex Sans", "PingFang SC", "Noto Sans SC", sans-serif;
  background: var(--ark-bg);
  color: var(--ark-ink);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
```

Also replace negative heading letter spacing:

```css
h1,
h2,
h3,
.mp-h1,
.mp-h2,
.mp-h3 {
  font-family: "Space Grotesk", "IBM Plex Sans", "PingFang SC", sans-serif;
  letter-spacing: 0;
}
```

- [ ] **Step 7: Normalize core radii and panel styles**

Update these classes in `styles.css`:

```css
.mp-panel,
.mp-sidebar,
.mp-topbar,
.mp-subtle-card,
.mp-card,
.mp-table-shell,
.mp-mobile-card {
  border-radius: var(--ark-radius-card);
}

.mp-panel {
  border: 1px solid var(--ark-line);
  background: var(--ark-surface);
  box-shadow: none;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, background 0.16s ease;
}

.mp-panel-hero {
  border-color: var(--ark-line);
  background: var(--ark-surface);
  box-shadow: var(--ark-shadow-md);
}

.mp-panel-soft {
  background: var(--ark-surface-soft);
  box-shadow: none;
}

.mp-btn,
.mp-input,
.mp-select,
.mp-segment {
  border-radius: var(--ark-radius-control);
}
```

- [ ] **Step 8: Run style grep checks**

Run:

```bash
rg -n "radial-gradient|rounded-2xl|tracking-\\[-|letter-spacing: -|--ark-bg: #f5f1ec|#0c1117" apps/web/src
```

Expected: no matches except deliberate chart gradients in `dashboard-page.tsx` before that page is migrated. If `styles.css`, `app-shell.tsx`, or `login-page.tsx` still match decorative background gradients, remove those in this task.

- [ ] **Step 9: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/components/ui/design-tokens.ts apps/web/src/components/ui/design-tokens.test.ts apps/web/src/styles.css
git commit -m "style(web): introduce operational console tokens"
```

## Task 3: Primitive UI Components

**Files:**
- Modify: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/icon-button.tsx`
- Modify: `apps/web/src/components/ui/card.tsx`
- Modify: `apps/web/src/components/ui/section-card.tsx`
- Create: `apps/web/src/components/ui/page-header.tsx`
- Create: `apps/web/src/components/ui/segmented-control.tsx`
- Create: `apps/web/src/components/ui/field.tsx`
- Create: `apps/web/src/components/ui/state-block.tsx`
- Create: `apps/web/src/components/ui/modal.tsx`
- Create: `apps/web/src/components/ui/drawer.tsx`
- Create: `apps/web/src/components/ui/primitives-render.test.tsx`

- [ ] **Step 1: Write render tests for primitives**

Create `apps/web/src/components/ui/primitives-render.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Search } from "lucide-react";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { PageHeader } from "./page-header";
import { SegmentedControl } from "./segmented-control";
import { Field } from "./field";
import { StateBlock } from "./state-block";

test("Button renders loading state without dropping label", () => {
  const html = renderToStaticMarkup(<Button busy>保存</Button>);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /保存/);
});

test("IconButton requires and renders aria label", () => {
  const html = renderToStaticMarkup(<IconButton ariaLabel="搜索" icon={<Search />} />);
  assert.match(html, /aria-label="搜索"/);
});

test("PageHeader renders title, description, actions, and chips", () => {
  const html = renderToStaticMarkup(
    <PageHeader
      eyebrow="PhotoArk"
      title="概览"
      description="容量、媒体分布、趋势、风险与最近活动"
      chips={<span className="mp-chip">健康</span>}
      actions={<Button>刷新</Button>}
    />
  );
  assert.match(html, /概览/);
  assert.match(html, /容量、媒体分布/);
  assert.match(html, /刷新/);
});

test("SegmentedControl marks the selected item", () => {
  const html = renderToStaticMarkup(
    <SegmentedControl
      ariaLabel="同步视图"
      value="diff"
      items={[
        { value: "diff", label: "差异检查" },
        { value: "jobs", label: "同步任务" }
      ]}
      onChange={() => undefined}
    />
  );
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /差异检查/);
});

test("Field connects label and help text", () => {
  const html = renderToStaticMarkup(
    <Field id="job-name" label="任务名称" help="用于记录和筛选">
      <input id="job-name" />
    </Field>
  );
  assert.match(html, /for="job-name"/);
  assert.match(html, /用于记录和筛选/);
});

test("StateBlock renders an action when supplied", () => {
  const html = renderToStaticMarkup(<StateBlock title="暂无数据" description="创建任务后会显示记录" action={<Button>新建任务</Button>} />);
  assert.match(html, /暂无数据/);
  assert.match(html, /新建任务/);
});
```

- [ ] **Step 2: Run the primitive render test and verify it fails**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/components/ui/primitives-render.test.tsx
```

Expected: FAIL with missing modules for `icon-button`, `page-header`, `segmented-control`, `field`, or `state-block`.

- [ ] **Step 3: Implement `IconButton`**

Create `apps/web/src/components/ui/icon-button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonVariant = "default" | "primary" | "danger" | "ghost";
type IconButtonSize = "sm" | "md";

const variantClass: Record<IconButtonVariant, string> = {
  default: "mp-btn",
  primary: "mp-btn mp-btn-primary",
  danger: "mp-btn mp-btn-danger",
  ghost: "mp-icon-ghost"
};

const sizeClass: Record<IconButtonSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10"
};

export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> & {
  ariaLabel: string;
  icon: ReactNode;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
};

export function IconButton({ ariaLabel, icon, variant = "default", size = "md", type = "button", className, ...props }: IconButtonProps) {
  return (
    <button type={type} aria-label={ariaLabel} className={`${variantClass[variant]} ${sizeClass[size]} shrink-0 px-0 ${className ?? ""}`} {...props}>
      <span className="inline-flex h-4 w-4 items-center justify-center">{icon}</span>
    </button>
  );
}
```

Add this class to `styles.css`:

```css
.mp-icon-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: var(--ark-radius-control);
  background: transparent;
  color: var(--ark-ink-soft);
  transition: background-color 0.16s ease, color 0.16s ease, border-color 0.16s ease;
}

.mp-icon-ghost:hover {
  border-color: var(--ark-line);
  background: var(--ark-surface-soft);
  color: var(--ark-ink);
}
```

- [ ] **Step 4: Implement `PageHeader`**

Create `apps/web/src/components/ui/page-header.tsx`:

```tsx
import type { ReactNode } from "react";

export type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  chips?: ReactNode;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, chips, actions }: PageHeaderProps) {
  return (
    <header className="mp-page-header">
      <div className="min-w-0">
        {eyebrow ? <p className="mp-kicker mp-kicker-primary">{eyebrow}</p> : null}
        <h1 className="mt-1 text-[26px] font-semibold leading-tight md:text-[28px]">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm leading-6 mp-muted">{description}</p> : null}
        {chips ? <div className="mt-3 flex flex-wrap items-center gap-2">{chips}</div> : null}
      </div>
      {actions ? <div className="mp-page-header-actions">{actions}</div> : null}
    </header>
  );
}
```

Add CSS:

```css
.mp-page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--ark-line);
  padding: 0 0 16px;
}

.mp-page-header-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 720px) {
  .mp-page-header {
    flex-direction: column;
  }

  .mp-page-header-actions {
    width: 100%;
    justify-content: flex-start;
    overflow-x: auto;
    padding-bottom: 2px;
  }
}
```

- [ ] **Step 5: Implement `SegmentedControl`**

Create `apps/web/src/components/ui/segmented-control.tsx`:

```tsx
export type SegmentedControlItem<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

export type SegmentedControlProps<T extends string> = {
  ariaLabel: string;
  value: T;
  items: Array<SegmentedControlItem<T>>;
  onChange: (value: T) => void;
};

export function SegmentedControl<T extends string>({ ariaLabel, value, items, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="mp-segment" role="group" aria-label={ariaLabel}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="mp-segment-item"
          aria-pressed={item.value === value}
          onClick={() => onChange(item.value)}
        >
          <span>{item.label}</span>
          {typeof item.count === "number" ? <span className="mp-segment-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
```

Add CSS:

```css
.mp-segment-count {
  color: inherit;
  opacity: 0.74;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: Implement `Field`**

Create `apps/web/src/components/ui/field.tsx`:

```tsx
import type { ReactNode } from "react";

export type FieldProps = {
  id: string;
  label: string;
  help?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
};

export function Field({ id, label, help, error, children }: FieldProps) {
  const helpId = help ? `${id}-help` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="mp-field">
      <label htmlFor={id} className="mp-field-label">
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {help ? (
        <p id={helpId} className="mt-1 text-xs leading-5 mp-muted">
          {help}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-xs leading-5 text-[var(--ark-danger-text)]">
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

Add CSS:

```css
.mp-field-label {
  display: block;
  font-size: 13px;
  font-weight: 650;
  color: var(--ark-ink);
}
```

- [ ] **Step 7: Implement `StateBlock`, `Modal`, and `Drawer`**

Create `apps/web/src/components/ui/state-block.tsx`:

```tsx
import type { ReactNode } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

export type StateBlockTone = "empty" | "loading" | "error";

export type StateBlockProps = {
  tone?: StateBlockTone;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function StateBlock({ tone = "empty", title, description, action }: StateBlockProps) {
  const Icon = tone === "loading" ? Loader2 : AlertCircle;
  return (
    <div className="mp-state-block">
      <span className="mp-state-icon">
        <Icon className={tone === "loading" ? "h-5 w-5 animate-spin" : "h-5 w-5"} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {description ? <p className="mt-1 text-sm leading-6 mp-muted">{description}</p> : null}
        {action ? <div className="mt-3 flex flex-wrap gap-2">{action}</div> : null}
      </div>
    </div>
  );
}
```

Create `apps/web/src/components/ui/modal.tsx`:

```tsx
import type { ReactNode } from "react";

export type ModalProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
};

export function Modal({ open, title, children, footer, onClose }: ModalProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 mp-overlay" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="mp-modal-surface"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--ark-line)] px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" className="mp-icon-ghost h-8 w-8" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="min-h-0 overflow-auto p-4">{children}</div>
        {footer ? <footer className="border-t border-[var(--ark-line)] px-4 py-3">{footer}</footer> : null}
      </section>
    </div>
  );
}
```

Create `apps/web/src/components/ui/drawer.tsx`:

```tsx
import type { ReactNode } from "react";

export type DrawerProps = {
  open: boolean;
  title: string;
  children: ReactNode;
  side?: "right" | "bottom";
  onClose: () => void;
};

export function Drawer({ open, title, children, side = "right", onClose }: DrawerProps) {
  if (!open) return null;
  const sideClass = side === "bottom" ? "mp-drawer-bottom" : "mp-drawer-right";
  return (
    <div className="fixed inset-0 z-50 mp-overlay" role="presentation" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`mp-drawer-surface ${sideClass}`}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--ark-line)] px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button type="button" className="mp-icon-ghost h-8 w-8" aria-label="关闭" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="min-h-0 overflow-auto p-4">{children}</div>
      </section>
    </div>
  );
}
```

Add CSS:

```css
.mp-state-block {
  display: flex;
  gap: 12px;
  border: 1px solid var(--ark-line);
  border-radius: var(--ark-radius-card);
  background: var(--ark-surface);
  padding: 16px;
}

.mp-state-icon {
  display: inline-flex;
  height: 36px;
  width: 36px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: var(--ark-radius-control);
  background: var(--ark-surface-soft);
  color: var(--ark-ink-soft);
}

.mp-modal-surface {
  display: flex;
  max-height: min(760px, calc(100vh - 32px));
  width: min(720px, 100%);
  flex-direction: column;
  border: 1px solid var(--ark-line);
  border-radius: var(--ark-radius-card);
  background: var(--ark-surface);
  box-shadow: var(--ark-shadow-lg);
}

.mp-drawer-surface {
  position: absolute;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ark-line);
  background: var(--ark-surface);
  box-shadow: var(--ark-shadow-lg);
}

.mp-drawer-right {
  inset: 0 0 0 auto;
  width: min(480px, 100%);
}

.mp-drawer-bottom {
  inset: auto 0 0;
  max-height: min(80vh, 720px);
  border-radius: 12px 12px 0 0;
}
```

- [ ] **Step 8: Update `Button`, `Card`, and `SectionCard` contracts**

Update `Button` so icon-only consumers use `IconButton`, and buttons remain text-first. Keep existing `busy`, `variant`, and `size` props. Ensure `busy` sets `aria-busy` and retains children.

Update `Card` variants to these classes:

```ts
const variantClass: Record<CardVariant, string> = {
  panel: "mp-panel",
  panelSoft: "mp-panel mp-panel-soft",
  panelHero: "mp-panel mp-panel-hero",
  subtle: "mp-subtle-card",
  plain: "mp-card"
};
```

Update `SectionCard` header spacing to stop nested-card feel:

```tsx
<Card variant={variant} className={`p-4 ${className ?? ""}`}>
  <div className={`flex flex-wrap items-start justify-between gap-3 ${headerClassName ?? ""}`}>
    ...
  </div>
  <div className="mt-4 min-w-0">{children}</div>
</Card>
```

- [ ] **Step 9: Run primitive render tests**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/components/ui/primitives-render.test.tsx
```

Expected: PASS for 6 tests.

- [ ] **Step 10: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/components/ui apps/web/src/styles.css
git commit -m "feat(web): add shared UI primitives"
```

## Task 4: Data Display, Status, and Form Building Blocks

**Files:**
- Create: `apps/web/src/components/data/status-badge.tsx`
- Create: `apps/web/src/components/data/metric-tile.tsx`
- Create: `apps/web/src/components/data/progress-bar.tsx`
- Create: `apps/web/src/components/data/data-table.tsx`
- Create: `apps/web/src/components/data/mobile-list.tsx`
- Create: `apps/web/src/components/data/data-components-render.test.tsx`
- Modify: `apps/web/src/components/table/table-toolbar.tsx`
- Modify: `apps/web/src/components/table/table-pagination.tsx`

- [ ] **Step 1: Write data component render tests**

Create `apps/web/src/components/data/data-components-render.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MetricTile } from "./metric-tile";
import { MobileList } from "./mobile-list";
import { ProgressBar } from "./progress-bar";
import { StatusBadge } from "./status-badge";

test("StatusBadge includes visible text for color-coded state", () => {
  const html = renderToStaticMarkup(<StatusBadge tone="warning">待处理</StatusBadge>);
  assert.match(html, /待处理/);
  assert.match(html, /mp-chip-warning/);
});

test("MetricTile renders label, value, and description", () => {
  const html = renderToStaticMarkup(<MetricTile label="媒体文件" value="12,408" description="图片与视频总数" />);
  assert.match(html, /媒体文件/);
  assert.match(html, /12,408/);
  assert.match(html, /图片与视频总数/);
});

test("ProgressBar clamps width while preserving accessible label", () => {
  const html = renderToStaticMarkup(<ProgressBar value={128} label="容量使用率" />);
  assert.match(html, /aria-label="容量使用率"/);
  assert.match(html, /width:100%/);
});

test("MobileList renders each item through the supplied renderer", () => {
  const html = renderToStaticMarkup(
    <MobileList
      items={[{ id: "one", name: "NAS" }]}
      getKey={(item) => item.id}
      renderItem={(item) => <span>{item.name}</span>}
    />
  );
  assert.match(html, /NAS/);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/components/data/data-components-render.test.tsx
```

Expected: FAIL with missing component modules.

- [ ] **Step 3: Implement status and metric components**

Create `apps/web/src/components/data/status-badge.tsx`:

```tsx
import type { ReactNode } from "react";

type StatusTone = "neutral" | "success" | "warning" | "danger" | "info";

const toneClass: Record<StatusTone, string> = {
  neutral: "mp-chip",
  success: "mp-chip mp-chip-success",
  warning: "mp-chip mp-chip-warning",
  danger: "mp-chip mp-chip-danger",
  info: "mp-chip mp-chip-info"
};

export function StatusBadge({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className={toneClass[tone]}>{children}</span>;
}
```

Create `apps/web/src/components/data/metric-tile.tsx`:

```tsx
import type { ReactNode } from "react";

export type MetricTileProps = {
  label: string;
  value: ReactNode;
  description?: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
};

export function MetricTile({ label, value, description, tone = "neutral" }: MetricTileProps) {
  return (
    <article className={`mp-metric-tile mp-metric-${tone}`}>
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ark-ink-soft)]">{label}</p>
      <p className="mt-2 text-2xl font-semibold leading-tight mp-tabular">{value}</p>
      {description ? <p className="mt-1 text-xs leading-5 mp-muted">{description}</p> : null}
    </article>
  );
}
```

Create `apps/web/src/components/data/progress-bar.tsx`:

```tsx
export type ProgressBarProps = {
  value: number;
  label: string;
  tone?: "success" | "warning" | "danger" | "info";
};

const toneClass: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  success: "bg-[var(--ark-success)]",
  warning: "bg-[var(--ark-warning)]",
  danger: "bg-[var(--ark-danger-text)]",
  info: "bg-[var(--ark-info)]"
};

export function ProgressBar({ value, label, tone = "info" }: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div className="mp-progress" role="progressbar" aria-label={label} aria-valuenow={clamped} aria-valuemin={0} aria-valuemax={100}>
      <div className={`h-full rounded-full ${toneClass[tone]}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
```

- [ ] **Step 4: Implement table and mobile list wrappers**

Create `apps/web/src/components/data/mobile-list.tsx`:

```tsx
import type { ReactNode } from "react";

export type MobileListProps<T> = {
  items: T[];
  getKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  empty?: ReactNode;
};

export function MobileList<T>({ items, getKey, renderItem, empty }: MobileListProps<T>) {
  if (!items.length) return <>{empty ?? null}</>;
  return <div className="grid gap-2 md:hidden">{items.map((item) => <div key={getKey(item)}>{renderItem(item)}</div>)}</div>;
}
```

Create `apps/web/src/components/data/data-table.tsx`:

```tsx
import type { ReactNode } from "react";

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (item: T) => ReactNode;
  className?: string;
};

export type DataTableProps<T> = {
  items: T[];
  columns: Array<DataTableColumn<T>>;
  getKey: (item: T) => string;
  empty?: ReactNode;
};

export function DataTable<T>({ items, columns, getKey, empty }: DataTableProps<T>) {
  if (!items.length) return <>{empty ?? null}</>;
  return (
    <div className="mp-table-shell hidden md:block">
      <table className="mp-data-table w-full">
        <thead>
          <tr>{columns.map((column) => <th key={column.key} className={`px-3 py-2 text-left ${column.className ?? ""}`}>{column.header}</th>)}</tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={getKey(item)}>
              {columns.map((column) => <td key={column.key} className={`px-3 py-2 align-top ${column.className ?? ""}`}>{column.render(item)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

Add CSS:

```css
.mp-chip-info {
  border-color: color-mix(in oklab, var(--ark-info) 34%, var(--ark-line));
  background: color-mix(in oklab, var(--ark-info) 10%, var(--ark-surface));
  color: var(--ark-info);
}

.mp-metric-tile {
  border: 1px solid var(--ark-line);
  border-radius: var(--ark-radius-card);
  background: var(--ark-surface);
  padding: 14px;
}

.mp-progress {
  height: 7px;
  width: 100%;
  overflow: hidden;
  border-radius: 999px;
  background: var(--ark-surface-soft);
}
```

- [ ] **Step 5: Update table toolbar and pagination density**

In `apps/web/src/components/table/table-toolbar.tsx`, keep the existing search shortcut behavior, but update structure to use smaller controls and no helper shortcut text on mobile:

```tsx
<div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
  ...
</div>
```

In `table-pagination.tsx`, ensure buttons use `mp-btn mp-btn-sm` and text uses tabular numbers:

```tsx
<span className="mp-tabular text-sm mp-muted">{page} / {totalPages}</span>
```

- [ ] **Step 6: Run tests**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/components/data/data-components-render.test.tsx
npm run typecheck
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/data apps/web/src/components/table apps/web/src/styles.css
git commit -m "feat(web): add data display components"
```

## Task 5: App Shell Redesign

**Files:**
- Modify: `apps/web/src/layout/app-shell.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/src/app.tsx`

- [ ] **Step 1: Create a shell smoke test**

Create `apps/web/src/layout/app-shell-model.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getPageMeta, primaryNavItems } from "../navigation/navigation-model";

test("shell has five mobile nav targets", () => {
  assert.equal(primaryNavItems.length, 5);
  assert.deepEqual(primaryNavItems.map((item) => item.to), ["/", "/media", "/sync", "/records", "/settings"]);
});

test("shell metadata avoids old dashboard wording", () => {
  const meta = getPageMeta("/");
  assert.equal(meta.title, "概览");
  assert.match(meta.subtitle, /容量/);
});
```

- [ ] **Step 2: Run shell test**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/layout/app-shell-model.test.ts
```

Expected: PASS if Task 1 is complete.

- [ ] **Step 3: Replace decorative shell background**

In `apps/web/src/layout/app-shell.tsx`, remove the absolute radial-gradient background element. The outer shell should be:

```tsx
<div className="min-h-screen bg-[var(--ark-bg)] text-[var(--ark-ink)]">
  <div className="mx-auto flex min-h-screen w-full max-w-[1480px] px-3 pb-24 pt-3 md:h-screen md:px-4 md:pb-4 md:pt-4">
    ...
  </div>
</div>
```

- [ ] **Step 4: Make desktop shell a focused console frame**

Use this layout structure:

```tsx
<div className="grid w-full gap-3 md:grid-cols-[232px_minmax(0,1fr)] md:overflow-hidden">
  <motion.aside className="mp-sidebar hidden md:flex md:min-h-0 md:flex-col md:overflow-auto">
    ...
  </motion.aside>
  <section className="min-w-0 md:flex md:min-h-0 md:flex-col md:overflow-hidden">
    <motion.header className="mp-topbar p-4">
      ...
    </motion.header>
    <motion.div className="mt-3 min-h-0 flex-1 md:overflow-auto" animate={pageTransitionControls} initial={false}>
      <Outlet />
    </motion.div>
  </section>
</div>
```

Keep the account menu, version badge, theme toggle, logout behavior, and page transition behavior.

- [ ] **Step 5: Update navigation styling**

Desktop nav item class:

```tsx
`flex items-center gap-2 rounded-md px-2.5 py-2 text-sm font-semibold transition-colors ${
  isActive
    ? "bg-[var(--ark-primary)] text-white"
    : "text-[var(--ark-ink-soft)] hover:bg-[var(--ark-surface-soft)] hover:text-[var(--ark-ink)]"
}`
```

Mobile nav item class:

```tsx
`flex min-h-12 flex-col items-center justify-center rounded-md px-1.5 py-1 text-[11px] font-semibold leading-tight transition-colors ${
  isActive ? "bg-[var(--ark-primary)] text-white" : "text-[var(--ark-ink-soft)]"
}`
```

- [ ] **Step 6: Update mobile content bottom padding**

Add CSS:

```css
.mp-mobile-nav {
  border: 1px solid var(--ark-line);
  border-radius: 10px;
  background: var(--ark-surface);
  box-shadow: var(--ark-shadow-md);
}
```

Ensure page containers keep `pb-20` or shell keeps `pb-24` on mobile so bottom nav does not overlap content.

- [ ] **Step 7: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/layout/app-shell.tsx apps/web/src/layout/app-shell-model.test.ts apps/web/src/styles.css apps/web/src/app.tsx
git commit -m "feat(web): redesign application shell"
```

## Task 6: Overview Analytics Board

**Files:**
- Create: `apps/web/src/pages/dashboard-page-model.ts`
- Create: `apps/web/src/pages/dashboard-page-model.test.ts`
- Modify: `apps/web/src/pages/dashboard-page.tsx`

- [ ] **Step 1: Write dashboard model tests**

Create `apps/web/src/pages/dashboard-page-model.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildCapacityRiskLabel, buildOverviewMetricTiles, sortStorageMediaSummary } from "./dashboard-page-model";

test("capacity risk label escalates low remaining capacity", () => {
  assert.equal(buildCapacityRiskLabel(8), "容量紧张");
  assert.equal(buildCapacityRiskLabel(18), "容量偏低");
  assert.equal(buildCapacityRiskLabel(55), "容量充足");
  assert.equal(buildCapacityRiskLabel(null), "容量未知");
});

test("overview metric tiles keep analytics first", () => {
  const tiles = buildOverviewMetricTiles({
    storageCount: 3,
    jobCount: 5,
    activeExecutionCount: 1,
    failedRunCount: 2,
    mediaCount: 1200,
    capacityRiskCount: 1
  });
  assert.deepEqual(tiles.map((tile) => tile.key), ["media", "storage", "jobs", "active", "failures", "risk"]);
  assert.equal(tiles[0].label, "媒体文件");
});

test("media summaries sort by total bytes descending", () => {
  const sorted = sortStorageMediaSummary([
    { storageId: "a", storageName: "A", storageType: "local_fs", totalCount: 1, totalBytes: 10, imageCount: 1, imageBytes: 10, videoCount: 0, videoBytes: 0, livePhotoCount: 0, livePhotoBytes: 0 },
    { storageId: "b", storageName: "B", storageType: "local_fs", totalCount: 2, totalBytes: 30, imageCount: 2, imageBytes: 30, videoCount: 0, videoBytes: 0, livePhotoCount: 0, livePhotoBytes: 0 }
  ]);
  assert.deepEqual(sorted.map((item) => item.storageId), ["b", "a"]);
});
```

- [ ] **Step 2: Run dashboard model tests and verify failure**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/dashboard-page-model.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement dashboard model**

Create `apps/web/src/pages/dashboard-page-model.ts`:

```ts
import type { StorageMediaSummaryItem } from "../types/api";

export type OverviewMetricInput = {
  storageCount: number;
  jobCount: number;
  activeExecutionCount: number;
  failedRunCount: number;
  mediaCount: number;
  capacityRiskCount: number;
};

export type OverviewMetricTile = {
  key: "media" | "storage" | "jobs" | "active" | "failures" | "risk";
  label: string;
  value: string;
  description: string;
  tone: "neutral" | "success" | "warning" | "danger" | "info";
};

export function buildCapacityRiskLabel(remainingPercent: number | null): string {
  if (remainingPercent === null) return "容量未知";
  if (remainingPercent <= 10) return "容量紧张";
  if (remainingPercent <= 25) return "容量偏低";
  return "容量充足";
}

export function buildOverviewMetricTiles(input: OverviewMetricInput): OverviewMetricTile[] {
  return [
    { key: "media", label: "媒体文件", value: input.mediaCount.toLocaleString("zh-CN"), description: "图片、视频与 Live Photo", tone: "info" },
    { key: "storage", label: "存储目标", value: String(input.storageCount), description: "已配置源与目标", tone: "neutral" },
    { key: "jobs", label: "同步任务", value: String(input.jobCount), description: "计划任务和监听任务", tone: "neutral" },
    { key: "active", label: "执行中", value: String(input.activeExecutionCount), description: "队列和运行任务", tone: input.activeExecutionCount > 0 ? "info" : "success" },
    { key: "failures", label: "失败记录", value: String(input.failedRunCount), description: "最近失败和异常", tone: input.failedRunCount > 0 ? "danger" : "success" },
    { key: "risk", label: "容量风险", value: String(input.capacityRiskCount), description: "低容量存储数量", tone: input.capacityRiskCount > 0 ? "warning" : "success" }
  ];
}

export function sortStorageMediaSummary(items: StorageMediaSummaryItem[]): StorageMediaSummaryItem[] {
  return [...items].sort((a, b) => b.totalBytes - a.totalBytes || b.totalCount - a.totalCount || a.storageName.localeCompare(b.storageName, "zh-CN"));
}
```

- [ ] **Step 4: Run dashboard model tests and verify pass**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/dashboard-page-model.test.ts
```

Expected: PASS for 3 tests.

- [ ] **Step 5: Rebuild Dashboard layout around analytics board**

In `apps/web/src/pages/dashboard-page.tsx`:

- Import `MetricTile`, `ProgressBar`, `StatusBadge`, `StateBlock`, and `PageHeader`.
- Use `buildOverviewMetricTiles` for the metric strip.
- Replace the first-screen hero/action layout with:

```tsx
<section className="space-y-3 pb-4">
  <PageHeader
    eyebrow="Overview"
    title="概览"
    description="容量、媒体分布、趋势、风险与最近活动"
    chips={dashboardError ? <StatusBadge tone="warning">部分数据不可用</StatusBadge> : <StatusBadge tone="success">数据已更新</StatusBadge>}
    actions={...}
  />
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
    {metricTiles.map((tile) => (
      <MetricTile key={tile.key} label={tile.label} value={tile.value} description={tile.description} tone={tile.tone} />
    ))}
  </div>
  <div className="grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.75fr)]">
    <section className="mp-panel p-4">媒体日期分布和趋势</section>
    <aside className="grid gap-3">容量风险、运行中、同步摘要</aside>
  </div>
  <div className="grid gap-3 xl:grid-cols-2">
    <section className="mp-panel p-4">存储媒体分布</section>
    <section className="mp-panel p-4">同步拓扑摘要</section>
  </div>
</section>
```

Keep existing data loading, relation graph, heatmap, pie chart, and manual sync handlers. Move them into the new sections without changing API calls.

- [ ] **Step 6: Remove remaining card-inside-card patterns from Dashboard**

In `dashboard-page.tsx`, replace nested `rounded-xl border ... bg-[var(--ark-surface-soft)]` containers inside `mp-panel` with unframed rows or `border-t` sections. Keep repeated storage rows as item cards only when they are list items.

Run:

```bash
rg -n "mp-panel.*\\n|rounded-2xl|radial-gradient|mp-panel p-4.*mp-panel" apps/web/src/pages/dashboard-page.tsx
```

Expected: no `rounded-2xl` and no decorative `radial-gradient`.

- [ ] **Step 7: Run tests and build**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/dashboard-page-model.test.ts
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/dashboard-page.tsx apps/web/src/pages/dashboard-page-model.ts apps/web/src/pages/dashboard-page-model.test.ts
git commit -m "feat(web): redesign overview analytics board"
```

## Task 7: Media Library Redesign

**Files:**
- Create: `apps/web/src/pages/media-page-model.ts`
- Create: `apps/web/src/pages/media-page-model.test.ts`
- Modify: `apps/web/src/pages/media-page.tsx`
- Modify: `apps/web/src/pages/media/media-sidebar.tsx`
- Modify: `apps/web/src/pages/media/media-grid.tsx`
- Modify: `apps/web/src/pages/media/media-preview-dialog.tsx`

- [ ] **Step 1: Write media model tests**

Create `apps/web/src/pages/media-page-model.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getMediaGridColumns, getMediaLibraryStatusText, normalizeThumbSize } from "./media-page-model";

test("thumbnail size is clamped for stable grid layout", () => {
  assert.equal(normalizeThumbSize(80), 110);
  assert.equal(normalizeThumbSize(170), 170);
  assert.equal(normalizeThumbSize(400), 260);
});

test("grid columns adapt for mobile and desktop", () => {
  assert.equal(getMediaGridColumns(360, 140), 2);
  assert.equal(getMediaGridColumns(820, 170), 4);
  assert.equal(getMediaGridColumns(1440, 190), 7);
});

test("status text includes loaded and filtered counts", () => {
  assert.equal(getMediaLibraryStatusText({ loaded: 300, total: 1200, filtered: 82 }), "已加载 300/1,200 · 筛选后 82");
});
```

- [ ] **Step 2: Run media model test and verify failure**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/media-page-model.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement media page model**

Create `apps/web/src/pages/media-page-model.ts`:

```ts
export function normalizeThumbSize(input: number): number {
  return Math.max(110, Math.min(260, Number(input) || 170));
}

export function getMediaGridColumns(containerWidth: number, thumbSize: number): number {
  const normalizedWidth = Math.max(0, Number(containerWidth) || 0);
  const normalizedThumb = normalizeThumbSize(thumbSize);
  if (normalizedWidth < 480) return Math.max(2, Math.floor(normalizedWidth / Math.max(130, normalizedThumb * 0.78)) || 2);
  return Math.max(2, Math.floor(normalizedWidth / normalizedThumb));
}

export function getMediaLibraryStatusText(input: { loaded: number; total: number; filtered: number }): string {
  return `已加载 ${input.loaded.toLocaleString("zh-CN")}/${input.total.toLocaleString("zh-CN")} · 筛选后 ${input.filtered.toLocaleString("zh-CN")}`;
}
```

- [ ] **Step 4: Run media model test and verify pass**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/media-page-model.test.ts
```

Expected: PASS for 3 tests.

- [ ] **Step 5: Redesign `MediaPage` shell**

In `apps/web/src/pages/media-page.tsx`:

- Replace `SectionCard` wrapper with `PageHeader` plus a two-pane workspace.
- Use `StateBlock` for no storage and error states.
- Use `Drawer` for mobile filters if `window.matchMedia("(max-width: 767px)")` is true, or CSS-only `md:hidden` filter trigger.
- Keep existing state, filtering, preview, hotkeys, long press, and API calls.

Use structure:

```tsx
<section className="flex min-h-0 flex-col gap-3 pb-4 md:h-full">
  <PageHeader ... />
  {error ? <InlineAlert tone="error" onClose={() => setError("")}>{error}</InlineAlert> : null}
  <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[280px_minmax(0,1fr)]">
    <MediaSidebar ... />
    <section className="mp-panel flex min-h-[58vh] min-w-0 flex-col p-3 md:min-h-0">...</section>
  </div>
</section>
```

- [ ] **Step 6: Redesign `MediaSidebar`**

In `apps/web/src/pages/media/media-sidebar.tsx`:

- Use `Field`, `SegmentedControl`, and `Button`.
- Remove `mp-panel mp-panel-soft` root if it is inside a parent panel; use `className="mp-sidebar-panel"` or a single `mp-panel`.
- Keep storage selector, kind filter, date range, thumb size, search, refresh.
- Ensure every label has `htmlFor`.
- Keep 115 cloud unsupported message visible with `StatusBadge tone="info"`.

- [ ] **Step 7: Redesign `MediaGrid`**

In `apps/web/src/pages/media/media-grid.tsx`:

- Use `rounded-md` or `rounded-lg`, not `rounded-xl`.
- Keep image/video loading behavior and broken thumb handling.
- Keep overlay text readable, but reduce gradient to a small bottom scrim only when needed for filename contrast.
- Add `aria-label` to thumbnail buttons: `打开 ${item.file.name}`.
- Use `StateBlock` for empty and loading states.

- [ ] **Step 8: Redesign `MediaPreviewDialog`**

In `apps/web/src/pages/media/media-preview-dialog.tsx`:

- Keep focus trap and hotkeys.
- Use `Modal` on desktop and a full-screen fixed surface on mobile.
- Ensure close, previous, next, info, and Live Photo controls have `aria-label`.
- Keep metadata area scrollable and not overlapping the viewer.

- [ ] **Step 9: Run tests and build**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/media-page-model.test.ts
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/pages/media-page.tsx apps/web/src/pages/media-page-model.ts apps/web/src/pages/media-page-model.test.ts apps/web/src/pages/media
git commit -m "feat(web): redesign media library"
```

## Task 8: Sync Workflow Page

**Files:**
- Create or modify: `apps/web/src/pages/sync-page.tsx`
- Create or modify: `apps/web/src/pages/sync-page-model.ts`
- Create or modify: `apps/web/src/pages/sync-page-model.test.ts`
- Modify: `apps/web/src/pages/job-diff-page.tsx`
- Modify: `apps/web/src/pages/jobs-page.tsx`
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/pages/settings-layout-page.tsx`

- [ ] **Step 1: Write sync page model tests**

Create `apps/web/src/pages/sync-page-model.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { getSyncTabFromSearch, setSyncTabInSearch, syncTabValues } from "./sync-page-model";

test("sync tab defaults to diff", () => {
  assert.equal(getSyncTabFromSearch(""), "diff");
  assert.equal(getSyncTabFromSearch("?tab=jobs"), "jobs");
  assert.equal(getSyncTabFromSearch("?tab=running"), "running");
  assert.equal(getSyncTabFromSearch("?tab=bad"), "diff");
});

test("sync tab values stay in IA order", () => {
  assert.deepEqual(syncTabValues, ["diff", "jobs", "running"]);
});

test("setSyncTabInSearch writes stable query string", () => {
  assert.equal(setSyncTabInSearch("?foo=bar", "jobs"), "?foo=bar&tab=jobs");
  assert.equal(setSyncTabInSearch("?tab=diff", "running"), "?tab=running");
});
```

- [ ] **Step 2: Run sync model tests and verify failure**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/sync-page-model.test.ts
```

Expected: FAIL until `sync-page-model.ts` is implemented.

- [ ] **Step 3: Implement sync page model**

Create `apps/web/src/pages/sync-page-model.ts`:

```ts
import type { SyncTabValue } from "../navigation/navigation-model";

export const syncTabValues: SyncTabValue[] = ["diff", "jobs", "running"];

export function getSyncTabFromSearch(search: string): SyncTabValue {
  const params = new URLSearchParams(search);
  const raw = params.get("tab");
  return syncTabValues.includes(raw as SyncTabValue) ? (raw as SyncTabValue) : "diff";
}

export function setSyncTabInSearch(search: string, tab: SyncTabValue): string {
  const params = new URLSearchParams(search);
  params.set("tab", tab);
  const next = params.toString();
  return next ? `?${next}` : "";
}
```

- [ ] **Step 4: Run sync model tests and verify pass**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/sync-page-model.test.ts
```

Expected: PASS for 3 tests.

- [ ] **Step 5: Implement `SyncPage` tabs**

Replace `apps/web/src/pages/sync-page.tsx` with:

```tsx
import { useLocation, useNavigate } from "react-router-dom";
import { PageHeader } from "../components/ui/page-header";
import { SegmentedControl } from "../components/ui/segmented-control";
import { syncTabs } from "../navigation/navigation-model";
import { JobDiffPage } from "./job-diff-page";
import { JobsPage } from "./jobs-page";
import { getSyncTabFromSearch, setSyncTabInSearch } from "./sync-page-model";

export function SyncPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = getSyncTabFromSearch(location.search);

  return (
    <section className="flex min-h-0 flex-col gap-3 pb-4 md:h-full">
      <PageHeader
        eyebrow="Sync"
        title="同步"
        description="差异检查、同步任务与执行中队列"
        chips={
          <SegmentedControl
            ariaLabel="同步视图"
            value={activeTab}
            items={syncTabs.map((tab) => ({ value: tab.value, label: tab.label }))}
            onChange={(next) => navigate({ pathname: "/sync", search: setSyncTabInSearch(location.search, next) })}
          />
        }
      />
      <div className="min-h-0 flex-1">
        {activeTab === "diff" ? <JobDiffPage embedded /> : null}
        {activeTab === "jobs" ? <JobsPage embedded /> : null}
        {activeTab === "running" ? <JobDiffPage embedded initialPanel="running" /> : null}
      </div>
    </section>
  );
}
```

Then update `JobDiffPage` props to accept:

```ts
type JobDiffPageProps = {
  embedded?: boolean;
  initialPanel?: "diff" | "running";
};

export function JobDiffPage({ embedded = false, initialPanel = "diff" }: JobDiffPageProps) {
  ...
}
```

Update `JobsPage` props:

```ts
type JobsPageProps = {
  embedded?: boolean;
};

export function JobsPage({ embedded = false }: JobsPageProps) {
  ...
}
```

When `embedded` is true, neither page should render a page-level `SectionCard` title that duplicates the Sync header.

- [ ] **Step 6: Move job settings out of settings navigation**

In `apps/web/src/pages/settings-layout-page.tsx`, import `settingsNavItems` from navigation model and remove the local `tabs` array. Render only notifications, storage, and advanced.

In `apps/web/src/app.tsx`, ensure:

```tsx
<Route path="jobs" element={<Navigate to="/sync?tab=jobs" replace />} />
<Route path="settings/jobs" element={<Navigate to="/sync?tab=jobs" replace />} />
```

- [ ] **Step 7: Redesign Diff tab inside `JobDiffPage`**

In `apps/web/src/pages/job-diff-page.tsx`:

- Replace page-level `SectionCard` with `mp-panel` sections if `embedded` is true.
- Keep diff loading, caching, virtual grid, preview, sync file, delete file, and run sync behavior.
- Desktop layout: top toolbar, two synchronized diff grids, right detail/action panel.
- Mobile layout: one grid/list first, detail opens in drawer.
- Convert status filter buttons to `SegmentedControl`.
- Convert long-loading hint to `StateBlock tone="loading"`.

- [ ] **Step 8: Redesign Jobs tab inside `JobsPage`**

In `apps/web/src/pages/jobs-page.tsx`:

- Keep job create/update/delete/run APIs.
- Use `Field`, `PathPicker`, `SegmentedControl`, `DataTable`, `MobileList`, and `Modal` or `Drawer`.
- Move the form into a panel/drawer so the job list stays readable.
- Show source/destination actual paths in both desktop and mobile rows.
- Preserve `buildJobPayload` from `jobs-page-model.ts`.

- [ ] **Step 9: Implement Running tab**

For the first pass, `initialPanel="running"` may render a focused execution list using the existing `getJobExecutions` polling logic. It must include:

- queued/running state
- progress phase and percent
- current path
- cancel button
- link to related job

- [ ] **Step 10: Run sync tests and verification**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/sync-page-model.test.ts apps/web/src/pages/jobs-page-model.test.ts
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/pages/sync-page.tsx apps/web/src/pages/sync-page-model.ts apps/web/src/pages/sync-page-model.test.ts apps/web/src/pages/job-diff-page.tsx apps/web/src/pages/jobs-page.tsx apps/web/src/app.tsx apps/web/src/pages/settings-layout-page.tsx
git commit -m "feat(web): introduce sync workflow"
```

## Task 9: Records Page Redesign

**Files:**
- Create: `apps/web/src/pages/records-page-model.ts`
- Create: `apps/web/src/pages/records-page-model.test.ts`
- Modify: `apps/web/src/pages/backups-page.tsx`

- [ ] **Step 1: Write records model tests**

Create `apps/web/src/pages/records-page-model.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildRunSummaryTiles, getRunTone } from "./records-page-model";

test("run tone maps statuses to semantic tones", () => {
  assert.equal(getRunTone("success"), "success");
  assert.equal(getRunTone("running"), "info");
  assert.equal(getRunTone("queued"), "info");
  assert.equal(getRunTone("failed"), "danger");
});

test("summary tiles include audit-oriented metrics", () => {
  const tiles = buildRunSummaryTiles([
    { status: "success", copiedCount: 12, skippedCount: 3, errorCount: 0, durationMs: 2000 },
    { status: "failed", copiedCount: 2, skippedCount: 0, errorCount: 1, durationMs: 3000 }
  ]);
  assert.deepEqual(tiles.map((tile) => tile.key), ["total", "success", "failed", "files", "errors", "averageDuration"]);
  assert.equal(tiles.find((tile) => tile.key === "failed")?.value, "1");
});
```

- [ ] **Step 2: Run records model tests and verify failure**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/records-page-model.test.ts
```

Expected: FAIL with module not found.

- [ ] **Step 3: Implement records model**

Create `apps/web/src/pages/records-page-model.ts`:

```ts
type RunStatus = "queued" | "running" | "success" | "failed";

export type RunSummaryInput = {
  status: RunStatus;
  copiedCount: number;
  skippedCount: number;
  errorCount: number;
  durationMs: number | null;
};

export function getRunTone(status: RunStatus): "success" | "info" | "danger" {
  if (status === "success") return "success";
  if (status === "queued" || status === "running") return "info";
  return "danger";
}

export function buildRunSummaryTiles(runs: RunSummaryInput[]) {
  const success = runs.filter((run) => run.status === "success").length;
  const failed = runs.filter((run) => run.status === "failed").length;
  const files = runs.reduce((sum, run) => sum + run.copiedCount + run.skippedCount, 0);
  const errors = runs.reduce((sum, run) => sum + run.errorCount, 0);
  const durations = runs.map((run) => run.durationMs).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const averageDuration = durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length / 1000) : 0;
  return [
    { key: "total", label: "执行记录", value: String(runs.length), tone: "neutral" as const },
    { key: "success", label: "成功", value: String(success), tone: "success" as const },
    { key: "failed", label: "失败", value: String(failed), tone: failed > 0 ? "danger" as const : "success" as const },
    { key: "files", label: "处理文件", value: files.toLocaleString("zh-CN"), tone: "info" as const },
    { key: "errors", label: "错误", value: String(errors), tone: errors > 0 ? "danger" as const : "success" as const },
    { key: "averageDuration", label: "平均耗时", value: `${averageDuration}s`, tone: "neutral" as const }
  ];
}
```

- [ ] **Step 4: Run records model tests and verify pass**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/records-page-model.test.ts
```

Expected: PASS for 2 tests.

- [ ] **Step 5: Redesign `BackupsPage` as Records**

In `apps/web/src/pages/backups-page.tsx`:

- Use `PageHeader` title `记录`.
- Use `MetricTile` summary strip from `buildRunSummaryTiles`.
- Use `DataTable` for desktop rows and `MobileList` for mobile rows.
- Show status with `StatusBadge`.
- Keep existing run deletion, preview links, pagination, filtering, and error rendering.
- Make failures expandable or visually prominent with a bordered error section inside the row/card.

- [ ] **Step 6: Run tests and build**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/records-page-model.test.ts
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/pages/backups-page.tsx apps/web/src/pages/records-page-model.ts apps/web/src/pages/records-page-model.test.ts
git commit -m "feat(web): redesign records audit page"
```

## Task 10: Settings Redesign

**Files:**
- Modify: `apps/web/src/pages/settings-layout-page.tsx`
- Modify: `apps/web/src/pages/storages-page.tsx`
- Modify: `apps/web/src/pages/settings-page.tsx`
- Modify: `apps/web/src/pages/advanced-settings-page.tsx`
- Modify: `apps/web/src/components/path-picker.tsx`

- [ ] **Step 1: Verify settings navigation test still passes**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/navigation/navigation-model.test.ts
```

Expected: PASS and settings nav paths are `/settings`, `/settings/storages`, `/settings/advanced`.

- [ ] **Step 2: Redesign `SettingsLayoutPage`**

Use `settingsNavItems` from `navigation-model.ts`. Desktop layout:

```tsx
<section className="grid gap-3 pb-4 lg:grid-cols-[248px_minmax(0,1fr)]">
  <aside className="mp-panel p-3">...</aside>
  <div className="min-w-0"><Outlet /></div>
</section>
```

Mobile layout:

```tsx
<nav className="flex items-center gap-2 overflow-x-auto pb-1">
  ...
</nav>
```

Use `rounded-md`, not `rounded-xl`.

- [ ] **Step 3: Redesign notification settings**

In `apps/web/src/pages/settings-page.tsx`:

- Use `PageHeader` with title `通知`.
- Use `Field` for Telegram token, chat id, proxy URL, and enable checkbox.
- Keep existing save/test API behavior.
- Use `InlineAlert` for save/test errors and success.
- Replace fieldsets styled as `mp-subtle-card` with single `mp-panel` sections or unframed field groups.

- [ ] **Step 4: Redesign storage settings**

In `apps/web/src/pages/storages-page.tsx`:

- Use `PageHeader` with title `存储配置`.
- Use summary `MetricTile` row for storage count, local count, cloud count, capacity known count.
- Use `DataTable` and `MobileList` for storage rows.
- Use `Modal` or `Drawer` for create/edit form.
- Keep capacity fetching, create, delete, encryption toggle, and path selection.
- Ensure storage row shows name, type, base path, encryption, capacity, and actions in one scan-friendly row.

- [ ] **Step 5: Redesign advanced settings**

In `apps/web/src/pages/advanced-settings-page.tsx`:

- Use `PageHeader` with title `高级配置`.
- Put media index status in one `mp-panel`.
- Use warning `StatusBadge` and `InlineAlert` before rebuild actions.
- Keep rebuild API behavior and copy.

- [ ] **Step 6: Update `PathPicker` density**

In `apps/web/src/components/path-picker.tsx`:

- Keep typed path editable for cloud storage.
- Keep browse disabled separately from input disabled.
- Replace `rounded-xl` and nested card style with `rounded-md` and `mp-panel-soft`.
- Ensure the browse button has `aria-expanded={open}`.

- [ ] **Step 7: Run typecheck and build**

Run:

```bash
npm run typecheck
npm run build
```

Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/settings-layout-page.tsx apps/web/src/pages/storages-page.tsx apps/web/src/pages/settings-page.tsx apps/web/src/pages/advanced-settings-page.tsx apps/web/src/components/path-picker.tsx
git commit -m "feat(web): redesign settings workflows"
```

## Task 11: Login and Bootstrap Redesign

**Files:**
- Modify: `apps/web/src/pages/login-page.tsx`

- [ ] **Step 1: Create login render test**

Create `apps/web/src/pages/login-page-render.test.tsx`:

```tsx
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LoginPage } from "./login-page";

test("login page keeps product identity and form entry", () => {
  const html = renderToStaticMarkup(<LoginPage onAuthenticated={() => undefined} />);
  assert.match(html, /PhotoArk/);
  assert.match(html, /用户名/);
  assert.match(html, /密码/);
});
```

- [ ] **Step 2: Run login render test**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/login-page-render.test.tsx
```

Expected: PASS before and after the redesign; it protects auth form presence.

- [ ] **Step 3: Replace landing-style split hero**

In `apps/web/src/pages/login-page.tsx`:

- Remove radial background gradients and decorative orb divs.
- Replace large `panelHero` split with centered operational login layout:

```tsx
<div className="min-h-screen bg-[var(--ark-bg)] px-4 py-8 text-[var(--ark-ink)]">
  <main className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-[960px] items-center gap-4 md:grid-cols-[minmax(0,0.9fr)_420px]">
    <section className="hidden md:block">compact product identity and system capability list</section>
    <Card variant="panel" className="p-5">auth form</Card>
  </main>
</div>
```

- Keep `getAuthStatus`, bootstrap, login, token storage, error handling, and `onAuthenticated`.
- Use `Field` for username/password/confirm password.
- Keep submit button full width.
- Keep password guidance as `InlineAlert tone="info"` for bootstrap only.

- [ ] **Step 4: Run tests and build**

Run:

```bash
./node_modules/.bin/tsx --test apps/web/src/pages/login-page-render.test.tsx
npm run typecheck
npm run build
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/login-page.tsx apps/web/src/pages/login-page-render.test.tsx
git commit -m "feat(web): redesign login experience"
```

## Task 12: Root Test Script and Full Verification

**Files:**
- Modify: `package.json`
- Modify: `apps/web/package.json`
- Modify: `package-lock.json`
- Modify if npm updates it: `pnpm-lock.yaml`

- [ ] **Step 1: Update test scripts**

Update root `package.json` test script to include all web UI model/render tests plus existing API tests:

```json
"test": "tsx --test apps/api/src/modules/media/media-query.test.ts apps/api/src/modules/backup/job-diff-cache.test.ts apps/web/src/navigation/navigation-model.test.ts apps/web/src/components/ui/design-tokens.test.ts apps/web/src/components/ui/primitives-render.test.tsx apps/web/src/components/data/data-components-render.test.tsx apps/web/src/pages/jobs-page-model.test.ts apps/web/src/pages/sync-page-model.test.ts apps/web/src/pages/dashboard-page-model.test.ts apps/web/src/pages/media-page-model.test.ts apps/web/src/pages/records-page-model.test.ts apps/web/src/pages/login-page-render.test.tsx"
```

Update `apps/web/package.json` test script:

```json
"test": "tsx --test src/navigation/navigation-model.test.ts src/components/ui/design-tokens.test.ts src/components/ui/primitives-render.test.tsx src/components/data/data-components-render.test.tsx src/pages/jobs-page-model.test.ts src/pages/sync-page-model.test.ts src/pages/dashboard-page-model.test.ts src/pages/media-page-model.test.ts src/pages/records-page-model.test.ts src/pages/login-page-render.test.tsx"
```

- [ ] **Step 2: Run dependency lock update if package files changed**

Run:

```bash
npm install --package-lock-only
```

Expected: command exits 0. If npm prints audit warnings, record the counts in the final implementation summary.

- [ ] **Step 3: Run full automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

Expected:

- `npm test`: all suites pass.
- `npm run typecheck`: exits 0.
- `npm run build`: exits 0.
- `git diff --check`: no output.

- [ ] **Step 4: Run static visual grep checks**

Run:

```bash
rg -n "radial-gradient|rounded-2xl|tracking-\\[-|letter-spacing: -|bg-gradient-to-r|from-\\[var\\(--ark-primary\\)\\] to-\\[var\\(--ark-primary-strong\\)\\]" apps/web/src
```

Expected: no matches except chart-specific SVG gradients or intentional small media thumbnail scrims. If matches appear in page layout, shell, login, cards, panels, or buttons, replace them with tokenized surfaces.

- [ ] **Step 5: Browser QA**

Start the dev server:

```bash
npm run dev -w @photoark/web
```

Open these routes at desktop 1440x900 and mobile 390x844:

- `/`
- `/media`
- `/sync`
- `/sync?tab=jobs`
- `/sync?tab=running`
- `/records`
- `/settings`
- `/settings/storages`
- `/settings/advanced`
- `/diff`
- `/jobs`
- `/settings/jobs`
- `/storages`

Expected:

- primary navigation uses `概览 / 媒体库 / 同步 / 记录 / 配置`
- legacy routes redirect correctly
- no bottom nav overlap on mobile
- no text clipping in buttons, cards, tables, forms, or nav
- no card-inside-card layouts
- no decorative orb or page background gradients
- loading, empty, error, and long-loading states are visually distinct

- [ ] **Step 6: Commit final verification changes**

```bash
git add package.json apps/web/package.json package-lock.json pnpm-lock.yaml
git commit -m "test(web): include UI redesign verification"
```

If `pnpm-lock.yaml` is unchanged, omit it from `git add`.

## Self-Review Results

- Spec coverage: The plan covers information architecture, visual tokens, primitives, app shell, overview, media, sync, records, settings, login, mobile behavior, route compatibility, tests, and browser QA from the approved spec.
- Placeholder scan: No task uses unresolved placeholder markers or open-ended placeholder instructions.
- Type consistency: Navigation tab values are `diff`, `jobs`, and `running` across `navigation-model.ts`, `sync-page-model.ts`, and `sync-page.tsx`. Shared component names match the file structure.
