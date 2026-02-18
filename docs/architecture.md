# 整体架构

## 1. 架构分层

- Control Plane (`apps/api`):
  - 存储目标管理、任务编排配置、策略配置
  - 备份索引查询、预览授权、解密代理
  - Telegram 通知入口
- Data Plane (`apps/worker`):
  - 定时触发（cron）与文件监听（fs watcher）
  - 文件扫描、增量对比、去重校验、上传/下载
  - 加密/解密与完整性校验
- UI Plane (`apps/web`):
  - 可视化配置（目标存储、任务、策略）
  - 任务运行状态、日志、告警
  - 备份浏览与 Live Photo 预览

## 2. 存储抽象

统一 `StorageAdapter`：
- `listFiles(prefix)`
- `readFile(path)`
- `writeFile(path, data)`
- `ensureDir(path)`

适配器实现：
- `LocalFsAdapter`: NAS 本地硬盘与外接 SSD
- `Cloud115Adapter`: 115 网盘（后续接入 SDK 或 rclone backend）

## 3. 同步模型

- Job = Source + Destination + Trigger + Policy
- Trigger:
  - `schedule`（cron）
  - `watch`（目录监听）
- Policy:
  - 加密策略（是否加密、密钥版本）
  - Live Photo 策略（配对保存、恢复合并）
  - 冲突策略（时间戳优先/版本保留）

## 4. 预览模型（关键）

WebUI 支持备份浏览与预览（建议支持）：
- 对未加密对象：直接签名 URL 预览
- 对加密对象（115）：
  - API 鉴权后短时解密到内存流
  - 生成一次性访问令牌
  - 前端仅通过一次性 URL 拉取
  - 令牌过期立即失效，不落地明文

## 5. 数据索引

建议表：
- `storage_targets`
- `backup_jobs`
- `backup_runs`
- `backup_assets`
- `live_photo_links`（image + mov 绑定）
- `key_versions`

