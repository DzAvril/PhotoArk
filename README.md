# PhotoArk

PhotoArk 是一个面向 NAS 场景的照片备份与多目标同步平台，支持：
- NAS 多存储目标（内置硬盘、外接 SSD、115 网盘等）
- 定时任务与文件监听两种同步模式
- 本地到网盘加密备份
- iOS Live Photo 感知备份/恢复
- WebUI 可视化配置、状态监控、备份浏览
- Telegram 告警/通知

## 项目命名
- 最终命名：`PhotoArk`
- 释义：像“方舟”一样把照片与 Live Photo 安全迁移到多个存储目标。

## 仓库结构

```text
apps/
  api/      # 控制面 API（配置、任务、预览、解密代理）
  worker/   # 数据面执行器（定时任务、fs watcher、同步与校验）
  web/      # WebUI
packages/
  shared/   # 共享类型与契约
docs/
  architecture.md
  live-photo-strategy.md
  roadmap.md
  security.md
```

## 本地开发

```bash
cp .env.example .env
# 生成 32 字节主密钥（示例）
# openssl rand -base64 32

npm install
npm run dev
```

或使用 Docker：

```bash
docker compose pull
docker compose up -d
```

## WebUI 路由与联调
- 路由：`/`（总览）、`/storages`、`/jobs`、`/backups`
- API 基地址：`VITE_API_BASE_URL`（默认 `http://localhost:8080`）
- 当前已联调接口：
  - `GET /api/metrics`
  - `GET /api/storages`
  - `GET /api/jobs`
  - `GET /api/backups`
  - `POST /api/backups/:assetId/preview-token`
  - `GET /api/backups/:assetId/preview?token=...`
  - `GET /api/storages/:storageId/directories?path=...`
  - `GET /api/storages/:storageId/media?path=...`

## API 持久化状态
- 当前 API 使用文件持久化（便于本地调试）：
  - 状态文件默认：`/Users/xuzhi/Documents/workspace/new_project/apps/api/data/backup-state.json`
  - 可通过环境变量 `BACKUP_STATE_FILE` 覆盖
- WebUI 本地目录下拉浏览范围可通过 `FS_BROWSE_ROOT` 限制（默认 `/`）

## Docker Hub 自动发布
- 已配置 GitHub Actions 工作流：`/Users/xuzhi/Documents/workspace/new_project/.github/workflows/docker-publish.yml`
- 触发条件：
  - push 到 `main`
  - push tag（`v*.*.*`）
  - 手动触发（workflow_dispatch）
- 构建策略：
  - 按路径变更选择性构建单镜像（`apps/api/**` 或 `apps/web/**` 变更均会构建）
  - tag 与手动触发会构建该单镜像
- 需要在 GitHub 仓库 `Environment: BuildImage` 下配置 Secrets：
  - `DOCKERHUB_USERNAME`
  - `DOCKERHUB_TOKEN`
  - `TELEGRAM_BOT_TOKEN`（可选）
  - `TELEGRAM_CHAT_ID`（可选）
- 兼容读取顺序：
  - 优先读取 `secrets.DOCKERHUB_USERNAME` / `secrets.DOCKERHUB_TOKEN`
  - 若 secrets 为空，会回退读取 `vars.DOCKERHUB_USERNAME` / `vars.DOCKERHUB_TOKEN`
  - Telegram 同样支持 `secrets` 优先、`vars` 回退
- 产物镜像：
  - `dzavril/photoark`
- 若配置 Telegram，镜像构建成功后会发送通知，包含镜像 tag 与本次更新摘要
 - 更新摘要默认取“上一次成功构建”到“本次构建”之间的 commit 列表

## 当前状态
- 已完成：项目初始化、架构文档、核心模块骨架（存储适配/加密/Live Photo 配对/通知）
- 已完成：WebUI 升级为现代技术栈（React + TypeScript + Tailwind + Framer Motion + PWA）
- 下一步：按 `docs/roadmap.md` 实施 P1（真实存储适配 + 任务编排 + 预览链路）
