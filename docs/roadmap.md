# Roadmap

## P0（已完成）项目初始化
- monorepo + docker compose
- api/web/worker 基础骨架
- 存储抽象、加密服务、Live Photo 检测雏形
- 架构/安全/策略文档

## P1（进行中）核心链路可用
- 接入 PostgreSQL + 迁移脚本
- 完成 `storage_targets` / `backup_jobs` / `backup_assets` 表
- 实现定时任务与目录监听任务执行
- 完成 LocalFs 适配器递归扫描 + 增量同步
- 打通 Telegram 通知（任务成功/失败）

## P2 115 云盘与加密预览
- 完成 Cloud115 适配器读写
- 对接本地->115 加密上传
- API 实现一次性 token 解密流预览
- 前端实现照片列表、详情预览、Live Photo 联动播放

## P3 恢复与可靠性
- 一键恢复流程（按任务/按时间点）
- Live Photo 恢复一致性校验
- 重试、断点续传、限速、并发配置
- 观测：任务指标、耗时、失败原因聚合

## P4 生产化
- 多租户/多用户权限
- 审计日志、操作留痕
- 更细粒度告警策略
